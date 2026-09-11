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
