"""Central configuration for the CCTV forensic helmet pipeline."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return float(raw) if raw not in (None, "") else default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw not in (None, "") else default


@dataclass
class CctvConfig:
    max_video_duration_seconds: int = field(
        default_factory=lambda: _env_int("MAX_VIDEO_DURATION_SECONDS", 300)
    )
    process_every_frame: bool = field(
        default_factory=lambda: _env_bool("PROCESS_EVERY_FRAME", True)
    )
    process_native_fps: bool = field(
        default_factory=lambda: _env_bool("PROCESS_NATIVE_FPS", True)
    )

    # Architecture optimizations (quality preserved: detector imgsz stays 1280)
    imgsz: int = field(default_factory=lambda: _env_int("CCTV_IMGSZ", 1280))
    detection_interval: int = field(
        default_factory=lambda: _env_int("DETECTION_INTERVAL", 3)
    )
    pose_interval: int = field(default_factory=lambda: _env_int("POSE_INTERVAL", 9))
    helmet_batch_size: int = field(
        default_factory=lambda: _env_int("HELMET_BATCH_SIZE", 16)
    )
    frame_queue_size: int = field(
        default_factory=lambda: _env_int("FRAME_QUEUE_SIZE", 8)
    )
    use_half: bool = field(default_factory=lambda: _env_bool("CCTV_FP16", True))
    device: str = field(
        default_factory=lambda: os.getenv("CCTV_DEVICE", "0")  # CUDA device index
    )

    # Temporal voting
    min_track_frames: int = field(default_factory=lambda: _env_int("MIN_TRACK_FRAMES", 5))
    min_no_helmet_votes: int = field(
        default_factory=lambda: _env_int("MIN_NO_HELMET_VOTES", 3)
    )
    min_no_helmet_ratio: float = field(
        default_factory=lambda: _env_float("MIN_NO_HELMET_RATIO", 0.60)
    )
    min_avg_no_helmet_confidence: float = field(
        default_factory=lambda: _env_float("MIN_AVG_NO_HELMET_CONFIDENCE", 0.80)
    )

    # Feature flags — enhancement off by default (expensive; originals retained)
    enable_image_enhancement: bool = field(
        default_factory=lambda: _env_bool("ENABLE_IMAGE_ENHANCEMENT", False)
    )
    enable_plate_ocr: bool = field(
        default_factory=lambda: _env_bool("ENABLE_PLATE_OCR", True)
    )
    enable_output_video: bool = field(
        default_factory=lambda: _env_bool("ENABLE_OUTPUT_VIDEO", True)
    )
    min_plate_ocr_confidence: float = field(
        default_factory=lambda: _env_float("MIN_PLATE_OCR_CONFIDENCE", 0.70)
    )

    det_conf: float = field(default_factory=lambda: _env_float("CCTV_DET_CONF", 0.25))
    plate_conf: float = field(default_factory=lambda: _env_float("CCTV_PLATE_CONF", 0.25))
    best_plate_frames: int = field(
        default_factory=lambda: _env_int("CCTV_BEST_PLATE_FRAMES", 5)
    )

    data_dir: Path = field(default_factory=lambda: ROOT / "data" / "cctv")
    public_dir: Path = field(default_factory=lambda: ROOT / "public" / "cctv")
    motorcycle_weights: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CCTV_MOTORCYCLE_WEIGHTS",
                str(ROOT / "models" / "helmet-v5" / "models" / "yolo11l_cctv_ft.pt"),
            )
        )
    )
    helmet_weights: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CCTV_HELMET_WEIGHTS",
                str(ROOT / "models" / "helmet-v5" / "models" / "helmet_head_v2.pt"),
            )
        )
    )
    pose_weights: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CCTV_POSE_WEIGHTS",
                str(ROOT / "models" / "pose" / "yolo11l-pose.pt"),
            )
        )
    )
    plate_weights: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CCTV_PLATE_WEIGHTS",
                str(ROOT / "models" / "helmet-v5" / "models" / "plate_yolo_ft.pt"),
            )
        )
    )
    ocr_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv(
                "CCTV_OCR_DIR",
                str(
                    ROOT
                    / "models"
                    / "helmet-v5"
                    / "models"
                    / "trocr_indian_plates_v3"
                    / "final"
                ),
            )
        )
    )


CONFIG = CctvConfig()
