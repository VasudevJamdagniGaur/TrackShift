#!/usr/bin/env python3
"""Classify road-damage images with YOLO26s RDD model."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import urllib.request
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "YOLO26s_RDD_FRDC_Distilled_v2.pt"
OUT_DIR = ROOT / "public" / "detections"
DATA_OUT = ROOT / "src" / "data" / "yolo-detections.json"

# Map model classes -> Hayagriva UI filter categories
CLASS_TO_CATEGORY = {
    0: "crack",  # Longitudinal Crack (D00)
    1: "crack",  # Transverse Crack (D10)
    2: "surface_damage",  # Alligator Crack (D20)
    3: "pothole",  # Pothole (D40)
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


def download_image(url: str, dest: Path) -> Path:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Hayagriva/1.0 (road-intelligence)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    return dest


def classify_path(model: YOLO, image_path: Path, conf_thres: float = 0.15) -> list[dict]:
    results = model.predict(source=str(image_path), conf=conf_thres, verbose=False)
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


def annotate_and_save(model: YOLO, image_path: Path, out_name: str) -> str | None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results = model.predict(source=str(image_path), conf=0.15, verbose=False)
    if not results:
        return None
    plotted = results[0].plot()
    out_path = OUT_DIR / f"{out_name}.jpg"
    import cv2

    cv2.imwrite(str(out_path), plotted)
    return f"/detections/{out_name}.jpg"


def classify_one(payload: dict) -> dict:
    model = YOLO(str(MODEL_PATH))
    image_id = str(payload.get("imageId") or payload.get("id") or "local")
    image_url = payload.get("imageUrl")
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")
    road_name = payload.get("roadName") or "Detected road segment"
    city = payload.get("city") or "Unknown"
    area = payload.get("area") or city

    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / f"{image_id}.jpg"
        if image_url:
            download_image(image_url, local)
        elif payload.get("imagePath"):
            local = Path(payload["imagePath"])
        else:
            return {"ok": False, "error": "imageUrl or imagePath required"}

        detections = classify_path(model, local)
        evidence = None
        if detections:
            evidence = annotate_and_save(model, local, f"yolo_{image_id}")

    records = []
    for idx, det in enumerate(detections):
        records.append(
            {
                "id": f"YOLO-{image_id}-{idx + 1}",
                "type": det["category"],
                "modelClass": det["className"],
                "severity": det["severity"],
                "confidence": det["confidence"],
                "latitude": latitude,
                "longitude": longitude,
                "roadName": road_name,
                "city": city,
                "area": area,
                "mapillaryImageId": image_id if str(image_id).isdigit() else None,
                "evidenceImage": evidence,
                "bbox": det["bbox"],
                "source": "yolo26s_rdd_mapillary",
                "status": "new",
            }
        )

    return {
        "ok": True,
        "imageId": image_id,
        "detectionCount": len(records),
        "detections": records,
        "categories": sorted({r["type"] for r in records}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdin-json", action="store_true")
    parser.add_argument("--batch", type=str, help="Path to JSON list of image payloads")
    parser.add_argument("--image-url", type=str)
    parser.add_argument("--image-id", type=str, default="adhoc")
    parser.add_argument("--lat", type=float)
    parser.add_argument("--lng", type=float)
    parser.add_argument("--write-data", action="store_true")
    args = parser.parse_args()

    if args.stdin_json:
        payload = json.load(sys.stdin)
        result = classify_one(payload if isinstance(payload, dict) else payload[0])
        print(json.dumps(result))
        return 0 if result.get("ok") else 1

    if args.batch:
        items = json.loads(Path(args.batch).read_text(encoding="utf-8"))
        all_detections = []
        summary = []
        for item in items:
            result = classify_one(item)
            summary.append(
                {
                    "imageId": result.get("imageId"),
                    "ok": result.get("ok"),
                    "detectionCount": result.get("detectionCount", 0),
                    "categories": result.get("categories", []),
                }
            )
            all_detections.extend(result.get("detections") or [])
        output = {
            "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "model": "YOLO26s_RDD_FRDC_Distilled_v2.pt",
            "totalDetections": len(all_detections),
            "byCategory": {},
            "summary": summary,
            "detections": all_detections,
        }
        for det in all_detections:
            output["byCategory"][det["type"]] = output["byCategory"].get(det["type"], 0) + 1
        if args.write_data:
            DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
            DATA_OUT.write_text(json.dumps(output, indent=2), encoding="utf-8")
        print(json.dumps(output))
        return 0

    if args.image_url:
        result = classify_one(
            {
                "imageId": args.image_id,
                "imageUrl": args.image_url,
                "latitude": args.lat,
                "longitude": args.lng,
            }
        )
        print(json.dumps(result))
        return 0 if result.get("ok") else 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
