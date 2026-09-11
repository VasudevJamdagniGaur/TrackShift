"""Safe model loading for Helmet-v5 forensic pipeline (CUDA + FP16)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
from torchvision import models, transforms
from ultralytics import YOLO

from .config import CONFIG, CctvConfig


class ModelLoadError(RuntimeError):
    pass


def _require_file(path: Path, label: str) -> Path:
    if not path.exists():
        raise ModelLoadError(
            f"Missing {label} weights at '{path}'. "
            f"Download from Hugging Face vivekvar/helmet-v5 or set the matching env path."
        )
    return path


def resolve_device(config: CctvConfig) -> str | int:
    if not torch.cuda.is_available():
        return "cpu"
    raw = str(config.device).strip().lower()
    if raw in {"cpu"}:
        return "cpu"
    if raw.startswith("cuda"):
        return raw
    # Ultralytics prefers int device index for CUDA
    try:
        return int(raw)
    except ValueError:
        return 0


def torch_device(device: str | int) -> str:
    if device == "cpu":
        return "cpu"
    if isinstance(device, int):
        return f"cuda:{device}"
    return str(device)


def gpu_info() -> dict[str, Any]:
    if not torch.cuda.is_available():
        return {"name": "cpu", "memoryAllocatedMb": 0, "memoryReservedMb": 0}
    idx = torch.cuda.current_device()
    return {
        "name": torch.cuda.get_device_name(idx),
        "memoryAllocatedMb": round(torch.cuda.memory_allocated(idx) / (1024 * 1024), 1),
        "memoryReservedMb": round(torch.cuda.memory_reserved(idx) / (1024 * 1024), 1),
    }


class HelmetClassifier:
    """EfficientNet-B0 helmet / no_helmet classifier (helmet_head_v2) with batching."""

    def __init__(self, weights: Path, device: str, use_half: bool = True):
        ckpt = torch.load(weights, map_location="cpu", weights_only=False)
        if isinstance(ckpt, dict) and "labels" in ckpt:
            self.labels = list(ckpt["labels"])
            state = ckpt.get("state_dict") or ckpt.get("model") or ckpt
        else:
            self.labels = ["helmet", "no_helmet"]
            state = ckpt
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(self.labels))
        model.load_state_dict(state)
        model.eval().to(device)
        self.use_half = use_half and device != "cpu"
        if self.use_half:
            model = model.half()
        self.model = model
        self.device = device
        self.tfm = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )

    def _tensor(self, crop_bgr):
        import cv2
        from PIL import Image

        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        t = self.tfm(Image.fromarray(rgb))
        if self.use_half:
            t = t.half()
        return t

    def classify(self, crop_bgr) -> tuple[str, float, float]:
        results = self.classify_batch([crop_bgr])
        return results[0] if results else ("?", 0.0, 0.0)

    def classify_batch(self, crops: list) -> list[tuple[str, float, float]]:
        import numpy as np

        if not crops:
            return []
        valid_idx = []
        tensors = []
        out: list[tuple[str, float, float]] = [("?", 0.0, 0.0)] * len(crops)
        for i, crop in enumerate(crops):
            if crop is None or getattr(crop, "size", 0) == 0:
                continue
            valid_idx.append(i)
            tensors.append(self._tensor(crop))
        if not tensors:
            return out
        batch = torch.stack(tensors).to(self.device, non_blocking=True)
        with torch.no_grad():
            logits = self.model(batch)
            probs = torch.softmax(logits.float(), dim=1).cpu().numpy()
        for j, i in enumerate(valid_idx):
            label_to_p = {
                self.labels[k]: float(probs[j][k]) for k in range(len(self.labels))
            }
            helmet_p = label_to_p.get("helmet", 0.0)
            no_helmet_p = label_to_p.get("no_helmet", 0.0)
            pred = "no_helmet" if no_helmet_p >= helmet_p else "helmet"
            out[i] = (pred, helmet_p, no_helmet_p)
        return out


class PlateOCR:
    def __init__(self, model_dir: Path, device: str, use_half: bool = True):
        self.available = model_dir.exists() and (model_dir / "model.safetensors").exists()
        self.processor = None
        self.model = None
        self.device = device
        self.use_half = use_half and device != "cpu"
        if not self.available:
            return
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        self.processor = TrOCRProcessor.from_pretrained(str(model_dir))
        self.model = VisionEncoderDecoderModel.from_pretrained(str(model_dir))
        self.model.to(device)
        if self.use_half:
            try:
                self.model.half()
            except Exception:
                self.use_half = False
        self.model.eval()

    def read(self, crop_bgr) -> tuple[str, float]:
        import cv2
        import re
        from PIL import Image

        if not self.available or crop_bgr is None or crop_bgr.size == 0:
            return "", 0.0
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        if max(h, w) < 80:
            scale = 120 / max(h, w)
            rgb = cv2.resize(
                rgb, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC
            )
        pil = Image.fromarray(rgb)
        inputs = self.processor(images=pil, return_tensors="pt")
        pixel_values = inputs.pixel_values.to(self.device)
        if self.use_half:
            pixel_values = pixel_values.half()
        with torch.no_grad():
            ids = self.model.generate(pixel_values, max_new_tokens=24)
        text = self.processor.batch_decode(ids, skip_special_tokens=True)[0]
        cleaned = re.sub(r"[^A-Za-z0-9]", "", text).upper()
        conf = 0.9 if len(cleaned) >= 8 else (0.55 if len(cleaned) >= 6 else 0.25)
        return cleaned, conf


class ModelManager:
    def __init__(self, config: CctvConfig | None = None):
        self.config = config or CONFIG
        self.device = resolve_device(self.config)
        self.torch_dev = torch_device(self.device)
        self.use_half = bool(self.config.use_half and self.torch_dev != "cpu")
        self._motorcycle: YOLO | None = None
        self._helmet: HelmetClassifier | None = None
        self._pose: YOLO | None = None
        self._plate: YOLO | None = None
        self._ocr: PlateOCR | None = None

    def load_motorcycle_detector(self) -> YOLO:
        if self._motorcycle is None:
            path = _require_file(self.config.motorcycle_weights, "motorcycle/person detector")
            self._motorcycle = YOLO(str(path))
        return self._motorcycle

    def load_helmet_classifier(self) -> HelmetClassifier:
        if self._helmet is None:
            path = _require_file(self.config.helmet_weights, "helmet classifier")
            self._helmet = HelmetClassifier(path, self.torch_dev, use_half=self.use_half)
        return self._helmet

    def load_pose_model(self) -> YOLO:
        if self._pose is None:
            path = _require_file(self.config.pose_weights, "pose model")
            self._pose = YOLO(str(path))
        return self._pose

    def load_plate_detector(self) -> YOLO:
        if self._plate is None:
            path = _require_file(self.config.plate_weights, "plate detector")
            self._plate = YOLO(str(path))
        return self._plate

    def load_ocr(self) -> PlateOCR:
        if self._ocr is None:
            self._ocr = PlateOCR(self.config.ocr_dir, self.torch_dev, use_half=self.use_half)
        return self._ocr

    def yolo_kwargs(self) -> dict[str, Any]:
        return {
            "device": self.device,
            "half": self.use_half,
            "verbose": False,
        }

    def load_all(self, require_ocr: bool = False) -> dict[str, Any]:
        loaded = {
            "device": self.device,
            "useHalf": self.use_half,
            "imgsz": self.config.imgsz,
            "motorcycle": self.load_motorcycle_detector(),
            "helmet": self.load_helmet_classifier(),
            "pose": self.load_pose_model(),
            "plate": self.load_plate_detector(),
            "gpu": gpu_info(),
        }
        ocr = self.load_ocr()
        loaded["ocr"] = ocr
        if require_ocr and not ocr.available:
            raise ModelLoadError(
                f"OCR weights missing at '{self.config.ocr_dir}'. "
                "Download trocr_indian_plates_v3/final from vivekvar/helmet-v5."
            )
        return loaded
