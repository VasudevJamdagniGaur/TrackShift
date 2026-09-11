"""
Strict motorcycle ↔ rider association.

Helmet / pose / plate OCR must only run after RIDER_CONFIRMED.
Empty or parked motorcycles with no sitting rider stay NO_RIDER.
"""

from __future__ import annotations

from typing import Any

from .utils import box_center, iou

RIDER_NO_RIDER = "NO_RIDER"
RIDER_CANDIDATE = "RIDER_CANDIDATE"
RIDER_CONFIRMED = "RIDER_CONFIRMED"
RIDER_LOST = "RIDER_LOST"
RIDER_UNCERTAIN = "RIDER_UNCERTAIN"


def expand_moto_roi(moto_box, expand: float) -> list[float]:
    """Contextual ROI around motorcycle for person search (not full-frame)."""
    mx1, my1, mx2, my2 = moto_box
    mw, mh = max(1.0, mx2 - mx1), max(1.0, my2 - my1)
    # Prefer upward/side expansion (rider torso/head); slight downward for legs
    return [
        mx1 - expand * mw,
        my1 - expand * mh * 1.15,
        mx2 + expand * mw,
        my2 + expand * mh * 0.35,
    ]


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def rider_association_score(
    moto_box,
    person: dict,
    *,
    expand: float = 0.45,
    last_rider_box=None,
    last_person_track_id: int | None = None,
) -> dict[str, Any]:
    """
    Multi-factor rider score in [0, 1].

    Factors: distance, ROI overlap, center location, vertical pose,
    bbox size, temporal IoU, track id consistency.
    """
    pb = person["box"]
    mx1, my1, mx2, my2 = moto_box
    mw, mh = max(1.0, mx2 - mx1), max(1.0, my2 - my1)
    mx, my = box_center(moto_box)
    px, py = box_center(pb)
    pw, ph = max(1.0, pb[2] - pb[0]), max(1.0, pb[3] - pb[1])
    roi = expand_moto_roi(moto_box, expand)

    # Hard reject: person outside motorcycle context ROI
    center_in_roi = roi[0] <= px <= roi[2] and roi[1] <= py <= roi[3]
    overlap_roi = iou(pb, roi)
    if not center_in_roi and overlap_roi < 0.02:
        return {
            "score": 0.0,
            "reject": "outside_roi",
            "factors": {},
            "roi": roi,
        }

    # 1) Distance (normalized by moto size)
    dist = (((px - mx) ** 2 + (py - my) ** 2) ** 0.5) / max(mw, mh)
    f_dist = _clamp01(1.0 - dist / 1.35)

    # 2) Overlap with expanded ROI / motorcycle
    f_overlap = _clamp01(0.55 * overlap_roi + 0.45 * iou(pb, moto_box) * 2.0)

    # 3) Person center relative to motorcycle (prefer interior / slightly above center)
    # Lateral: within moto width (+ margin)
    lat = abs(px - mx) / (mw * 0.5)
    f_center_x = _clamp01(1.0 - max(0.0, lat - 0.35) / 1.4)
    # Vertical: rider center typically from mid-moto upward into upper region
    rel_y = (py - my1) / mh  # 0 at top of moto, 1 at bottom
    # Ideal ~0.15–0.65 (sitting on bike); walking beside often similar y but far x
    if 0.05 <= rel_y <= 0.75:
        f_center_y = 1.0
    elif rel_y < 0.05:
        f_center_y = _clamp01(1.0 - (0.05 - rel_y) * 2.0)
    else:
        f_center_y = _clamp01(1.0 - (rel_y - 0.75) * 2.5)
    f_center = 0.55 * f_center_x + 0.45 * f_center_y

    # 4) Vertical geometry: head/torso above moto mid; reject mostly-below
    person_top = pb[1]
    person_bottom = pb[3]
    moto_mid_y = (my1 + my2) / 2.0
    head_above = person_top < moto_mid_y
    torso_above = py < my2 - 0.15 * mh
    f_vertical = 0.0
    if head_above and torso_above:
        f_vertical = 1.0
    elif head_above:
        f_vertical = 0.65
    elif torso_above:
        f_vertical = 0.35
    if py > my + mh * 0.55:
        f_vertical *= 0.2

    # 5) Size: person should be substantial vs motorcycle (not a distant speck)
    area_ratio = (pw * ph) / max(1.0, mw * mh)
    height_ratio = ph / mh
    if area_ratio < 0.04 or height_ratio < 0.25:
        f_size = 0.05
    elif area_ratio > 4.0 or height_ratio > 3.5:
        f_size = 0.25  # huge person box / wrong association
    else:
        # Ideal person height ~0.6–1.8× moto height for CCTV rider crops
        f_size = _clamp01(1.0 - abs(height_ratio - 1.1) / 1.4)
        f_size = max(f_size, _clamp01(area_ratio / 0.35) * 0.5)

    # 6) Temporal consistency with previous rider box
    if last_rider_box is not None:
        f_temporal = _clamp01(iou(pb, last_rider_box) * 1.8)
    else:
        f_temporal = 0.45  # neutral when no history

    # 7) Track id consistency
    pid = int(person.get("trackId", -1))
    if last_person_track_id is not None and last_person_track_id >= 0 and pid >= 0:
        f_track = 1.0 if pid == last_person_track_id else 0.15
    else:
        f_track = 0.5

    # Person detector confidence (secondary)
    f_conf = _clamp01(float(person.get("confidence") or 0.0))

    # Standing/walking beside: strong lateral offset + low moto IoU
    moto_iou = iou(pb, moto_box)
    if lat > 1.15 and moto_iou < 0.08:
        f_center *= 0.15
        f_overlap *= 0.25

    # Weighted blend → [0, 1]
    score = (
        0.16 * f_dist
        + 0.18 * f_overlap
        + 0.16 * f_center
        + 0.16 * f_vertical
        + 0.12 * f_size
        + 0.10 * f_temporal
        + 0.07 * f_track
        + 0.05 * f_conf
    )
    score = _clamp01(score)

    return {
        "score": round(score, 4),
        "reject": None,
        "roi": roi,
        "factors": {
            "distance": round(f_dist, 4),
            "overlap": round(f_overlap, 4),
            "center": round(f_center, 4),
            "vertical": round(f_vertical, 4),
            "size": round(f_size, 4),
            "temporal": round(f_temporal, 4),
            "track": round(f_track, 4),
            "personConf": round(f_conf, 4),
            "motoIou": round(moto_iou, 4),
            "lateral": round(lat, 4),
        },
    }


def find_best_rider(
    moto_box,
    people: list[dict],
    *,
    expand: float,
    min_score: float,
    person_min_conf: float,
    last_rider_box=None,
    last_person_track_id: int | None = None,
) -> tuple[dict | None, dict]:
    """Return (best_person_or_None, association_detail)."""
    if not people:
        return None, {"score": 0.0, "reject": "no_people", "factors": {}}

    best_person = None
    best_detail: dict = {"score": 0.0, "reject": "none_qualified", "factors": {}}

    for person in people:
        pconf = float(person.get("confidence") or 0.0)
        if pconf < person_min_conf * 0.5:
            # Very weak person dets: still score but heavily discounted later
            pass
        detail = rider_association_score(
            moto_box,
            person,
            expand=expand,
            last_rider_box=last_rider_box,
            last_person_track_id=last_person_track_id,
        )
        # Soft-penalize low person confidence
        if pconf < person_min_conf:
            detail = {
                **detail,
                "score": round(detail["score"] * max(0.2, pconf / max(1e-6, person_min_conf)), 4),
            }
        if detail["score"] > best_detail["score"]:
            best_detail = detail
            best_person = person

    if best_person is None or best_detail["score"] < min_score:
        return None, best_detail

    # Person must meet confidence when claiming association
    if float(best_person.get("confidence") or 0.0) < person_min_conf:
        return None, {**best_detail, "reject": "person_conf_low"}

    return best_person, best_detail


def update_rider_state(
    track,
    *,
    person: dict | None,
    assoc: dict,
    frame_idx: int,
    min_score: float,
    min_frames: int,
    lost_grace_frames: int = 8,
) -> str:
    """
    Advance rider state machine on `track`.
    Returns new rider_state.
    """
    score = float(assoc.get("score") or 0.0)
    prev = getattr(track, "rider_state", RIDER_NO_RIDER) or RIDER_NO_RIDER

    if person is not None and score >= min_score:
        pid = int(person.get("trackId", -1))
        same = (
            getattr(track, "rider_person_track_id", None) is not None
            and track.rider_person_track_id >= 0
            and pid >= 0
            and pid == track.rider_person_track_id
        )
        # Spatial continuity if person track ids are unstable
        last_box = getattr(track, "last_rider_box", None)
        spatial_ok = True
        if last_box is not None:
            spatial_ok = iou(person["box"], last_box) >= 0.12 or same

        if same or spatial_ok or track.rider_assoc_frames == 0:
            track.rider_assoc_frames = int(getattr(track, "rider_assoc_frames", 0)) + 1
        else:
            track.rider_assoc_frames = 1

        track.rider_person_track_id = pid
        track.last_rider_box = person["box"]
        track.rider_association_score = score
        track.rider_lost_frames = 0
        track.last_rider_person = person
        track.last_rider_assoc = assoc

        if track.rider_assoc_frames >= min_frames:
            track.rider_state = RIDER_CONFIRMED
            track.rider_confirmed_once = True
        else:
            track.rider_state = RIDER_CANDIDATE
        track.last_rider_frame = frame_idx
        return track.rider_state

    # No qualifying person this frame
    track.rider_association_score = score
    if getattr(track, "rider_confirmed_once", False) or prev in {
        RIDER_CONFIRMED,
        RIDER_LOST,
        RIDER_CANDIDATE,
    }:
        track.rider_lost_frames = int(getattr(track, "rider_lost_frames", 0)) + 1
        track.rider_assoc_frames = 0
        if track.rider_lost_frames <= lost_grace_frames and getattr(
            track, "rider_confirmed_once", False
        ):
            track.rider_state = RIDER_LOST
        elif score >= min_score * 0.7:
            track.rider_state = RIDER_UNCERTAIN
        else:
            track.rider_state = RIDER_NO_RIDER
            track.last_rider_box = None
            track.rider_person_track_id = None
    else:
        track.rider_assoc_frames = 0
        if 0 < score < min_score:
            track.rider_state = RIDER_UNCERTAIN
        else:
            track.rider_state = RIDER_NO_RIDER
            track.last_rider_box = None
            track.rider_person_track_id = None

    return track.rider_state


def can_run_helmet_classifier(
    track,
    *,
    min_score: float,
    person_min_conf: float,
    head_available: bool,
) -> tuple[bool, str]:
    """Hard gate: helmet classifier only for confirmed riders with a head crop."""
    if getattr(track, "rider_state", None) != RIDER_CONFIRMED:
        return False, f"rider_state={getattr(track, 'rider_state', None)}"
    person = getattr(track, "last_rider_person", None)
    if not person:
        return False, "no_person"
    if float(person.get("confidence") or 0.0) < person_min_conf:
        return False, "person_conf"
    if float(getattr(track, "rider_association_score", 0.0) or 0.0) < min_score:
        return False, "assoc_score"
    if not head_available:
        return False, "no_head"
    if person.get("proxy"):
        return False, "proxy_forbidden"
    return True, "ok"
