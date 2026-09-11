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


GRAY = (160, 160, 160)
CYAN = (220, 200, 40)
BLUE = (220, 120, 40)
PURPLE = (180, 60, 180)
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


def load_timeline(path: Path) -> tuple[dict[int, list[dict]], dict[int, list[dict]]]:
    """frame_idx -> traffic tracks, frame_idx -> road overlays."""
    by_frame: dict[int, list[dict]] = {}
    road_by_frame: dict[int, list[dict]] = {}
    if not path.exists():
        return by_frame, road_by_frame
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            fi = int(row["f"])
            by_frame[fi] = row.get("tracks") or []
            road_by_frame[fi] = row.get("road") or []
    return by_frame, road_by_frame


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
    by_frame, road_by_frame = load_timeline(timeline_path)
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
            rider_state = ann.get("riderState") or disp.get("riderState")
            moto = ann.get("moto")
            box = ann.get("box") or moto
            if not box:
                continue
            x1, y1, x2, y2 = map(int, box)

            # Empty / unconfirmed motorcycle: never show NO HELMET
            if rider_state in {"NO_RIDER", None} and not ann.get("helmetAnalyzed"):
                draw_box = moto or box
                mx1, my1, mx2, my2 = map(int, draw_box)
                color = GRAY
                lines = [f"TRACK #{tid}", "MOTORCYCLE", "NO RIDER"]
                if disp.get("debugMode") or disp.get("debug"):
                    score = ann.get("riderScore")
                    if score is not None:
                        lines.append(f"Rider score {score}")
                    lines.append("Helmet: NOT ANALYZED")
                cv2.rectangle(frame, (mx1, my1), (mx2, my2), color, 2)
                _draw_label(frame, mx1, my1, lines, color)
                continue

            if rider_state in {"RIDER_UNCERTAIN", "RIDER_CANDIDATE", "RIDER_LOST"} and not (
                disp.get("show") and disp.get("color") in {"red", "green"}
            ):
                draw_box = moto or box
                mx1, my1, mx2, my2 = map(int, draw_box)
                color = ORANGE
                label = {
                    "RIDER_UNCERTAIN": "RIDER UNCERTAIN",
                    "RIDER_CANDIDATE": "RIDER CANDIDATE",
                    "RIDER_LOST": "RIDER LOST",
                }.get(str(rider_state), "RIDER UNCERTAIN")
                lines = [f"TRACK #{tid}", label]
                if ann.get("riderScore") is not None:
                    lines.append(f"Score {ann.get('riderScore')}")
                if not ann.get("helmetAnalyzed"):
                    lines.append("Helmet: NOT ANALYZED")
                cv2.rectangle(frame, (mx1, my1), (mx2, my2), color, 2)
                _draw_label(frame, mx1, my1, lines, color)
                if disp.get("showDebugBoxes"):
                    head = ann.get("head")
                    if head:
                        hx1, hy1, hx2, hy2 = map(int, head)
                        cv2.rectangle(frame, (hx1, hy1), (hx2, hy2), WHITE, 1)
                continue

            if disp.get("show"):
                color_name = disp.get("color") or "green"
                if color_name == "red":
                    color = RED
                elif color_name in {"orange", "yellow", "amber"}:
                    color = ORANGE
                elif color_name in {"gray", "grey", "neutral"}:
                    color = GRAY
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
                # Still draw motorcycle neutrally if present
                if moto:
                    mx1, my1, mx2, my2 = map(int, moto)
                    cv2.rectangle(frame, (mx1, my1), (mx2, my2), GRAY, 1)
                continue

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            _draw_label(frame, x1, y1, lines, color)
            # Debug boxes: motorcycle / head
            if disp.get("showDebugBoxes"):
                if moto:
                    mx1, my1, mx2, my2 = map(int, moto)
                    cv2.rectangle(frame, (mx1, my1), (mx2, my2), AMBER, 1)
                head = ann.get("head")
                if head:
                    hx1, hy1, hx2, hy2 = map(int, head)
                    cv2.rectangle(frame, (hx1, hy1), (hx2, hy2), WHITE, 1)

        # Road-damage overlays (cyan / blue / purple by category)
        for rd in road_by_frame.get(frame_idx, []):
            box = rd.get("box")
            if not box:
                continue
            x1, y1, x2, y2 = map(int, box)
            cat = rd.get("category") or ""
            if cat == "pothole":
                color = PURPLE
            elif cat == "surface_damage":
                color = BLUE
            else:
                color = CYAN
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            conf_pct = int(round(float(rd.get("conf") or 0) * 100))
            label = str(rd.get("label") or cat or "ROAD")
            _draw_label(frame, x1, y1, [label, f"{conf_pct}%"], color)

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

    Returns annotated.h264.mp4. Uses light/fast settings + retries because Windows
    often SIGTERM-kills long high-bitrate x264 runs (exit 0xC000013A / signal 15),
    which previously failed the whole forensic job at 99%.
    """
    ffmpeg = _ffmpeg_exe()
    if not ffmpeg:
        raise RuntimeError(
            "Annotated video was written as MPEG-4 Part 2 (mp4v), which browsers cannot play. "
            "Install ffmpeg or `pip install imageio-ffmpeg`, then re-render the job."
        )

    playable = output_path.with_name(output_path.stem + ".h264.mp4")
    if playable.exists() and playable.stat().st_size > 1000:
        if playable.stat().st_mtime >= output_path.stat().st_mtime - 1:
            return playable

    # Fast/light first (less RAM/CPU → fewer Windows kills), then scaled retries.
    attempts = [
        {"preset": "ultrafast", "crf": "28", "threads": "2", "scale": None},
        {"preset": "ultrafast", "crf": "28", "threads": "2", "scale": "1280:-2"},
        {"preset": "veryfast", "crf": "26", "threads": "2", "scale": "960:-2"},
    ]

    last_err = ""
    for attempt in attempts:
        if playable.exists():
            try:
                playable.unlink()
            except OSError:
                pass

        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(output_path),
        ]
        if attempt["scale"]:
            cmd.extend(["-vf", f"scale={attempt['scale']}"])
        cmd.extend(
            [
                "-c:v",
                "libx264",
                "-preset",
                attempt["preset"],
                "-crf",
                attempt["crf"],
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-an",
                "-threads",
                attempt["threads"],
                str(playable),
            ]
        )
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False,
                timeout=900,
            )
        except subprocess.TimeoutExpired:
            last_err = f"timeout ({attempt['preset']}/crf{attempt['crf']})"
            continue

        if proc.returncode == 0 and playable.exists() and playable.stat().st_size > 1000:
            return playable

        err = (proc.stderr or proc.stdout or "").strip()[-500:]
        last_err = f"exit {proc.returncode}: {err}"
        if playable.exists() and playable.stat().st_size < 1000:
            playable.unlink(missing_ok=True)

    raise RuntimeError(f"H.264 transcode failed after retries ({last_err})")


def build_track_display(
    tracks_meta: dict[int, dict],
    violations_by_track: dict[int, dict],
) -> dict[int, dict[str, Any]]:
    """
    Map each track to a stable overlay label from temporal aggregation + violations.
    CONFIRMED no-helmet → RED (only if rider was confirmed)
    POTENTIAL / NEEDS_REVIEW → ORANGE
    Helmet evidence → GREEN
    No rider → neutral (handled per-frame in renderer)
    """
    out: dict[int, dict[str, Any]] = {}
    for tid, meta in tracks_meta.items():
        state = meta.get("state", "NORMAL")
        vio = violations_by_track.get(tid)
        helmet_ratio = float(meta.get("helmetRatio") or 0.0)
        helmet_votes = int(meta.get("helmetVotes") or 0)
        debug = meta.get("debugMode", False)
        rider_state = meta.get("riderState") or "NO_RIDER"
        rider_confirmed = bool(meta.get("riderConfirmedOnce"))
        base = {
            "riderState": rider_state,
            "riderAssociationScore": meta.get("riderAssociationScore", 0),
            "debugMode": debug,
            "showDebugBoxes": debug,
        }

        # Without a confirmed rider, never paint NO HELMET at track level
        if not rider_confirmed and not (vio and meta.get("helmetPredCount", 0) > 0):
            out[tid] = {
                **base,
                "show": False,
                "allowFrameHelmet": False,
                "label": "NO RIDER",
                "color": "gray",
            }
            continue

        if state == "CONFIRMED" or (vio and vio.get("status") == "CONFIRMED"):
            conf = float(
                (vio or {}).get("noHelmetConfidence")
                or meta.get("avgNoHelmetConfidence")
                or 0.0
            )
            out[tid] = {
                **base,
                "label": "NO HELMET",
                "color": "red",
                "confidence": conf,
                "plateText": (vio or {}).get("plateText"),
                "show": True,
                "debug": f"R {meta.get('riderAssociationScore', 0):.2f} NH {conf:.2f}",
            }
        elif state in {"POTENTIAL", "NEEDS_REVIEW"} or vio:
            conf = float(
                (vio or {}).get("noHelmetConfidence")
                or meta.get("avgNoHelmetConfidence")
                or meta.get("avgNoHelmetAllFrames")
                or 0.0
            )
            out[tid] = {
                **base,
                "label": "POTENTIAL NO HELMET",
                "color": "orange",
                "confidence": conf,
                "plateText": (vio or {}).get("plateText"),
                "show": True,
                "debug": f"R {meta.get('riderAssociationScore', 0):.2f} NH {conf:.2f}",
            }
        else:
            conf = float(meta.get("avgHelmetConfidence") or meta.get("helmetConfidence") or 0.0)
            if helmet_votes >= 1 or conf >= 0.55 or helmet_ratio >= 0.5:
                out[tid] = {
                    **base,
                    "label": "HELMET",
                    "color": "green",
                    "confidence": conf if conf > 0 else max(helmet_ratio, 0.55),
                    "plateText": None,
                    "show": True,
                }
            else:
                out[tid] = {
                    **base,
                    "show": False,
                    "allowFrameHelmet": True,
                }
    return out
