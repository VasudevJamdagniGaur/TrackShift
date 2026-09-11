#!/usr/bin/env python3
"""Fetch Mapillary frames near demo roads and classify with YOLO."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_LOCAL = ROOT / ".env.local"
BATCH_IN = ROOT / "scripts" / ".mapillary_batch_input.json"
CLASSIFY = ROOT / "scripts" / "classify_road_damage.py"

SEEDS = [
    {
        "label": "Inner Circle, CP",
        "city": "Delhi",
        "area": "Connaught Place",
        "latitude": 28.6315,
        "longitude": 77.2167,
    },
    {
        "label": "S.V. Road",
        "city": "Mumbai",
        "area": "Andheri",
        "latitude": 19.1198,
        "longitude": 72.8461,
    },
    {
        "label": "MG Road",
        "city": "Bengaluru",
        "area": "Central",
        "latitude": 12.9754,
        "longitude": 77.6063,
    },
    {
        "label": "Sector 62 Main Road",
        "city": "Noida",
        "area": "Sector 62",
        "latitude": 28.6282,
        "longitude": 77.3648,
    },
]


def load_token() -> str:
    token = os.environ.get("MAPILLARY_ACCESS_TOKEN")
    if token:
        return token
    if ENV_LOCAL.exists():
        for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
            if line.startswith("MAPILLARY_ACCESS_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("MAPILLARY_ACCESS_TOKEN missing")


def api_get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"OAuth {token}",
            "User-Agent": "Hayagriva/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def images_near(token: str, lat: float, lng: float, limit: int = 12) -> list[dict]:
    delta = 0.0015
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"
    qs = urllib.parse.urlencode(
        {
            "fields": "id,thumb_2048_url,thumb_1024_url,computed_geometry,compass_angle",
            "bbox": bbox,
            "limit": str(limit),
        }
    )
    data = api_get(f"https://graph.mapillary.com/images?{qs}", token)
    return data.get("data") or []


def main() -> None:
    token = load_token()
    payloads = []
    seen = set()

    for seed in SEEDS:
        frames = images_near(token, seed["latitude"], seed["longitude"], limit=10)
        for frame in frames:
            image_id = str(frame.get("id"))
            if not image_id or image_id in seen:
                continue
            image_url = frame.get("thumb_2048_url") or frame.get("thumb_1024_url")
            coords = (frame.get("computed_geometry") or {}).get("coordinates")
            if not image_url or not coords:
                continue
            seen.add(image_id)
            payloads.append(
                {
                    "imageId": image_id,
                    "imageUrl": image_url,
                    "longitude": coords[0],
                    "latitude": coords[1],
                    "roadName": seed["label"],
                    "city": seed["city"],
                    "area": seed["area"],
                }
            )
            if len(payloads) >= 24:
                break
        if len(payloads) >= 24:
            break

    if not payloads:
        raise RuntimeError("No Mapillary frames found to classify")

    BATCH_IN.write_text(json.dumps(payloads, indent=2), encoding="utf-8")
    print(f"Prepared {len(payloads)} frames -> {BATCH_IN}")

    import subprocess

    result = subprocess.run(
        ["python", str(CLASSIFY), "--batch", str(BATCH_IN), "--write-data"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr)
        raise SystemExit(result.returncode)
    # print last JSON line only (ultralytics may print to stderr)
    print(result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "{}")


if __name__ == "__main__":
    main()
