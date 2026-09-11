"""Road-damage class maps for YOLO26s RDD (from checkpoint names)."""

from __future__ import annotations

# Checkpoint: models/YOLO26s_RDD_FRDC_Distilled_v2.pt
# Verified via Ultralytics model.names
MODEL_CLASS_NAMES: dict[int, str] = {
    0: "Longitudinal Crack (D00)",
    1: "Transverse Crack (D10)",
    2: "Alligator Crack (D20)",
    3: "Pothole (D40)",
}

# UI / filter categories used by the forensic dashboard
CLASS_TO_CATEGORY: dict[int, str] = {
    0: "crack",
    1: "crack",
    2: "surface_damage",
    3: "pothole",
}


def category_for_class(cls_id: int, names: dict | None = None) -> str:
    if cls_id in CLASS_TO_CATEGORY:
        return CLASS_TO_CATEGORY[cls_id]
    if names and cls_id in names:
        label = str(names[cls_id]).lower()
        if "pothole" in label or "d40" in label:
            return "pothole"
        if "alligator" in label or "d20" in label:
            return "surface_damage"
        if "crack" in label or "d00" in label or "d10" in label:
            return "crack"
    return "other"


def severity_from_confidence(conf: float, category: str) -> str:
    if category == "pothole":
        if conf >= 0.75:
            return "high"
        if conf >= 0.55:
            return "medium"
        return "low"
    if conf >= 0.8:
        return "high"
    if conf >= 0.6:
        return "medium"
    return "low"
