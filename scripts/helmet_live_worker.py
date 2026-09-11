#!/usr/bin/env python3
"""
Persistent helmet-v5 live worker.

Loads models once, then reads newline-delimited JSON requests from stdin:
  {"id":"1","imagePath":"...","conf":0.25,"withPlate":false}

Writes one JSON response line per request.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL_ROOT = ROOT / "models" / "helmet-v5" / "models"
CCTV_WEIGHTS = MODEL_ROOT / "yolo11l_cctv_ft.pt"
HELMET_WEIGHTS = MODEL_ROOT / "helmet_v5c.pt"
PLATE_WEIGHTS = MODEL_ROOT / "plate_yolo.pt"
TICKETS_DIR = ROOT / "public" / "detections" / "tickets"


def clamp_box(x1, y1, x2, y2, w, h):
    x1 = int(max(0, min(w - 1, x1)))
    y1 = int(max(0, min(h - 1, y1)))
    x2 = int(max(0, min(w, x2)))
    y2 = int(max(0, min(h, y2)))
    if x2 <= x1 + 2 or y2 <= y1 + 2:
        return None
    return x1, y1, x2, y2


def box_center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def head_crop_from_person(person_box, frame):
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = person_box
    ph = y2 - y1
    pw = x2 - x1
    hx1 = x1 + pw * 0.12
    hx2 = x2 - pw * 0.12
    hy1 = y1
    hy2 = y1 + ph * 0.45
    box = clamp_box(hx1, hy1, hx2, hy2, w, h)
    if not box:
        return None, None
    x1, y1, x2, y2 = box
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None, None
    return crop, box


class HelmetClassifier:
    def __init__(self, weights: Path, device: str):
        ckpt = torch.load(weights, map_location=device, weights_only=False)
        if isinstance(ckpt, dict) and "labels" in ckpt:
            self.labels = list(ckpt["labels"])
            state = ckpt.get("state_dict") or ckpt.get("model")
        else:
            self.labels = ["helmet", "no_helmet"]
            state = ckpt
        m = models.efficientnet_b0(weights=None)
        m.classifier[1] = nn.Linear(m.classifier[1].in_features, len(self.labels))
        m.load_state_dict(state)
        m.eval().to(device)
        self.model = m
        self.device = device
        self.tfm = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )

    def classify(self, crop_bgr: np.ndarray) -> tuple[str, float]:
        if crop_bgr is None or crop_bgr.size == 0:
            return "?", 0.0
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        tensor = self.tfm(Image.fromarray(rgb)).unsqueeze(0).to(self.device)
        with torch.no_grad():
            probs = torch.softmax(self.model(tensor), dim=1)[0].cpu().numpy()
        idx = int(probs.argmax())
        return self.labels[idx], float(probs[idx])


def load_models():
    missing = [p for p in (CCTV_WEIGHTS, HELMET_WEIGHTS) if not p.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing helmet-v5 weights: " + ", ".join(str(p) for p in missing)
        )
    device = "cuda" if torch.cuda.is_available() else "cpu"
    det = YOLO(str(CCTV_WEIGHTS))
    helmet = HelmetClassifier(HELMET_WEIGHTS, device)
    plate_det = YOLO(str(PLATE_WEIGHTS)) if PLATE_WEIGHTS.exists() else None
    return det, helmet, plate_det, device


def detect_frame(frame, det, helmet, plate_det, conf: float = 0.25, with_plate: bool = False):
    h, w = frame.shape[:2]
    det_res = det.predict(source=frame, conf=conf, verbose=False)[0]

    people = []
    bikes = []
    if det_res.boxes is not None:
        for box in det_res.boxes:
            cls_id = int(box.cls.item())
            score = float(box.conf.item())
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            clipped = clamp_box(*xyxy, w, h)
            if not clipped:
                continue
            name = det.names.get(cls_id, str(cls_id))
            item = {"box": clipped, "confidence": score}
            if name == "person":
                people.append(item)
            elif name == "motorcycle":
                bikes.append(item)

    detections = []
    for idx, person in enumerate(people):
        head_crop, head_box = head_crop_from_person(person["box"], frame)
        if head_crop is None or head_box is None:
            continue
        label, helmet_conf = helmet.classify(head_crop)
        if label not in ("helmet", "no_helmet"):
            continue
        hx1, hy1, hx2, hy2 = head_box
        cx = (hx1 + hx2) / 2.0
        cy = (hy1 + hy2) / 2.0
        radius = max((hx2 - hx1), (hy2 - hy1)) * 0.55
        detections.append(
            {
                "id": f"p{idx + 1}",
                "label": label,
                "confidence": round(helmet_conf, 4),
                "personConfidence": round(person["confidence"], 4),
                "box": list(map(float, person["box"])),
                "headBox": list(map(float, head_box)),
                "cx": float(cx),
                "cy": float(cy),
                "radius": float(radius),
                "color": "#22c55e" if label == "helmet" else "#ef4444",
            }
        )

    plates = []
    if with_plate and plate_det is not None:
        plate_res = plate_det.predict(
            source=frame, conf=max(0.2, conf - 0.05), verbose=False
        )[0]
        if plate_res.boxes is not None:
            for box in plate_res.boxes:
                score = float(box.conf.item())
                xyxy = [float(v) for v in box.xyxy[0].tolist()]
                clipped = clamp_box(*xyxy, w, h)
                if clipped:
                    plates.append(
                        {
                            "box": list(map(float, clipped)),
                            "confidence": round(score, 4),
                        }
                    )

    return {
        "detections": detections,
        "motorcycles": len(bikes),
        "people": len(people),
        "plates": plates,
        "width": w,
        "height": h,
    }


def save_ticket_snapshot(frame, detection, job_id: str, timestamp_sec: float):
    TICKETS_DIR.mkdir(parents=True, exist_ok=True)
    ticket_id = f"LIVE-{job_id}-{int(timestamp_sec * 10)}-{detection['id']}"
    x1, y1, x2, y2 = map(int, detection["box"])
    pad = 12
    h, w = frame.shape[:2]
    rx1, ry1 = max(0, x1 - pad), max(0, y1 - pad)
    rx2, ry2 = min(w, x2 + pad), min(h, y2 + pad)
    rider = frame[ry1:ry2, rx1:rx2]
    annotated = frame.copy()
    color = (40, 170, 80) if detection["label"] == "helmet" else (40, 60, 220)
    cv2.circle(
        annotated,
        (int(detection["cx"]), int(detection["cy"])),
        int(max(18, detection["radius"])),
        color,
        3,
    )
    rider_name = f"{ticket_id}_rider.jpg"
    evidence_name = f"{ticket_id}.jpg"
    cv2.imwrite(str(TICKETS_DIR / rider_name), rider if rider.size else frame)
    cv2.imwrite(str(TICKETS_DIR / evidence_name), annotated)
    return {
        "id": ticket_id,
        "violation": "no_helmet",
        "status": "open",
        "numberPlate": "PENDING",
        "plateConfidence": 0,
        "helmetConfidence": detection["confidence"],
        "timestampSec": round(timestamp_sec, 2),
        "evidenceImage": f"/detections/tickets/{evidence_name}",
        "riderImage": f"/detections/tickets/{rider_name}",
        "plateImage": None,
    }


def main() -> int:
    try:
        det, helmet, plate_det, device = load_models()
    except Exception as exc:
        sys.stderr.write(f"Failed to load models: {exc}\n")
        sys.stderr.flush()
        print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
        return 1

    # Ready signal for Node
    print(json.dumps({"ok": True, "ready": True, "device": device}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            if req.get("cmd") == "ping":
                print(json.dumps({"id": req_id, "ok": True, "pong": True}), flush=True)
                continue
            if req.get("cmd") == "shutdown":
                print(json.dumps({"id": req_id, "ok": True, "bye": True}), flush=True)
                return 0

            image_path = Path(req["imagePath"])
            conf = float(req.get("conf", 0.25))
            with_plate = bool(req.get("withPlate", False))
            save_ticket = bool(req.get("saveTicket", False))
            timestamp_sec = float(req.get("timestampSec", 0))
            job_id = str(req.get("jobId", "live"))

            frame = cv2.imread(str(image_path))
            if frame is None:
                print(
                    json.dumps(
                        {"id": req_id, "ok": False, "error": "Could not read frame image"}
                    ),
                    flush=True,
                )
                continue

            result = detect_frame(
                frame, det, helmet, plate_det, conf=conf, with_plate=with_plate
            )
            tickets = []
            if save_ticket:
                for det_item in result["detections"]:
                    if det_item["label"] == "no_helmet":
                        tickets.append(
                            save_ticket_snapshot(frame, det_item, job_id, timestamp_sec)
                        )

            print(
                json.dumps(
                    {
                        "id": req_id,
                        "ok": True,
                        **result,
                        "tickets": tickets,
                    }
                ),
                flush=True,
            )
        except Exception as exc:
            print(
                json.dumps({"id": req_id, "ok": False, "error": str(exc)}),
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
