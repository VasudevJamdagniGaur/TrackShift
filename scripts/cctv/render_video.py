"""
Render annotated MP4 from saved analysis timeline — NO second ML pass.

Uses track-level temporal decisions so labels do not flicker frame-to-frame.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

import cv2
import numpy as np


GREEN = (40, 170, 80)
RED = (40, 60, 220)
ORANGE = (0, 165, 255)
AMBER = (20, 180, 255)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)


def _draw_label(img, x, y, lines, color):
    pad = 4
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.5
    thickness = 1
    widths = []
    heights = []
    for line in lines:
        (tw, th), _ = cv2.getTextSize(line, font, scale, thickness)
        widths.append(tw)
        heights.append(th)
    box_w = max(widths) + pad * 2
    box_h = sum(heights) + pad * (len(lines) + 1) + 2 * (len(lines) - 1)
    y1 = max(0, y - box_h - 4)
    x1 = max(0, x)
    x2 = min(img.shape[1] - 1, x1 + box_w)
    y2 = min(img.shape[0] - 1, y1 + box_h)
    cv2.rectangle(img, (x1, y1), (x2, y2), BLACK, -1)
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 1)
    cy = y1 + pad + heights[0]
    for i, line in enumerate(lines):
        cv2.putText(img, line, (x1 + pad, cy), font, scale, color, thickness, cv2.LINE_AA)
        if i + 1 < len(lines):
            cy += heights[i + 1] + pad


def load_timeline(path: Path) -> dict[int, list[dict]]:
    """frame_idx -> list of track annotations."""
    by_frame: dict[int, list[dict]] = {}
    if not path.exists():
        return by_frame
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            by_frame[int(row["f"])] = row.get("tracks") or []
    return by_frame


def render_annotated_video(
    source_video: Path,
    timeline_path: Path,
    track_display: dict[int, dict[str, Any]],
    output_path: Path,
    fps: float,
    width: int,
    height: int,
) -> Path:
    """
    track_display[tid] = {
      "label": "HELMET"|"NO HELMET",
      "color": "green"|"red",
      "confidence": 0.96,
      "plateText": "DL01..."|None,
      "show": True/False,
    }
    """
    by_frame = load_timeline(timeline_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    cap = cv2.VideoCapture(str(source_video))
    if not cap.isOpened():
        raise RuntimeError("Could not open source video for annotated render.")

    # Prefer H.264-friendly mp4v; browsers may need remux but mp4v usually plays
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Could not create annotated video writer.")

    frame_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        annotations = by_frame.get(frame_idx, [])
        for ann in annotations:
            tid = int(ann["id"])
            disp = track_display.get(tid) or {}
            box = ann.get("box")
            if not box:
                continue
            x1, y1, x2, y2 = map(int, box)

            if disp.get("show"):
                color_name = disp.get("color") or "green"
                if color_name == "red":
                    color = RED
                elif color_name in {"orange", "yellow", "amber"}:
                    color = ORANGE
                else:
                    color = GREEN
                conf_pct = int(round(float(disp.get("confidence", 0)) * 100))
                lines = [
                    f"TRACK #{tid}",
                    f"{disp.get('label', 'HELMET')} {conf_pct}%",
                ]
                plate = disp.get("plateText")
                if plate and color_name in {"red", "orange", "yellow", "amber"}:
                    lines.append(str(plate))
                if disp.get("debug"):
                    lines.append(str(disp["debug"])[:42])
            elif disp.get("allowFrameHelmet") and ann.get("pred") == "helmet" and float(ann.get("h") or 0) >= 0.7:
                # Stable rule: frame-level HELMET OK; never frame-level NO HELMET
                color = GREEN
                conf_pct = int(round(float(ann.get("h") or 0) * 100))
                lines = [f"TRACK #{tid}", f"HELMET {conf_pct}%"]
            else:
                continue

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            _draw_label(frame, x1, y1, lines, color)
            # Debug boxes: motorcycle / head
            if disp.get("showDebugBoxes"):
                moto = ann.get("moto")
                head = ann.get("head")
                if moto:
                    mx1, my1, mx2, my2 = map(int, moto)
                    cv2.rectangle(frame, (mx1, my1), (mx2, my2), AMBER, 1)
                if head:
                    hx1, hy1, hx2, hy2 = map(int, head)
                    cv2.rectangle(frame, (hx1, hy1), (hx2, hy2), WHITE, 1)
        writer.write(frame)
        frame_idx += 1

    cap.release()
    writer.release()
    if not output_path.exists() or output_path.stat().st_size < 1000:
        raise RuntimeError("Annotated video render produced an empty file.")

    # Always produce a browser-playable H.264 file (Chrome cannot play OpenCV mp4v/FMP4).
    return _ensure_browser_mp4(output_path)


def _ffmpeg_exe() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _ensure_browser_mp4(output_path: Path) -> Path:
    """
    Transcode OpenCV mp4v → H.264 (+faststart) for HTML5 playback.

    Returns the playable path (annotated.h264.mp4). The original mp4v file may remain
    beside it; the API and job record must point at the H.264 path.
    """
    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        raise RuntimeError(
            "Annotated video was written as MPEG-4 Part 2 (mp4v), which browsers cannot play. "
            "Install ffmpeg or `pip install imageio-ffmpeg`, then re-render the job."
        )

    playable = output_path.with_name(output_path.stem + ".h264.mp4")
    # Skip re-encode if a valid H.264 sibling already exists and is newer/same size ballpark
    if playable.exists() and playable.stat().st_size > 1000:
        if playable.stat().st_mtime >= output_path.stat().st_mtime - 1:
            return playable

    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(output_path),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(playable),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not playable.exists() or playable.stat().st_size < 1000:
        err = (proc.stderr or proc.stdout or "").strip()[-800:]
        if playable.exists():
            playable.unlink(missing_ok=True)
        raise RuntimeError(f"H.264 transcode failed (exit {proc.returncode}): {err}")
    return playable


def build_track_display(
    tracks_meta: dict[int, dict],
    violations_by_track: dict[int, dict],
) -> dict[int, dict[str, Any]]:
    """
    Map each track to a stable overlay label from temporal aggregation + violations.
    CONFIRMED no-helmet → RED
    POTENTIAL / NEEDS_REVIEW → ORANGE
    Helmet evidence → GREEN
    """
    out: dict[int, dict[str, Any]] = {}
    for tid, meta in tracks_meta.items():
        state = meta.get("state", "NORMAL")
        vio = violations_by_track.get(tid)
        helmet_ratio = float(meta.get("helmetRatio") or 0.0)
        helmet_votes = int(meta.get("helmetVotes") or 0)
        debug = meta.get("debugMode", False)
        if state == "CONFIRMED" or (vio and vio.get("status") == "CONFIRMED"):
            conf = float(
                (vio or {}).get("noHelmetConfidence")
                or meta.get("avgNoHelmetConfidence")
                or 0.0
            )
            out[tid] = {
                "label": "NO HELMET",
                "color": "red",
                "confidence": conf,
                "plateText": (vio or {}).get("plateText"),
                "show": True,
                "showDebugBoxes": debug,
                "debug": f"H {meta.get('avgHelmetConfidence', 0):.2f} NH {conf:.2f}",
            }
        elif state in {"POTENTIAL", "NEEDS_REVIEW"} or vio:
            conf = float(
                (vio or {}).get("noHelmetConfidence")
                or meta.get("avgNoHelmetConfidence")
                or meta.get("avgNoHelmetAllFrames")
                or 0.0
            )
            out[tid] = {
                "label": "POTENTIAL NO HELMET",
                "color": "orange",
                "confidence": conf,
                "plateText": (vio or {}).get("plateText"),
                "show": True,
                "showDebugBoxes": debug,
                "debug": f"H {meta.get('avgHelmetConfidence', 0):.2f} NH {conf:.2f}",
            }
        else:
            conf = float(meta.get("avgHelmetConfidence") or meta.get("helmetConfidence") or 0.0)
            if helmet_votes >= 1 or conf >= 0.55 or helmet_ratio >= 0.5:
                out[tid] = {
                    "label": "HELMET",
                    "color": "green",
                    "confidence": conf if conf > 0 else max(helmet_ratio, 0.55),
                    "plateText": None,
                    "show": True,
                    "showDebugBoxes": debug,
                }
            else:
                out[tid] = {"show": False, "allowFrameHelmet": True, "showDebugBoxes": debug}
    return out
