#!/usr/bin/env python3
"""
Helmet-v5 video enforcement demo.

Uses weights from Hugging Face `vivekvar/helmet-v5`:
  - yolo11l_cctv_ft.pt  → motorcycle + person
  - helmet_v5c.pt       → EfficientNet helmet / no_helmet
  - plate_yolo.pt       → license plate boxes
  - trocr_indian_plates_v3/final → plate OCR

Issues tickets for riders classified as no_helmet, with rider photo + plate text.
"""

from __future__ import annotations

import argparse
import json
import re
import time
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
OUT_DIR = ROOT / "public" / "detections" / "tickets"

CCTV_WEIGHTS = MODEL_ROOT / "yolo11l_cctv_ft.pt"
HELMET_WEIGHTS = MODEL_ROOT / "helmet_v5c.pt"
PLATE_WEIGHTS = MODEL_ROOT / "plate_yolo.pt"
TROCR_DIR = MODEL_ROOT / "trocr_indian_plates_v3" / "final"

PLATE_REGEX = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{1,3}\d{3,4}$")


def sample_frame_indices(total_frames: int, max_frames: int, stride: int) -> list[int]:
    if total_frames <= 0:
        return [0]
    stride = max(1, stride)
    indices = list(range(0, total_frames, stride))
    if len(indices) > max_frames:
        step = len(indices) / max_frames
        indices = [indices[int(i * step)] for i in range(max_frames)]
    return indices


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


def expand_box(box, w, h, scale=1.25):
    x1, y1, x2, y2 = box
    cx, cy = box_center(box)
    bw, bh = (x2 - x1) * scale, (y2 - y1) * scale
    return clamp_box(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, w, h) or box


def head_crop_from_person(person_box, frame):
    """Approximate driver head from the top portion of the person box."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = person_box
    ph = y2 - y1
    pw = x2 - x1
    hx1 = x1 + pw * 0.15
    hx2 = x2 - pw * 0.15
    hy1 = y1
    hy2 = y1 + ph * 0.42
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


class PlateOCR:
    def __init__(self, model_dir: Path, device: str):
        self.available = model_dir.exists()
        self.processor = None
        self.model = None
        self.device = device
        if not self.available:
            return
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        self.processor = TrOCRProcessor.from_pretrained(str(model_dir))
        self.model = VisionEncoderDecoderModel.from_pretrained(str(model_dir))
        self.model.to(device)
        self.model.eval()

    def read(self, crop_bgr: np.ndarray) -> tuple[str, float]:
        if not self.available or crop_bgr is None or crop_bgr.size == 0:
            return "UNKNOWN", 0.0
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        # Upscale tiny plates for OCR stability
        h, w = rgb.shape[:2]
        if max(h, w) < 80:
            scale = 120 / max(h, w)
            rgb = cv2.resize(
                rgb, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC
            )
        pil = Image.fromarray(rgb)
        inputs = self.processor(images=pil, return_tensors="pt")
        pixel_values = inputs.pixel_values.to(self.device)
        with torch.no_grad():
            ids = self.model.generate(pixel_values, max_new_tokens=20)
        text = self.processor.batch_decode(ids, skip_special_tokens=True)[0]
        cleaned = re.sub(r"[^A-Za-z0-9]", "", text).upper()
        conf = 0.9 if PLATE_REGEX.match(cleaned) else (0.55 if len(cleaned) >= 6 else 0.25)
        return cleaned or "UNKNOWN", conf


def nearest_person(moto_box, people: list[dict]):
    if not people:
        return None
    mx, my = box_center(moto_box)
    best = None
    best_d = 1e18
    for person in people:
        px, py = box_center(person["box"])
        # Prefer people whose center is above the motorcycle center
        if py > my + (moto_box[3] - moto_box[1]) * 0.35:
            continue
        d = (px - mx) ** 2 + (py - my) ** 2
        if d < best_d:
            best_d = d
            best = person
    return best or min(
        people,
        key=lambda p: (box_center(p["box"])[0] - mx) ** 2
        + (box_center(p["box"])[1] - my) ** 2,
    )


def nearest_plate(moto_box, plates: list[dict], max_dist_factor=1.8):
    if not plates:
        return None
    mx, my = box_center(moto_box)
    mw = max(1.0, moto_box[2] - moto_box[0])
    best = None
    best_d = 1e18
    for plate in plates:
        px, py = box_center(plate["box"])
        d = ((px - mx) / mw) ** 2 + ((py - my) / mw) ** 2
        if d < best_d:
            best_d = d
            best = plate
    if best is None or best_d > max_dist_factor**2:
        return None
    return best


def annotate_ticket_frame(frame, rider_box, plate_box, label, plate_text):
    out = frame.copy()
    if rider_box:
        x1, y1, x2, y2 = map(int, rider_box)
        color = (40, 60, 220) if label == "no_helmet" else (40, 170, 80)
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            out,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            color,
            2,
            cv2.LINE_AA,
        )
    if plate_box:
        x1, y1, x2, y2 = map(int, plate_box)
        cv2.rectangle(out, (x1, y1), (x2, y2), (20, 180, 255), 2)
        cv2.putText(
            out,
            plate_text or "PLATE",
            (x1, min(out.shape[0] - 8, y2 + 22)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (20, 180, 255),
            2,
            cv2.LINE_AA,
        )
    return out


def dedupe_tickets(tickets: list[dict]) -> list[dict]:
    """Keep strongest ticket per plate / nearby rider."""
    kept: list[dict] = []
    for ticket in sorted(tickets, key=lambda t: t["helmetConfidence"], reverse=True):
        plate = ticket.get("numberPlate") or ""
        duplicate = False
        for existing in kept:
            same_plate = (
                plate
                and existing.get("numberPlate")
                and plate == existing["numberPlate"]
                and plate != "UNKNOWN"
            )
            close = (
                abs(ticket["timestampSec"] - existing["timestampSec"]) < 2.5
                and iou(ticket["riderBox"], existing["riderBox"]) > 0.25
            )
            if same_plate or close:
                duplicate = True
                break
        if not duplicate:
            kept.append(ticket)
    return kept


def classify_helmet_video(
    video_path: Path,
    job_id: str,
    max_frames: int = 16,
    stride: int = 10,
    conf: float = 0.25,
) -> dict:
    missing = [p for p in (CCTV_WEIGHTS, HELMET_WEIGHTS, PLATE_WEIGHTS) if not p.exists()]
    if missing:
        return {
            "ok": False,
            "error": "Missing helmet-v5 weights: " + ", ".join(str(p) for p in missing),
        }

    device = "cuda" if torch.cuda.is_available() else "cpu"
    det = YOLO(str(CCTV_WEIGHTS))
    plate_det = YOLO(str(PLATE_WEIGHTS))
    helmet = HelmetClassifier(HELMET_WEIGHTS, device)
    ocr = PlateOCR(TROCR_DIR, device)

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {"ok": False, "error": "Could not open video file"}

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    indices = sample_frame_indices(total_frames or max_frames * stride, max_frames, stride)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tickets_raw: list[dict] = []
    frame_summaries = []

    for sample_i, frame_idx in enumerate(indices):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        h, w = frame.shape[:2]
        ts = round(frame_idx / fps, 2)

        det_res = det.predict(source=frame, conf=conf, verbose=False)[0]
        plate_res = plate_det.predict(source=frame, conf=max(0.2, conf - 0.05), verbose=False)[0]

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
                item = {"box": clipped, "confidence": score, "classId": cls_id}
                name = det.names.get(cls_id, str(cls_id))
                if name == "person":
                    people.append(item)
                elif name == "motorcycle":
                    bikes.append(item)

        plates = []
        if plate_res.boxes is not None:
            for box in plate_res.boxes:
                score = float(box.conf.item())
                xyxy = [float(v) for v in box.xyxy[0].tolist()]
                clipped = clamp_box(*xyxy, w, h)
                if clipped:
                    plates.append({"box": clipped, "confidence": score})

        frame_tickets = 0
        for bike_i, bike in enumerate(bikes):
            rider = nearest_person(bike["box"], people)
            if not rider:
                continue
            head_crop, head_box = head_crop_from_person(rider["box"], frame)
            if head_crop is None:
                continue
            label, helmet_conf = helmet.classify(head_crop)
            if label != "no_helmet":
                continue

            plate = nearest_plate(bike["box"], plates)
            plate_text = "UNKNOWN"
            plate_conf = 0.0
            plate_crop = None
            plate_box = None
            if plate:
                px1, py1, px2, py2 = expand_box(plate["box"], w, h, 1.15)
                plate_box = [px1, py1, px2, py2]
                plate_crop = frame[py1:py2, px1:px2]
                plate_text, plate_conf = ocr.read(plate_crop)

            ticket_id = f"TKT-{job_id}-{sample_i + 1}-{bike_i + 1}"
            annotated = annotate_ticket_frame(
                frame, rider["box"], plate_box, label, plate_text
            )
            evidence_name = f"{ticket_id}.jpg"
            evidence_path = OUT_DIR / evidence_name
            cv2.imwrite(str(evidence_path), annotated)

            rider_name = f"{ticket_id}_rider.jpg"
            rx1, ry1, rx2, ry2 = expand_box(rider["box"], w, h, 1.1)
            rider_crop = frame[ry1:ry2, rx1:rx2]
            cv2.imwrite(str(OUT_DIR / rider_name), rider_crop)

            plate_image = None
            if plate_crop is not None and plate_crop.size:
                plate_name = f"{ticket_id}_plate.jpg"
                cv2.imwrite(str(OUT_DIR / plate_name), plate_crop)
                plate_image = f"/detections/tickets/{plate_name}"

            ticket = {
                "id": ticket_id,
                "violation": "no_helmet",
                "status": "open",
                "numberPlate": plate_text,
                "plateConfidence": round(plate_conf, 4),
                "helmetConfidence": round(helmet_conf, 4),
                "riderConfidence": round(rider["confidence"], 4),
                "motorcycleConfidence": round(bike["confidence"], 4),
                "timestampSec": ts,
                "frameIndex": frame_idx,
                "sampleIndex": sample_i + 1,
                "evidenceImage": f"/detections/tickets/{evidence_name}",
                "riderImage": f"/detections/tickets/{rider_name}",
                "plateImage": plate_image,
                "riderBox": list(map(float, rider["box"])),
                "motorcycleBox": list(map(float, bike["box"])),
                "plateBox": list(map(float, plate_box)) if plate_box else None,
                "model": "vivekvar/helmet-v5",
            }
            tickets_raw.append(ticket)
            frame_tickets += 1

        frame_summaries.append(
            {
                "sampleIndex": sample_i + 1,
                "frameIndex": frame_idx,
                "timestampSec": ts,
                "motorcycles": len(bikes),
                "people": len(people),
                "plates": len(plates),
                "tickets": frame_tickets,
            }
        )

    cap.release()
    tickets = dedupe_tickets(tickets_raw)

    return {
        "ok": True,
        "jobId": job_id,
        "model": "vivekvar/helmet-v5",
        "pipeline": [
            "yolo11l_cctv_ft (motorcycle + person)",
            "helmet_v5c (helmet vs no_helmet)",
            "plate_yolo + TrOCR Indian plates",
        ],
        "video": {
            "totalFrames": total_frames,
            "fps": round(fps, 2),
            "width": width,
            "height": height,
            "sampledFrames": len(frame_summaries),
            "stride": stride,
            "maxFrames": max_frames,
        },
        "ticketCount": len(tickets),
        "tickets": tickets,
        "frames": frame_summaries,
        "ocrAvailable": ocr.available,
        "device": device,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-path", required=True)
    parser.add_argument("--job-id", default=None)
    parser.add_argument("--max-frames", type=int, default=16)
    parser.add_argument("--stride", type=int, default=10)
    parser.add_argument("--conf", type=float, default=0.25)
    args = parser.parse_args()

    job_id = args.job_id or f"{int(time.time())}"
    result = classify_helmet_video(
        Path(args.video_path),
        job_id=job_id,
        max_frames=max(1, min(args.max_frames, 30)),
        stride=max(1, args.stride),
        conf=args.conf,
    )
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
