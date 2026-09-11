"""
Road-damage analysis branch — runs on shared decoded frames (no second decode).

Uses YOLO26s_RDD_FRDC_Distilled_v2.pt alongside the traffic/helmet branch.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .road_classes import (
    MODEL_CLASS_NAMES,
    category_for_class,
    severity_from_confidence,
)
from .utils import clamp_box, iou


class RoadAnalyzer:
    def __init__(
        self,
        model,
        *,
        conf: float = 0.20,
        imgsz: int = 640,
        interval: int = 5,
        yolo_kwargs: dict | None = None,
        event_iou: float = 0.35,
        event_time_window: float = 2.0,
    ):
        self.model = model
        self.conf = conf
        self.imgsz = imgsz
        self.interval = max(1, int(interval))
        self.yolo_kwargs = yolo_kwargs or {"verbose": False}
        # Prefer names from loaded checkpoint
        self.names = dict(getattr(model, "names", None) or MODEL_CLASS_NAMES)
        self.event_iou = event_iou
        self.event_time_window = event_time_window
        self.raw_hits: list[dict] = []
        self.frame_overlays: dict[int, list[dict]] = {}  # frame -> boxes for annotated video
        self._open_events: list[dict] = []

    def should_run(self, frame_idx: int) -> bool:
        return frame_idx % self.interval == 0 or frame_idx == 0

    def process_frame(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp: float,
        profiler=None,
    ) -> list[dict]:
        if not self.should_run(frame_idx):
            # Carry last overlays briefly for smoother annotated video
            prev = self.frame_overlays.get(frame_idx - 1)
            if prev and frame_idx - 1 in self.frame_overlays:
                # only carry within interval gap
                gap = frame_idx % self.interval
                if 0 < gap < self.interval:
                    self.frame_overlays[frame_idx] = prev
            return []

        t0 = time.perf_counter()
        results = self.model.predict(
            source=frame,
            conf=self.conf,
            imgsz=self.imgsz,
            **self.yolo_kwargs,
        )
        if profiler is not None:
            profiler.add("road", time.perf_counter() - t0)

        if not results:
            self.frame_overlays[frame_idx] = []
            return []

        result = results[0]
        boxes = result.boxes
        detections: list[dict] = []
        overlays: list[dict] = []
        if boxes is None or len(boxes) == 0:
            self.frame_overlays[frame_idx] = []
            return []

        h, w = frame.shape[:2]
        for box in boxes:
            cls_id = int(box.cls.item())
            conf = float(box.conf.item())
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            clipped = clamp_box(*xyxy, w, h)
            if not clipped:
                continue
            class_name = str(self.names.get(cls_id, MODEL_CLASS_NAMES.get(cls_id, f"class_{cls_id}")))
            category = category_for_class(cls_id, self.names)
            det = {
                "frame": frame_idx,
                "timestamp": round(timestamp, 4),
                "classId": cls_id,
                "className": class_name,
                "category": category,
                "confidence": round(conf, 4),
                "severity": severity_from_confidence(conf, category),
                "bbox": clipped,
            }
            detections.append(det)
            overlays.append(
                {
                    "box": clipped,
                    "label": class_name,
                    "category": category,
                    "conf": round(conf, 4),
                }
            )
            self._ingest_hit(det, frame)

        self.raw_hits.extend(detections)
        self.frame_overlays[frame_idx] = overlays
        return detections

    def _ingest_hit(self, det: dict, frame: np.ndarray) -> None:
        """Temporal/spatial merge into open road events."""
        matched = None
        for ev in self._open_events:
            if ev["classId"] != det["classId"]:
                continue
            if abs(ev["lastTimestamp"] - det["timestamp"]) > self.event_time_window:
                continue
            if iou(ev["bbox"], det["bbox"]) < self.event_iou:
                continue
            matched = ev
            break

        x1, y1, x2, y2 = map(int, det["bbox"])
        crop = frame[y1:y2, x1:x2].copy() if y2 > y1 and x2 > x1 else None

        if matched is None:
            self._open_events.append(
                {
                    "classId": det["classId"],
                    "className": det["className"],
                    "category": det["category"],
                    "bbox": det["bbox"],
                    "firstTimestamp": det["timestamp"],
                    "lastTimestamp": det["timestamp"],
                    "firstFrame": det["frame"],
                    "lastFrame": det["frame"],
                    "bestConfidence": det["confidence"],
                    "bestTimestamp": det["timestamp"],
                    "bestFrame": det["frame"],
                    "bestBbox": det["bbox"],
                    "bestCrop": crop,
                    "hitCount": 1,
                    "severity": det["severity"],
                }
            )
            return

        matched["lastTimestamp"] = det["timestamp"]
        matched["lastFrame"] = det["frame"]
        matched["hitCount"] += 1
        # Expand bbox envelope
        b = matched["bbox"]
        matched["bbox"] = [
            min(b[0], det["bbox"][0]),
            min(b[1], det["bbox"][1]),
            max(b[2], det["bbox"][2]),
            max(b[3], det["bbox"][3]),
        ]
        if det["confidence"] >= matched["bestConfidence"]:
            matched["bestConfidence"] = det["confidence"]
            matched["bestTimestamp"] = det["timestamp"]
            matched["bestFrame"] = det["frame"]
            matched["bestBbox"] = det["bbox"]
            matched["severity"] = det["severity"]
            if crop is not None and crop.size:
                matched["bestCrop"] = crop

    def finalize_events(
        self,
        *,
        video_id: str,
        job_id: str,
        evidence_dir: Path,
        public_prefix: str,
    ) -> list[dict]:
        """Close open tracks → durable road damage events + evidence images."""
        evidence_dir.mkdir(parents=True, exist_ok=True)
        events: list[dict] = []
        for i, ev in enumerate(self._open_events, start=1):
            # Require at least one solid hit (interval sampling already sparse)
            if ev["hitCount"] < 1 or ev["bestConfidence"] < 0.15:
                continue
            eid = f"RD-{video_id[:8]}-{ev['classId']}-{uuid.uuid4().hex[:6]}"
            crop_name = f"{eid}_crop.jpg"
            annotated_name = f"{eid}_frame.jpg"
            crop_path = None
            if ev.get("bestCrop") is not None and getattr(ev["bestCrop"], "size", 0):
                cv2.imwrite(str(evidence_dir / crop_name), ev["bestCrop"])
                crop_path = f"{public_prefix}/{crop_name}"

            event = {
                "roadEventId": eid,
                "eventNumber": i,
                "videoId": video_id,
                "jobId": job_id,
                "classId": ev["classId"],
                "className": ev["className"],
                "category": ev["category"],
                "violationType": f"ROAD_{ev['category'].upper()}",
                "timestamp": ev["bestTimestamp"],
                "frameNumber": ev["bestFrame"],
                "firstTimestamp": ev["firstTimestamp"],
                "lastTimestamp": ev["lastTimestamp"],
                "confidence": round(float(ev["bestConfidence"]), 4),
                "severity": ev["severity"],
                "hitCount": ev["hitCount"],
                "bbox": ev["bestBbox"],
                "status": "DETECTED",
                "cropPath": crop_path,
                "evidencePath": crop_path,
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            events.append(event)

        events.sort(key=lambda e: (e["timestamp"], -e["confidence"]))
        for i, e in enumerate(events, start=1):
            e["eventNumber"] = i
        return events

    def summary(self, events: list[dict]) -> dict[str, Any]:
        by_cat: dict[str, int] = {}
        by_class: dict[str, int] = {}
        for e in events:
            by_cat[e["category"]] = by_cat.get(e["category"], 0) + 1
            by_class[e["className"]] = by_class.get(e["className"], 0) + 1
        return {
            "roadEvents": len(events),
            "roadRawHits": len(self.raw_hits),
            "byCategory": by_cat,
            "byClass": by_class,
            "potholes": by_cat.get("pothole", 0),
            "cracks": by_cat.get("crack", 0),
            "surfaceDamage": by_cat.get("surface_damage", 0),
        }

    def write_timeline(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            for frame_idx in sorted(self.frame_overlays.keys()):
                f.write(
                    json.dumps(
                        {"f": frame_idx, "road": self.frame_overlays[frame_idx]}
                    )
                    + "\n"
                )
