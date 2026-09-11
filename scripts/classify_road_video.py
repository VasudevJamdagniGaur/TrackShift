#!/usr/bin/env python3
"""Sample frames from an uploaded road video and classify with YOLO26s RDD."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "YOLO26s_RDD_FRDC_Distilled_v2.pt"
OUT_DIR = ROOT / "public" / "detections"

CLASS_TO_CATEGORY = {
    0: "crack",
    1: "crack",
    2: "surface_damage",
    3: "pothole",
}

CLASS_LABELS = {
    0: "Longitudinal Crack (D00)",
    1: "Transverse Crack (D10)",
    2: "Alligator Crack (D20)",
    3: "Pothole (D40)",
}


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


def classify_frame(model: YOLO, frame, conf_thres: float = 0.15) -> list[dict]:
    results = model.predict(source=frame, conf=conf_thres, verbose=False)
    detections: list[dict] = []
    if not results:
        return detections
    result = results[0]
    boxes = result.boxes
    if boxes is None:
        return detections
    for box in boxes:
        cls_id = int(box.cls.item())
        conf = float(box.conf.item())
        xyxy = [float(x) for x in box.xyxy[0].tolist()]
        category = CLASS_TO_CATEGORY.get(cls_id, "other")
        detections.append(
            {
                "classId": cls_id,
                "className": CLASS_LABELS.get(cls_id, f"class_{cls_id}"),
                "category": category,
                "confidence": round(conf, 4),
                "severity": severity_from_confidence(conf, category),
                "bbox": {
                    "x1": xyxy[0],
                    "y1": xyxy[1],
                    "x2": xyxy[2],
                    "y2": xyxy[3],
                },
            }
        )
    return detections


def annotate_frame(model: YOLO, frame, out_name: str) -> str | None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = model.predict(source=frame, conf=0.15, verbose=False)
    if not results:
        return None
    plotted = results[0].plot()
    out_path = OUT_DIR / f"{out_name}.jpg"
    cv2.imwrite(str(out_path), plotted)
    return f"/detections/{out_name}.jpg"


def sample_frame_indices(total_frames: int, max_frames: int, stride: int) -> list[int]:
    if total_frames <= 0:
        return [0]
    if stride < 1:
        stride = 1
    indices = list(range(0, total_frames, stride))
    if len(indices) > max_frames:
        # Evenly pick max_frames across the video
        step = len(indices) / max_frames
        indices = [indices[int(i * step)] for i in range(max_frames)]
    return indices


def classify_video(
    video_path: Path,
    job_id: str,
    max_frames: int = 12,
    stride: int = 15,
) -> dict:
    if not video_path.exists():
        return {"ok": False, "error": f"Video not found: {video_path}"}

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {"ok": False, "error": "Could not open video file"}

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    indices = sample_frame_indices(total_frames or max_frames * stride, max_frames, stride)
    model = YOLO(str(MODEL_PATH))

    frame_results = []
    all_detections = []

    for sample_i, frame_idx in enumerate(indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue

        detections = classify_frame(model, frame)
        evidence = None
        if detections:
            evidence = annotate_frame(model, frame, f"video_{job_id}_f{sample_i + 1}")
        else:
            # Still save a preview of the sampled frame for the UI
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            preview = OUT_DIR / f"video_{job_id}_f{sample_i + 1}_preview.jpg"
            cv2.imwrite(str(preview), frame)
            evidence = f"/detections/{preview.name}"

        timestamp_sec = round(frame_idx / fps, 2) if fps else None
        records = []
        for det_i, det in enumerate(detections):
            record = {
                "id": f"VID-{job_id}-F{sample_i + 1}-{det_i + 1}",
                "type": det["category"],
                "modelClass": det["className"],
                "severity": det["severity"],
                "confidence": det["confidence"],
                "frameIndex": frame_idx,
                "sampleIndex": sample_i + 1,
                "timestampSec": timestamp_sec,
                "evidenceImage": evidence,
                "bbox": det["bbox"],
                "source": "yolo26s_rdd_video",
                "status": "new",
            }
            records.append(record)
            all_detections.append(record)

        frame_results.append(
            {
                "sampleIndex": sample_i + 1,
                "frameIndex": frame_idx,
                "timestampSec": timestamp_sec,
                "detectionCount": len(records),
                "categories": sorted({r["type"] for r in records}),
                "evidenceImage": evidence,
                "detections": records,
            }
        )

    cap.release()

    by_category: dict[str, int] = {}
    for det in all_detections:
        by_category[det["type"]] = by_category.get(det["type"], 0) + 1

    return {
        "ok": True,
        "jobId": job_id,
        "model": "YOLO26s_RDD_FRDC_Distilled_v2.pt",
        "video": {
            "totalFrames": total_frames,
            "fps": round(fps, 2),
            "width": width,
            "height": height,
            "sampledFrames": len(frame_results),
            "stride": stride,
            "maxFrames": max_frames,
        },
        "totalDetections": len(all_detections),
        "byCategory": by_category,
        "categories": sorted(by_category.keys()),
        "frames": frame_results,
        "detections": all_detections,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-path", required=True)
    parser.add_argument("--job-id", default=None)
    parser.add_argument("--max-frames", type=int, default=12)
    parser.add_argument("--stride", type=int, default=15)
    args = parser.parse_args()

    job_id = args.job_id or f"{int(time.time())}"
    result = classify_video(
        Path(args.video_path),
        job_id=job_id,
        max_frames=max(1, min(args.max_frames, 24)),
        stride=max(1, args.stride),
    )
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
