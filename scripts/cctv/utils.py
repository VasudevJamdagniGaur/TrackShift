"""Helpers: quality scoring, plate validation, image enhancement, head crops."""

from __future__ import annotations

import re
from typing import Any

import cv2
import numpy as np

INDIAN_PLATE_REGEX = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{3,4}$")


def enhance_frame(frame: np.ndarray, enabled: bool) -> np.ndarray:
    """Optional mild enhancement for inference only — originals stay untouched."""
    if not enabled or frame is None or frame.size == 0:
        return frame
    out = frame.copy()
    try:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l2 = clahe.apply(l)
        out = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
        out = cv2.fastNlMeansDenoisingColored(out, None, 3, 3, 7, 21)
    except Exception:
        return frame
    return out


def laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def quality_score(
    frame: np.ndarray,
    box: list[float] | tuple[float, ...],
    det_conf: float = 0.0,
) -> dict[str, float]:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 + 2 or y2 <= y1 + 2:
        return {
            "score": 0.0,
            "sharpness": 0.0,
            "brightness": 0.0,
            "contrast": 0.0,
            "area": 0.0,
            "detConf": float(det_conf),
        }
    crop = frame[y1:y2, x1:x2]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    sharp = laplacian_variance(gray)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    area = float((x2 - x1) * (y2 - y1))
    # Normalize loosely for ranking
    sharp_n = min(1.0, sharp / 400.0)
    bright_n = 1.0 - abs(brightness - 120.0) / 120.0
    bright_n = max(0.0, min(1.0, bright_n))
    contrast_n = min(1.0, contrast / 60.0)
    area_n = min(1.0, area / (w * h * 0.08))
    score = (
        0.35 * sharp_n
        + 0.15 * bright_n
        + 0.15 * contrast_n
        + 0.20 * area_n
        + 0.15 * float(det_conf)
    )
    return {
        "score": round(score, 4),
        "sharpness": round(sharp, 2),
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "area": round(area, 2),
        "detConf": round(float(det_conf), 4),
    }


def clamp_box(x1, y1, x2, y2, w, h):
    x1 = int(max(0, min(w - 1, x1)))
    y1 = int(max(0, min(h - 1, y1)))
    x2 = int(max(0, min(w, x2)))
    y2 = int(max(0, min(h, y2)))
    if x2 <= x1 + 2 or y2 <= y1 + 2:
        return None
    return [x1, y1, x2, y2]


def expand_box(box, expand: float, w: int, h: int):
    x1, y1, x2, y2 = box
    bw, bh = max(1.0, x2 - x1), max(1.0, y2 - y1)
    return clamp_box(
        x1 - expand * bw,
        y1 - expand * bh,
        x2 + expand * bw,
        y2 + expand * bh,
        w,
        h,
    )


def letterbox_square(crop: np.ndarray, size: int = 224) -> np.ndarray:
    """Upscale/pad to square without stretching aspect ratio."""
    if crop is None or crop.size == 0:
        return crop
    ch, cw = crop.shape[:2]
    scale = float(size) / max(ch, cw)
    nh, nw = max(1, int(round(ch * scale))), max(1, int(round(cw * scale)))
    interp = cv2.INTER_CUBIC if scale > 1.0 else cv2.INTER_AREA
    resized = cv2.resize(crop, (nw, nh), interpolation=interp)
    canvas = np.zeros((size, size, 3), dtype=crop.dtype)
    oy, ox = (size - nh) // 2, (size - nw) // 2
    canvas[oy : oy + nh, ox : ox + nw] = resized
    return canvas


def enhance_head_crop(crop: np.ndarray) -> np.ndarray:
    """Mild CLAHE + unsharp for rescue classification only (evidence stays original)."""
    if crop is None or crop.size == 0:
        return crop
    out = crop.copy()
    try:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
        l2 = clahe.apply(l)
        out = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
        blur = cv2.GaussianBlur(out, (0, 0), 1.0)
        out = cv2.addWeighted(out, 1.35, blur, -0.35, 0)
    except Exception:
        return crop
    return out


def fallback_head_box(person_box, frame_w: int, frame_h: int, top_ratio: float, expand: float):
    x1, y1, x2, y2 = person_box
    ph = max(1.0, y2 - y1)
    raw = [x1, y1, x2, y1 + top_ratio * ph]
    box = clamp_box(*raw, frame_w, frame_h)
    if not box:
        return None
    return expand_box(box, expand, frame_w, frame_h)


def crop_from_box(frame: np.ndarray, box) -> np.ndarray | None:
    if not box:
        return None
    x1, y1, x2, y2 = map(int, box)
    crop = frame[y1:y2, x1:x2]
    if crop is None or crop.size == 0:
        return None
    return crop


def prepare_classify_crop(crop: np.ndarray, min_px: int = 96, size: int = 224) -> np.ndarray:
    if crop is None or crop.size == 0:
        return crop
    h, w = crop.shape[:2]
    if min(h, w) < min_px or max(h, w) < size:
        return letterbox_square(crop, size)
    return letterbox_square(crop, size)


def build_head_crop_variants(
    frame: np.ndarray,
    person_box,
    kpts=None,
    top_ratio: float = 0.45,
    top_ratio_tight: float = 0.35,
    expand: float = 0.15,
    min_px: int = 96,
    classify_size: int = 224,
    include_enhanced: bool = True,
) -> list[dict[str, Any]]:
    """
    Multi-crop head bundle for helmet ensemble.
    Sources: pose, fallback 45%, fallback 35%, expanded pose, optional enhanced copies.
    """
    h, w = frame.shape[:2]
    variants: list[dict[str, Any]] = []

    pose_img, pose_box = head_crop_from_keypoints(frame, kpts, person_box)
    if pose_img is not None and pose_box is not None:
        variants.append(
            {
                "source": "POSE",
                "box": pose_box,
                "image": prepare_classify_crop(pose_img, min_px, classify_size),
                "raw": pose_img,
            }
        )
        expanded = expand_box(pose_box, expand, w, h)
        exp_img = crop_from_box(frame, expanded)
        if exp_img is not None:
            variants.append(
                {
                    "source": "POSE_EXPANDED",
                    "box": expanded,
                    "image": prepare_classify_crop(exp_img, min_px, classify_size),
                    "raw": exp_img,
                }
            )

    fb45 = fallback_head_box(person_box, w, h, top_ratio, expand)
    fb45_img = crop_from_box(frame, fb45)
    if fb45_img is not None:
        variants.append(
            {
                "source": "FALLBACK_45",
                "box": fb45,
                "image": prepare_classify_crop(fb45_img, min_px, classify_size),
                "raw": fb45_img,
            }
        )

    fb35 = fallback_head_box(person_box, w, h, top_ratio_tight, expand * 0.8)
    fb35_img = crop_from_box(frame, fb35)
    if fb35_img is not None:
        variants.append(
            {
                "source": "FALLBACK_35",
                "box": fb35,
                "image": prepare_classify_crop(fb35_img, min_px, classify_size),
                "raw": fb35_img,
            }
        )

    if include_enhanced:
        base = list(variants)
        for v in base:
            enh = enhance_head_crop(v["raw"])
            if enh is None or enh.size == 0:
                continue
            variants.append(
                {
                    "source": f"{v['source']}_ENHANCED",
                    "box": v["box"],
                    "image": prepare_classify_crop(enh, min_px, classify_size),
                    "raw": enh,
                }
            )

    # Deduplicate empty
    return [v for v in variants if v.get("image") is not None and v["image"].size > 0]


def moto_proxy_person_box(moto_box, frame_w: int, frame_h: int):
    """When person detector misses the rider, use upper motorcycle region as proxy."""
    x1, y1, x2, y2 = moto_box
    mw, mh = max(1.0, x2 - x1), max(1.0, y2 - y1)
    # Rider typically occupies upper-central portion of moto bbox
    return clamp_box(
        x1 + 0.12 * mw,
        y1,
        x2 - 0.08 * mw,
        y1 + 0.72 * mh,
        frame_w,
        frame_h,
    )


def box_center(box):
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)



def iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    return inter / max(1e-6, area_a + area_b - inter)


def head_crop_from_keypoints(frame, kpts, person_box) -> tuple[Any, list[int] | None]:
    """Aspect-preserving head crop from pose keypoints (nose/eyes/ears)."""
    h, w = frame.shape[:2]
    points = []
    if kpts is not None:
        arr = np.array(kpts).reshape(-1, 3) if np.array(kpts).ndim == 1 else np.array(kpts)
        # COCO: 0 nose, 1/2 eyes, 3/4 ears
        for idx in (0, 1, 2, 3, 4):
            if idx < len(arr):
                x, y, conf = float(arr[idx][0]), float(arr[idx][1]), float(arr[idx][2])
                if conf >= 0.25 and x > 0 and y > 0:
                    points.append((x, y))
    if points:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        cx, cy = float(np.mean(xs)), float(np.mean(ys))
        span = max(max(xs) - min(xs), max(ys) - min(ys), 20.0)
        side = span * 2.4
    else:
        # Fallback: top of person box
        x1, y1, x2, y2 = person_box
        cx = (x1 + x2) / 2.0
        cy = y1 + (y2 - y1) * 0.18
        side = max(24.0, (x2 - x1) * 0.55)

    # Aspect-preserving square crop (no stretch)
    half = side / 2.0
    box = clamp_box(cx - half, cy - half, cx + half, cy + half, w, h)
    if not box:
        return None, None
    x1, y1, x2, y2 = box
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None, None
    # Pad to square without stretching content
    ch, cw = crop.shape[:2]
    side_i = max(ch, cw)
    canvas = np.zeros((side_i, side_i, 3), dtype=crop.dtype)
    oy, ox = (side_i - ch) // 2, (side_i - cw) // 2
    canvas[oy : oy + ch, ox : ox + cw] = crop
    return canvas, box


def normalize_plate(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", (text or "")).upper()


def validate_indian_plate(text: str) -> dict[str, Any]:
    raw = text or ""
    normalized = normalize_plate(raw)
    valid = bool(INDIAN_PLATE_REGEX.match(normalized))
    return {
        "raw": raw,
        "normalized": normalized,
        "valid": valid,
    }


def weighted_ocr_vote(reads: list[dict]) -> dict[str, Any]:
    """Aggregate multi-frame OCR with confidence weighting."""
    if not reads:
        return {
            "rawOcrText": "",
            "normalizedText": "",
            "confidence": 0.0,
            "validation": validate_indian_plate(""),
            "plateStatus": "NEEDS_REVIEW",
        }
    scores: dict[str, float] = {}
    raw_for: dict[str, str] = {}
    for r in reads:
        norm = normalize_plate(r.get("text", ""))
        if not norm:
            continue
        scores[norm] = scores.get(norm, 0.0) + float(r.get("confidence", 0.0))
        raw_for.setdefault(norm, r.get("text", norm))
    if not scores:
        return {
            "rawOcrText": "",
            "normalizedText": "",
            "confidence": 0.0,
            "validation": validate_indian_plate(""),
            "plateStatus": "NEEDS_REVIEW",
        }
    best = max(scores.items(), key=lambda kv: kv[1])
    total = sum(scores.values()) or 1.0
    conf = best[1] / total
    # Also boost if absolute avg confidence of that string is high
    matching = [r for r in reads if normalize_plate(r.get("text", "")) == best[0]]
    abs_conf = float(np.mean([float(r.get("confidence", 0.0)) for r in matching]))
    final_conf = max(conf * abs_conf, abs_conf * (len(matching) / max(1, len(reads))))
    validation = validate_indian_plate(best[0])
    status = "OK" if validation["valid"] and final_conf >= 0.55 else "NEEDS_REVIEW"
    return {
        "rawOcrText": raw_for[best[0]],
        "normalizedText": best[0],
        "confidence": round(float(final_conf), 4),
        "validation": validation,
        "plateStatus": status,
        "votes": len(matching),
    }
