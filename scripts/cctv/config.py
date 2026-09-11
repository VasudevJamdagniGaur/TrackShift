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


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    return raw.strip() if raw not in (None, "") else default


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

    # SIH demo default: aggressive recall-first mode
    detection_mode: str = field(
        default_factory=lambda: _env_str("DETECTION_MODE", "aggressive").lower()
    )
    debug_mode: bool = field(default_factory=lambda: _env_bool("DEBUG_MODE", False))

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

    # Temporal voting (base / normal). apply_mode_defaults() overrides for aggressive.
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
    # Candidate (POTENTIAL) thresholds — separate from CONFIRMED
    candidate_min_votes: int = field(
        default_factory=lambda: _env_int("CANDIDATE_MIN_VOTES", 2)
    )
    candidate_min_ratio: float = field(
        default_factory=lambda: _env_float("CANDIDATE_MIN_RATIO", 0.40)
    )
    candidate_min_avg_conf: float = field(
        default_factory=lambda: _env_float("CANDIDATE_MIN_AVG_CONF", 0.55)
    )

    # Per-frame helmet soft thresholds (not argmax-only)
    no_helmet_candidate_prob: float = field(
        default_factory=lambda: _env_float("NO_HELMET_CANDIDATE_PROB", 0.40)
    )
    no_helmet_strong_prob: float = field(
        default_factory=lambda: _env_float("NO_HELMET_STRONG_PROB", 0.50)
    )
    no_helmet_high_prob: float = field(
        default_factory=lambda: _env_float("NO_HELMET_HIGH_PROB", 0.65)
    )

    # Fallback head localization
    fallback_head_top_ratio: float = field(
        default_factory=lambda: _env_float("FALLBACK_HEAD_TOP_RATIO", 0.45)
    )
    fallback_head_top_ratio_tight: float = field(
        default_factory=lambda: _env_float("FALLBACK_HEAD_TOP_RATIO_TIGHT", 0.35)
    )
    fallback_head_expand: float = field(
        default_factory=lambda: _env_float("FALLBACK_HEAD_EXPAND", 0.15)
    )
    min_head_crop_px: int = field(default_factory=lambda: _env_int("MIN_HEAD_CROP_PX", 96))
    head_classify_size: int = field(
        default_factory=lambda: _env_int("HEAD_CLASSIFY_SIZE", 224)
    )

    # Tracking gap tolerance (frames without observation before track considered stale)
    max_track_gap: int = field(default_factory=lambda: _env_int("MAX_TRACK_GAP", 45))

    # Rescue window (± seconds) around uncertain tracks for best-evidence search
    rescue_window_seconds: float = field(
        default_factory=lambda: _env_float("RESCUE_WINDOW_SECONDS", 0.55)
    )

    # Feature flags
    enable_image_enhancement: bool = field(
        default_factory=lambda: _env_bool("ENABLE_IMAGE_ENHANCEMENT", False)
    )
    enable_helmet_enhance_rescue: bool = field(
        default_factory=lambda: _env_bool("ENABLE_HELMET_ENHANCE_RESCUE", True)
    )
    enable_multi_crop: bool = field(
        default_factory=lambda: _env_bool("ENABLE_MULTI_CROP", True)
    )
    enable_moto_proxy_rider: bool = field(
        default_factory=lambda: _env_bool("ENABLE_MOTO_PROXY_RIDER", True)
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

    def __post_init__(self) -> None:
        self.apply_mode_defaults()

    @property
    def is_aggressive(self) -> bool:
        return self.detection_mode in {"aggressive", "agg", "sih"}

    def apply_mode_defaults(self) -> None:
        """Apply NORMAL vs AGGRESSIVE defaults unless explicitly overridden via env."""
        if not self.is_aggressive:
            return
        # Detector: more candidates (not instant violations)
        if os.getenv("CCTV_DET_CONF") is None:
            self.det_conf = 0.15
        if os.getenv("MIN_TRACK_FRAMES") is None:
            self.min_track_frames = 4
        if os.getenv("MIN_NO_HELMET_RATIO") is None:
            self.min_no_helmet_ratio = 0.50
        if os.getenv("MIN_NO_HELMET_VOTES") is None:
            self.min_no_helmet_votes = 3
        # CONFIRMED still requires solid average confidence, but lower than 0.80
        if os.getenv("MIN_AVG_NO_HELMET_CONFIDENCE") is None:
            self.min_avg_no_helmet_confidence = 0.65
        if os.getenv("CANDIDATE_MIN_RATIO") is None:
            self.candidate_min_ratio = 0.50
        if os.getenv("CANDIDATE_MIN_AVG_CONF") is None:
            self.candidate_min_avg_conf = 0.45
        if os.getenv("CANDIDATE_MIN_VOTES") is None:
            self.candidate_min_votes = 2
        if os.getenv("MAX_TRACK_GAP") is None:
            self.max_track_gap = 60
        if os.getenv("POSE_INTERVAL") is None:
            # Refresh pose more often in aggressive mode
            self.pose_interval = max(self.detection_interval, 6)
        if os.getenv("ENABLE_HELMET_ENHANCE_RESCUE") is None:
            self.enable_helmet_enhance_rescue = True
        if os.getenv("ENABLE_MULTI_CROP") is None:
            self.enable_multi_crop = True
        if os.getenv("ENABLE_MOTO_PROXY_RIDER") is None:
            self.enable_moto_proxy_rider = True


CONFIG = CctvConfig()
