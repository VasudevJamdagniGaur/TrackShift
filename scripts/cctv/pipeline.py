"""
Optimized every-source-frame CCTV forensic pipeline.

Keeps:
  - yolo11l_cctv_ft.pt @ imgsz=1280
  - helmet_head_v2.pt
  - plate_yolo_ft.pt
  - yolo11l-pose.pt

Architecture speedups (no resolution reduction):
  - CUDA + FP16
  - DETECTION_INTERVAL (default 3): YOLO every Nth frame, ByteTrack carry between
  - Pose refresh on interval / new tracks only (crop-based, cached)
  - Batched helmet classification
  - Plate + OCR only for violation candidates (post-pass)
  - Bounded async decode queue
  - Detailed stage profiling
"""

from __future__ import annotations

import json
import time
import uuid
from collections import defaultdict
from pathlib import Path
from queue import Empty, Queue
from threading import Thread
from typing import Any

import cv2
import numpy as np

from .config import CONFIG, CctvConfig
from .model_manager import ModelManager, gpu_info
from .render_video import build_track_display, render_annotated_video
from .road_branch import RoadAnalyzer
from .rider_association import (
    RIDER_CONFIRMED,
    RIDER_NO_RIDER,
    RIDER_UNCERTAIN,
    can_run_helmet_classifier,
    find_best_rider,
    update_rider_state,
)
from .store import CctvStore
from .utils import (
    box_center,
    build_head_crop_variants,
    clamp_box,
    enhance_frame,
    head_crop_from_keypoints,
    quality_score,
    validate_indian_plate,
    weighted_ocr_vote,
)


class Profiler:
    def __init__(self):
        self.times: dict[str, float] = defaultdict(float)
        self.counts: dict[str, int] = defaultdict(int)
        self.t0 = time.perf_counter()

    def add(self, name: str, dt: float):
        self.times[name] += dt
        self.counts[name] += 1

    def snapshot(self) -> dict[str, Any]:
        total = time.perf_counter() - self.t0
        stages = {
            k: {
                "seconds": round(v, 3),
                "calls": self.counts[k],
                "avgMs": round(1000.0 * v / max(1, self.counts[k]), 2),
            }
            for k, v in self.times.items()
        }
        return {
            "totalSeconds": round(total, 3),
            "stages": stages,
        }


class TrackState:
    def __init__(self, track_id: int, frame_idx: int, timestamp: float):
        self.track_id = track_id
        self.first_frame = frame_idx
        self.last_frame = frame_idx
        self.first_timestamp = timestamp
        self.last_timestamp = timestamp
        self.motorcycle_boxes: list[dict] = []
        self.person_boxes: list[dict] = []
        self.helmet_preds: list[dict] = []
        self.quality_samples: list[dict] = []
        self.state = "NORMAL"
        self.best_overall: dict | None = None
        self.best_rider: dict | None = None
        self.best_head: dict | None = None
        self.best_plate_frame: dict | None = None
        self.plate_candidates: list[dict] = []
        self.cached_kpts = None
        self.cached_head_box = None
        self.last_pose_frame = -10_000
        # Rider association state machine
        self.rider_state = RIDER_NO_RIDER
        self.rider_association_score = 0.0
        self.rider_assoc_frames = 0
        self.rider_lost_frames = 0
        self.rider_confirmed_once = False
        self.rider_person_track_id: int | None = None
        self.last_rider_box = None
        self.last_rider_person: dict | None = None
        self.last_rider_assoc: dict | None = None
        self.last_rider_frame = -10_000
        self.helmet_gate_skips = 0

    def touch(self, frame_idx: int, timestamp: float):
        self.last_frame = frame_idx
        self.last_timestamp = timestamp


def read_video_metadata(video_path: Path) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Could not open video — unsupported codec or corrupted file.")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    if fps <= 1e-3:
        fps = 25.0
    duration = frame_count / fps if frame_count > 0 else 0.0
    return {
        "fps": round(fps, 4),
        "width": width,
        "height": height,
        "frameCount": frame_count,
        "durationSeconds": round(duration, 3),
    }


def reject_if_too_long(meta: dict, config: CctvConfig) -> None:
    if meta["durationSeconds"] > config.max_video_duration_seconds:
        raise ValueError("Maximum supported video duration is 5 minutes.")


def soft_helmet_label(helmet_p: float, no_helmet_p: float, config: CctvConfig) -> str:
    """Recall-first soft label: candidate threshold beats pure argmax."""
    if no_helmet_p >= config.no_helmet_candidate_prob:
        return "no_helmet"
    return "no_helmet" if no_helmet_p >= helmet_p else "helmet"


def temporal_decision(track: TrackState, config: CctvConfig) -> dict[str, Any]:
    # Only count helmet votes from confirmed-rider + pose-head evidence.
    # Pose-failed / no-rider frames must not create NO HELMET tickets.
    preds_all = track.helmet_preds

    def _eligible(p: dict) -> bool:
        # Unit-test / legacy records without rider metadata still count
        if "riderState" not in p and "poseSuccess" not in p:
            return True
        if p.get("riderState") != RIDER_CONFIRMED:
            return False
        if not (
            p.get("poseSuccess")
            or str(p.get("headSource") or "").startswith("POSE")
        ):
            return False
        score = p.get("riderAssociationScore")
        if score is not None and float(score) < float(config.min_rider_association_score):
            return False
        return True

    preds = [p for p in preds_all if _eligible(p)]
    n = len(preds)
    if n < config.min_track_frames:
        return {"state": "NORMAL", "reason": "insufficient_frames", **_vote_stats(preds)}

    no_helmet = [p for p in preds if p["prediction"] == "no_helmet"]
    votes = len(no_helmet)
    ratio = votes / n
    avg_conf = (
        float(np.mean([p["noHelmetProbability"] for p in no_helmet])) if no_helmet else 0.0
    )
    # Also consider soft average across ALL frames (helps borderline ensembles)
    avg_nh_all = float(np.mean([p["noHelmetProbability"] for p in preds])) if preds else 0.0
    helmet_votes = [p for p in preds if p["prediction"] == "helmet"]
    helmet_ratio = len(helmet_votes) / n
    avg_helmet = (
        float(np.mean([p["helmetProbability"] for p in helmet_votes])) if helmet_votes else 0.0
    )
    strong_frames = sum(
        1
        for p in no_helmet
        if p["noHelmetProbability"] >= config.no_helmet_strong_prob
    )
    high_frames = sum(
        1 for p in no_helmet if p["noHelmetProbability"] >= config.no_helmet_high_prob
    )

    stats = {
        "trackFrames": n,
        "noHelmetVotes": votes,
        "noHelmetRatio": round(ratio, 4),
        "avgNoHelmetConfidence": round(avg_conf, 4),
        "avgNoHelmetAllFrames": round(avg_nh_all, 4),
        "helmetRatio": round(helmet_ratio, 4),
        "avgHelmetConfidence": round(avg_helmet, 4),
        "strongNoHelmetFrames": strong_frames,
        "highNoHelmetFrames": high_frames,
    }

    if helmet_ratio >= 0.75 and avg_helmet >= 0.78 and ratio < 0.35:
        return {"state": "NORMAL", "reason": "helmet_majority", **stats}

    confirmed = (
        votes >= config.min_no_helmet_votes
        and ratio >= config.min_no_helmet_ratio
        and avg_conf >= config.min_avg_no_helmet_confidence
    ) or (
        high_frames >= 2
        and votes >= config.min_no_helmet_votes
        and avg_conf >= max(0.55, config.min_avg_no_helmet_confidence - 0.05)
    )
    if confirmed:
        return {"state": "CONFIRMED", "reason": "temporal_vote_pass", **stats}

    potential = (
        votes >= config.candidate_min_votes
        and ratio >= config.candidate_min_ratio
        and (avg_conf >= config.candidate_min_avg_conf or avg_nh_all >= config.candidate_min_avg_conf)
    ) or (
        strong_frames >= 2
        and votes >= 2
        and avg_nh_all >= 0.42
    )
    if potential:
        return {"state": "POTENTIAL", "reason": "candidate_evidence", **stats}

    if votes >= 2 and (avg_conf >= 0.40 or avg_nh_all >= 0.42):
        return {"state": "NEEDS_REVIEW", "reason": "borderline_evidence", **stats}

    return {"state": "NORMAL", "reason": "below_threshold", **stats}


def _vote_stats(preds: list[dict]) -> dict:
    if not preds:
        return {
            "trackFrames": 0,
            "noHelmetVotes": 0,
            "noHelmetRatio": 0.0,
            "avgNoHelmetConfidence": 0.0,
        }
    no_helmet = [p for p in preds if p["prediction"] == "no_helmet"]
    return {
        "trackFrames": len(preds),
        "noHelmetVotes": len(no_helmet),
        "noHelmetRatio": round(len(no_helmet) / len(preds), 4),
        "avgNoHelmetConfidence": round(
            float(np.mean([p["noHelmetProbability"] for p in no_helmet])) if no_helmet else 0.0,
            4,
        ),
    }


def annotate_evidence(
    frame: np.ndarray,
    track_id: int,
    timestamp: float,
    no_helmet_conf: float,
    plate_text: str,
    rider_box,
    head_box,
    plate_box,
) -> np.ndarray:
    out = frame.copy()
    if rider_box:
        x1, y1, x2, y2 = map(int, rider_box)
        cv2.rectangle(out, (x1, y1), (x2, y2), (40, 60, 220), 2)
    if head_box:
        x1, y1, x2, y2 = map(int, head_box)
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 0, 255), 2)
    if plate_box:
        x1, y1, x2, y2 = map(int, plate_box)
        cv2.rectangle(out, (x1, y1), (x2, y2), (20, 180, 255), 2)

    lines = [
        f"NO HELMET  Confidence: {int(round(no_helmet_conf * 100))}%",
        f"Vehicle: {plate_text or 'UNREADABLE'}",
        f"Time: {format_ts(timestamp)}",
        f"Track: #{track_id}",
    ]
    y = 28
    for line in lines:
        cv2.rectangle(out, (8, y - 20), (8 + 12 * len(line), y + 6), (0, 0, 0), -1)
        cv2.putText(
            out, line, (12, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA
        )
        y += 26
    return out


def format_ts(seconds: float) -> str:
    m = int(seconds // 60)
    s = seconds - m * 60
    return f"{m:02d}:{s:05.2f}"


def _parse_det_result(results, names) -> tuple[list[dict], list[dict]]:
    people: list[dict] = []
    bikes: list[dict] = []
    if results.boxes is None or len(results.boxes) == 0:
        return people, bikes
    ids = results.boxes.id
    h = int(results.orig_shape[0])
    w = int(results.orig_shape[1])
    for i, box in enumerate(results.boxes):
        cls_id = int(box.cls.item())
        conf = float(box.conf.item())
        xyxy = [float(v) for v in box.xyxy[0].tolist()]
        clipped = clamp_box(*xyxy, w, h)
        if not clipped:
            continue
        track_id = int(ids[i].item()) if ids is not None else -1
        name = names.get(cls_id, str(cls_id))
        item = {"box": clipped, "confidence": conf, "trackId": track_id, "class": name}
        if name == "person":
            people.append(item)
        elif name == "motorcycle":
            bikes.append(item)
    return people, bikes


def _start_decoder(video_path: Path, queue_size: int) -> tuple[Queue, Thread, dict]:
    q: Queue = Queue(maxsize=max(2, queue_size))
    meta = {"stopped": False}

    def worker():
        cap = cv2.VideoCapture(str(video_path))
        while not meta["stopped"]:
            ok, frame = cap.read()
            if not ok:
                q.put(None)
                break
            q.put(frame)
        cap.release()

    t = Thread(target=worker, daemon=True)
    t.start()
    return q, t, meta


class ForensicPipeline:
    def __init__(self, config: CctvConfig | None = None, store: CctvStore | None = None):
        self.config = config or CONFIG
        self.store = store or CctvStore(self.config.data_dir)
        self.models = ModelManager(self.config)

    def run_job(self, job_id: str) -> dict:
        job = self.store.get_job(job_id)
        if not job:
            raise RuntimeError(f"Unknown job: {job_id}")
        video_id = job["videoId"]
        video = self.store.get_video(video_id)
        if not video:
            raise RuntimeError(f"Unknown video: {video_id}")

        video_path = Path(video["storedPath"])
        meta = video["metadata"]
        try:
            reject_if_too_long(meta, self.config)
        except ValueError as exc:
            return self.store.update_job(
                job_id, status="FAILED", error=str(exc), finishedAt=_now()
            )

        self.store.update_job(
            job_id,
            status="PROCESSING",
            startedAt=_now(),
            totalFrames=meta["frameCount"],
            processedFrames=0,
            progressPercentage=0,
            detections=0,
            activeTracks=0,
            candidateViolations=0,
            confirmedViolations=0,
            platesRead=0,
            motorcycles=0,
            processingFps=0,
            etaSeconds=None,
            gpu=gpu_info(),
            profiling=None,
            error=None,
        )

        try:
            result = self._process_video(job_id, video_id, video_path, meta)
            return self.store.update_job(
                job_id,
                status="COMPLETED",
                finishedAt=_now(),
                progressPercentage=100,
                processedFrames=meta["frameCount"],
                etaSeconds=0,
                annotatedVideoPath=result.get("annotatedVideoPath"),
                annotatedVideoUrl=result.get("annotatedVideoUrl"),
                **result["jobStats"],
                summary=result["summary"],
                profiling=result["profiling"],
                gpu=result.get("gpu") or gpu_info(),
            )
        except Exception as exc:
            return self.store.update_job(
                job_id,
                status="FAILED",
                error=str(exc),
                finishedAt=_now(),
            )

    def _process_video(self, job_id: str, video_id: str, video_path: Path, meta: dict) -> dict:
        loaded = self.models.load_all(require_ocr=False)
        det = loaded["motorcycle"]
        helmet = loaded["helmet"]
        pose = loaded["pose"]
        plate_det = loaded["plate"]
        ocr = loaded["ocr"]
        road_model = loaded.get("road")
        yolo_kw = self.models.yolo_kwargs()
        imgsz = int(self.config.imgsz)  # MUST remain 1280
        assert imgsz == 1280 or imgsz >= 1280, "Detector imgsz must stay >= 1280"
        det_interval = max(1, int(self.config.detection_interval))
        pose_interval = max(det_interval, int(self.config.pose_interval))

        out_dir = self.config.public_dir / video_id
        evidence_dir = out_dir / "evidence"
        road_evidence_dir = out_dir / "road_evidence"
        evidence_dir.mkdir(parents=True, exist_ok=True)
        road_evidence_dir.mkdir(parents=True, exist_ok=True)
        job_dir = self.config.data_dir / "jobs" / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        timeline_path = job_dir / "timeline.jsonl"

        fps = float(meta["fps"])
        total = int(meta["frameCount"])
        profiler = Profiler()

        road_analyzer = None
        if self.config.enable_road_damage and road_model is not None:
            road_analyzer = RoadAnalyzer(
                road_model,
                conf=self.config.road_conf,
                imgsz=self.config.road_imgsz,
                interval=self.config.road_interval,
                yolo_kwargs=yolo_kw,
            )

        # Annotated video is rendered AFTER analysis from timeline (no second ML pass)
        timeline_f = open(timeline_path, "w", encoding="utf-8")

        frame_q, decoder_thread, decoder_meta = _start_decoder(
            video_path, self.config.frame_queue_size
        )

        tracks: dict[int, TrackState] = {}
        moto_ids: set[int] = set()
        frame_idx = 0
        last_progress = time.time()
        last_people: list[dict] = []
        last_bikes: list[dict] = []
        t_wall0 = time.perf_counter()

        try:
            return self._analyze_and_finalize(
                job_id=job_id,
                video_id=video_id,
                video_path=video_path,
                meta=meta,
                out_dir=out_dir,
                evidence_dir=evidence_dir,
                road_evidence_dir=road_evidence_dir,
                job_dir=job_dir,
                timeline_path=timeline_path,
                timeline_f=timeline_f,
                frame_q=frame_q,
                decoder_meta=decoder_meta,
                det=det,
                helmet=helmet,
                pose=pose,
                plate_det=plate_det,
                ocr=ocr,
                road_analyzer=road_analyzer,
                yolo_kw=yolo_kw,
                imgsz=imgsz,
                det_interval=det_interval,
                pose_interval=pose_interval,
                fps=fps,
                total=total,
                profiler=profiler,
                tracks=tracks,
                moto_ids=moto_ids,
                frame_idx=frame_idx,
                last_progress=last_progress,
                last_people=last_people,
                last_bikes=last_bikes,
                t_wall0=t_wall0,
            )
        finally:
            try:
                timeline_f.close()
            except Exception:
                pass
            decoder_meta["stopped"] = True

    def _analyze_and_finalize(self, **ctx) -> dict:
        """Frame loop + plate OCR + annotated video render (no second ML pass for overlays)."""
        job_id = ctx["job_id"]
        video_id = ctx["video_id"]
        video_path = ctx["video_path"]
        meta = ctx["meta"]
        evidence_dir = ctx["evidence_dir"]
        road_evidence_dir = ctx.get("road_evidence_dir") or (evidence_dir.parent / "road_evidence")
        job_dir = ctx["job_dir"]
        timeline_path = ctx["timeline_path"]
        timeline_f = ctx["timeline_f"]
        frame_q = ctx["frame_q"]
        decoder_meta = ctx["decoder_meta"]
        det = ctx["det"]
        helmet = ctx["helmet"]
        pose = ctx["pose"]
        plate_det = ctx["plate_det"]
        ocr = ctx["ocr"]
        road_analyzer: RoadAnalyzer | None = ctx.get("road_analyzer")
        yolo_kw = ctx["yolo_kw"]
        imgsz = ctx["imgsz"]
        det_interval = ctx["det_interval"]
        pose_interval = ctx["pose_interval"]
        fps = ctx["fps"]
        total = ctx["total"]
        profiler = ctx["profiler"]
        tracks = ctx["tracks"]
        moto_ids = ctx["moto_ids"]
        frame_idx = ctx["frame_idx"]
        last_progress = ctx["last_progress"]
        last_people = ctx["last_people"]
        last_bikes = ctx["last_bikes"]
        t_wall0 = ctx["t_wall0"]
        debug_logs: list[dict] = []

        while True:
            t_decode = time.perf_counter()
            try:
                frame = frame_q.get(timeout=60)
            except Empty:
                raise RuntimeError("Frame decode queue stalled.")
            profiler.add("decode", time.perf_counter() - t_decode)
            if frame is None:
                break

            timestamp = frame_idx / fps
            infer = (
                enhance_frame(frame, True)
                if self.config.enable_image_enhancement
                else frame
            )

            run_detector = frame_idx % det_interval == 0 or frame_idx == 0
            if run_detector:
                t_yolo = time.perf_counter()
                results = det.track(
                    source=infer,
                    conf=self.config.det_conf,
                    persist=True,
                    tracker="bytetrack.yaml",
                    imgsz=imgsz,
                    **yolo_kw,
                )[0]
                profiler.add("yolo", time.perf_counter() - t_yolo)
                people, bikes = _parse_det_result(results, det.names)
                # CRITICAL: never wipe carry-state with an empty detection frame.
                # Sparse CCTV detections (e.g. moto only at 00:03.83) must persist.
                if bikes:
                    last_bikes = bikes
                else:
                    bikes = last_bikes
                if people:
                    last_people = people
                else:
                    people = last_people
            else:
                t_trk = time.perf_counter()
                # Tracker carry: reuse last detections/track IDs for temporal coverage
                people, bikes = last_people, last_bikes
                profiler.add("tracking", time.perf_counter() - t_trk)

            for bike in bikes:
                if bike["trackId"] >= 0:
                    moto_ids.add(bike["trackId"])

            # Build rider associations first; helmet only after RIDER_CONFIRMED
            pending_helmet: list[dict] = []
            crop_batch: list = []
            crop_owners: list[tuple[int, int]] = []  # (pending_idx, variant_idx)
            frame_anns: list[dict] = []

            for bike in bikes:
                tid = bike["trackId"] if bike["trackId"] >= 0 else -1
                if tid < 0:
                    # Stable-ish synthetic id from moto center (avoid collapsing
                    # many parked bikes into a single 900000 mega-track).
                    mx = int((bike["box"][0] + bike["box"][2]) * 0.5)
                    my = int((bike["box"][1] + bike["box"][3]) * 0.5)
                    tid = 900000 + ((mx // 40) % 200) * 200 + (my // 40) % 200
                if tid not in tracks:
                    tracks[tid] = TrackState(tid, frame_idx, timestamp)
                track = tracks[tid]
                track.touch(frame_idx, timestamp)

                if len(track.motorcycle_boxes) < 200 or frame_idx % 5 == 0:
                    track.motorcycle_boxes.append(
                        {
                            "frame": frame_idx,
                            "timestamp": timestamp,
                            "box": bike["box"],
                            "conf": bike["confidence"],
                        }
                    )

                rider, assoc = find_best_rider(
                    bike["box"],
                    people,
                    expand=self.config.rider_roi_expansion,
                    min_score=self.config.min_rider_association_score,
                    person_min_conf=self.config.person_min_confidence,
                    last_rider_box=track.last_rider_box,
                    last_person_track_id=track.rider_person_track_id,
                )
                # NOTE: ENABLE_MOTO_PROXY_RIDER no longer invents riders from moto
                # crops. Empty motorcycles stay NO_RIDER (no helmet / pose / OCR).

                rider_state = update_rider_state(
                    track,
                    person=rider,
                    assoc=assoc,
                    frame_idx=frame_idx,
                    min_score=self.config.min_rider_association_score,
                    min_frames=self.config.min_rider_track_frames,
                    lost_grace_frames=self.config.rider_lost_grace_frames,
                )

                if rider is not None:
                    track.person_boxes.append(
                        {
                            "frame": frame_idx,
                            "timestamp": timestamp,
                            "box": rider["box"],
                            "conf": rider["confidence"],
                            "source": "PERSON",
                            "assocScore": assoc.get("score"),
                            "riderState": rider_state,
                        }
                    )
                    if len(track.person_boxes) > 400:
                        track.person_boxes = track.person_boxes[-200:]

                # Default annotation: motorcycle with rider state (no helmet claim)
                ann = {
                    "id": tid,
                    "box": rider["box"] if rider is not None else bike["box"],
                    "moto": bike["box"],
                    "head": None,
                    "pred": None,
                    "nh": None,
                    "h": None,
                    "src": None,
                    "pose": False,
                    "riderState": rider_state,
                    "riderScore": round(float(assoc.get("score") or 0.0), 4),
                    "motoConf": round(float(bike["confidence"]), 4),
                    "helmetAnalyzed": False,
                    "personConf": round(float(rider["confidence"]), 4)
                    if rider is not None
                    else None,
                }

                # CRITICAL GATE: no person / not confirmed → no pose, no helmet, no OCR
                if rider is None or rider_state != RIDER_CONFIRMED:
                    track.helmet_gate_skips += 1
                    if self.config.debug_mode:
                        debug_logs.append(
                            {
                                "trackId": tid,
                                "timestamp": round(timestamp, 4),
                                "frame": frame_idx,
                                "motorcycleConfidence": ann["motoConf"],
                                "personDetected": rider is not None,
                                "personConfidence": ann["personConf"],
                                "riderAssociationScore": ann["riderScore"],
                                "riderState": rider_state,
                                "poseSuccess": False,
                                "headCropSource": None,
                                "prediction": "NOT_ANALYZED",
                                "helmetGate": "blocked",
                                "assocReject": assoc.get("reject"),
                                "assocFactors": assoc.get("factors"),
                            }
                        )
                    frame_anns.append(ann)
                    continue

                # ---- Confirmed rider: pose → head → helmet ----
                need_pose = (
                    track.cached_kpts is None
                    or (frame_idx - track.last_pose_frame) >= pose_interval
                    or run_detector
                )
                kpts = track.cached_kpts
                pose_ok = False
                if need_pose:
                    t_pose = time.perf_counter()
                    x1, y1, x2, y2 = map(int, rider["box"])
                    pad = 8
                    x1, y1 = max(0, x1 - pad), max(0, y1 - pad)
                    x2, y2 = min(frame.shape[1], x2 + pad), min(frame.shape[0], y2 + pad)
                    crop = infer[y1:y2, x1:x2]
                    if crop.size:
                        pose_res = pose.predict(
                            source=crop,
                            conf=0.20 if self.config.is_aggressive else 0.25,
                            imgsz=320,
                            **yolo_kw,
                        )[0]
                        if (
                            pose_res.keypoints is not None
                            and len(pose_res.keypoints) > 0
                        ):
                            local = pose_res.keypoints.data[0].cpu().numpy()
                            mapped = local.copy()
                            mapped[:, 0] += x1
                            mapped[:, 1] += y1
                            head_pts = mapped[:5]
                            if np.any(head_pts[:, 2] >= 0.20):
                                kpts = mapped
                                track.cached_kpts = kpts
                                track.last_pose_frame = frame_idx
                                pose_ok = True
                    profiler.add("pose", time.perf_counter() - t_pose)
                elif track.cached_kpts is not None:
                    pose_ok = True
                    kpts = track.cached_kpts

                variants: list[dict] = []
                if pose_ok:
                    if self.config.enable_multi_crop or self.config.is_aggressive:
                        variants = build_head_crop_variants(
                            frame,
                            rider["box"],
                            kpts=kpts,
                            top_ratio=self.config.fallback_head_top_ratio,
                            top_ratio_tight=self.config.fallback_head_top_ratio_tight,
                            expand=self.config.fallback_head_expand,
                            min_px=self.config.min_head_crop_px,
                            classify_size=self.config.head_classify_size,
                            include_enhanced=self.config.enable_helmet_enhance_rescue,
                        )
                        # Prefer pose-derived crops; keep pose-enhanced only
                        has_pose = any(
                            str(v.get("source", "")).startswith("POSE") for v in variants
                        )
                        if has_pose:
                            variants = [
                                v
                                for v in variants
                                if str(v.get("source", "")).startswith("POSE")
                            ]
                    else:
                        head_img, head_box = head_crop_from_keypoints(
                            frame, kpts, rider["box"]
                        )
                        if head_img is not None:
                            variants.append(
                                {
                                    "source": "POSE",
                                    "box": head_box,
                                    "image": head_img,
                                    "raw": head_img,
                                }
                            )
                elif self.config.allow_fallback_head_after_rider:
                    # Pose failed: person-bbox fallback for display/rescue only.
                    # Do NOT feed no-helmet temporal votes from these crops.
                    variants = build_head_crop_variants(
                        frame,
                        rider["box"],
                        kpts=None,
                        top_ratio=self.config.fallback_head_top_ratio,
                        top_ratio_tight=self.config.fallback_head_top_ratio_tight,
                        expand=self.config.fallback_head_expand,
                        min_px=self.config.min_head_crop_px,
                        classify_size=self.config.head_classify_size,
                        include_enhanced=self.config.enable_helmet_enhance_rescue,
                    )
                    track.rider_state = RIDER_UNCERTAIN
                    ann["riderState"] = RIDER_UNCERTAIN
                    ann["helmetAnalyzed"] = False
                    if variants:
                        ann["head"] = variants[0].get("box")
                        ann["src"] = variants[0].get("source")
                    track.helmet_gate_skips += 1
                    if self.config.debug_mode:
                        debug_logs.append(
                            {
                                "trackId": tid,
                                "timestamp": round(timestamp, 4),
                                "frame": frame_idx,
                                "motorcycleConfidence": ann["motoConf"],
                                "personDetected": True,
                                "personConfidence": ann["personConf"],
                                "riderAssociationScore": ann["riderScore"],
                                "riderState": RIDER_UNCERTAIN,
                                "poseSuccess": False,
                                "headCropSource": ann.get("src"),
                                "prediction": "NOT_ANALYZED",
                                "helmetGate": "pose_failed_uncertain",
                            }
                        )
                    frame_anns.append(ann)
                    continue
                else:
                    track.rider_state = RIDER_UNCERTAIN
                    ann["riderState"] = RIDER_UNCERTAIN
                    track.helmet_gate_skips += 1
                    if self.config.debug_mode:
                        debug_logs.append(
                            {
                                "trackId": tid,
                                "timestamp": round(timestamp, 4),
                                "frame": frame_idx,
                                "motorcycleConfidence": ann["motoConf"],
                                "personDetected": True,
                                "personConfidence": ann["personConf"],
                                "riderAssociationScore": ann["riderScore"],
                                "riderState": RIDER_UNCERTAIN,
                                "poseSuccess": False,
                                "headCropSource": None,
                                "prediction": "NOT_ANALYZED",
                                "helmetGate": "pose_failed_no_fallback",
                            }
                        )
                    frame_anns.append(ann)
                    continue

                head_available = bool(variants)
                # For gate: treat confirmed+pose OR confirmed+allowed fallback as OK
                gate_track_state = RIDER_CONFIRMED
                saved_state = track.rider_state
                track.rider_state = gate_track_state
                ok_gate, gate_reason = can_run_helmet_classifier(
                    track,
                    min_score=self.config.min_rider_association_score,
                    person_min_conf=self.config.person_min_confidence,
                    head_available=head_available,
                )
                track.rider_state = saved_state
                if not ok_gate or not variants:
                    track.helmet_gate_skips += 1
                    ann["riderState"] = saved_state if saved_state else RIDER_UNCERTAIN
                    if self.config.debug_mode:
                        debug_logs.append(
                            {
                                "trackId": tid,
                                "timestamp": round(timestamp, 4),
                                "frame": frame_idx,
                                "motorcycleConfidence": ann["motoConf"],
                                "personDetected": True,
                                "personConfidence": ann["personConf"],
                                "riderAssociationScore": ann["riderScore"],
                                "riderState": ann["riderState"],
                                "poseSuccess": pose_ok,
                                "headCropSource": None,
                                "prediction": "NOT_ANALYZED",
                                "helmetGate": gate_reason,
                            }
                        )
                    frame_anns.append(ann)
                    continue

                pending_idx = len(pending_helmet)
                pending_helmet.append(
                    {
                        "track": track,
                        "tid": tid,
                        "bike": bike,
                        "rider": rider,
                        "rider_source": "PERSON",
                        "pose_ok": pose_ok,
                        "variants": variants,
                        "assoc": assoc,
                        "ann": ann,
                        "rider_state": RIDER_CONFIRMED if pose_ok else RIDER_UNCERTAIN,
                    }
                )
                for vi, var in enumerate(variants):
                    crop_batch.append(var["image"])
                    crop_owners.append((pending_idx, vi))

            # Batched helmet inference across all crop variants (confirmed riders only)
            if pending_helmet and crop_batch:
                t_hel = time.perf_counter()
                results_h: list[tuple[str, float, float]] = []
                bs = max(1, self.config.helmet_batch_size)
                for i in range(0, len(crop_batch), bs):
                    results_h.extend(helmet.classify_batch(crop_batch[i : i + bs]))
                profiler.add("helmet", time.perf_counter() - t_hel)

                per_item: list[list[tuple[dict, tuple]]] = [[] for _ in pending_helmet]
                for (pi, vi), res in zip(crop_owners, results_h):
                    per_item[pi].append((pending_helmet[pi]["variants"][vi], res))

                for item, variant_results in zip(pending_helmet, per_item):
                    if not variant_results:
                        frame_anns.append(item["ann"])
                        continue
                    track = item["track"]
                    rider = item["rider"]
                    bike = item["bike"]
                    tid = item["tid"]
                    ann = item["ann"]

                    scored = sorted(
                        variant_results,
                        key=lambda vr: float(vr[1][2]),
                        reverse=True,
                    )
                    best_var, (_pred0, best_h, best_nh) = scored[0]
                    top_nh = [float(vr[1][2]) for vr in scored[: min(3, len(scored))]]
                    top_h = [float(vr[1][1]) for vr in scored[: min(3, len(scored))]]
                    no_helmet_p = float(np.mean(top_nh))
                    no_helmet_max = float(best_nh)
                    helmet_p = float(np.mean(top_h))
                    if self.config.is_aggressive:
                        no_helmet_p = 0.5 * no_helmet_p + 0.5 * no_helmet_max
                    pred = soft_helmet_label(helmet_p, no_helmet_p, self.config)
                    head_box = best_var.get("box")
                    head_img = best_var.get("raw")
                    if head_img is None:
                        head_img = best_var.get("image")
                    head_source = best_var.get("source", "UNKNOWN")

                    if head_box is not None:
                        track.cached_head_box = head_box

                    q = quality_score(frame, rider["box"], rider["confidence"])
                    hq = quality_score(
                        frame, head_box or rider["box"], max(helmet_p, no_helmet_p)
                    )
                    pred_rec = {
                        "frame": frame_idx,
                        "timestamp": timestamp,
                        "prediction": pred,
                        "helmetProbability": round(helmet_p, 4),
                        "noHelmetProbability": round(no_helmet_p, 4),
                        "noHelmetMax": round(no_helmet_max, 4),
                        "riderBox": rider["box"],
                        "headBox": head_box,
                        "quality": q,
                        "headQuality": hq,
                        "headSource": head_source,
                        "riderSource": item["rider_source"],
                        "poseSuccess": bool(item["pose_ok"]),
                        "motorcycleConfidence": round(float(bike["confidence"]), 4),
                        "personConfidence": round(float(rider["confidence"]), 4),
                        "riderAssociationScore": round(
                            float(item["assoc"].get("score") or 0.0), 4
                        ),
                        "riderState": item["rider_state"],
                        "cropCount": len(variant_results),
                    }
                    track.helmet_preds.append(pred_rec)
                    if len(track.helmet_preds) > 600:
                        track.helmet_preds = track.helmet_preds[-400:]

                    if self.config.debug_mode or (
                        self.config.is_aggressive and pred == "no_helmet"
                    ):
                        debug_logs.append(
                            {
                                "trackId": tid,
                                "timestamp": round(timestamp, 4),
                                "frame": frame_idx,
                                "motorcycleConfidence": pred_rec["motorcycleConfidence"],
                                "personDetected": True,
                                "personConfidence": pred_rec["personConfidence"],
                                "riderAssociationScore": pred_rec["riderAssociationScore"],
                                "riderState": pred_rec["riderState"],
                                "poseSuccess": pred_rec["poseSuccess"],
                                "headCropSource": head_source,
                                "headCropSize": None
                                if head_img is None
                                else [int(head_img.shape[1]), int(head_img.shape[0])],
                                "helmetProbability": pred_rec["helmetProbability"],
                                "noHelmetProbability": pred_rec["noHelmetProbability"],
                                "prediction": pred,
                                "riderSource": item["rider_source"],
                                "helmetGate": "ok",
                            }
                        )

                    ann.update(
                        {
                            "box": rider["box"],
                            "head": head_box,
                            "pred": pred,
                            "nh": round(no_helmet_p, 4),
                            "h": round(helmet_p, 4),
                            "src": head_source,
                            "pose": bool(item["pose_ok"]),
                            "helmetAnalyzed": True,
                            "riderState": item["rider_state"],
                        }
                    )
                    frame_anns.append(ann)

                    overall_score = q["score"] * (0.5 + 0.5 * no_helmet_p)
                    overall = {**pred_rec, "score": overall_score}
                    if track.best_overall is None or overall_score > track.best_overall["score"]:
                        track.best_overall = {
                            **overall,
                            "image": frame.copy(),
                            "headImage": None if head_img is None else head_img.copy(),
                        }
                    if (
                        track.best_rider is None
                        or q["score"] > track.best_rider["quality"]["score"]
                    ):
                        track.best_rider = {
                            **pred_rec,
                            "image": frame.copy(),
                            "headImage": None if head_img is None else head_img.copy(),
                        }
                    if (
                        track.best_head is None
                        or hq["score"] > track.best_head["headQuality"]["score"]
                    ):
                        track.best_head = {
                            **pred_rec,
                            "image": frame.copy(),
                            "headImage": None if head_img is None else head_img.copy(),
                        }

                    if (
                        self.config.enable_plate_ocr
                        and pred == "no_helmet"
                        and no_helmet_p >= (0.45 if self.config.is_aggressive else 0.7)
                        and q["score"] >= 0.30
                        and item["rider_state"] == RIDER_CONFIRMED
                    ):
                        mx1, my1, mx2, my2 = bike["box"]
                        region = clamp_box(
                            mx1 - 20,
                            my1 - 20,
                            mx2 + 20,
                            my2 + 20,
                            frame.shape[1],
                            frame.shape[0],
                        )
                        if region:
                            cand = {
                                "frame": frame_idx,
                                "timestamp": timestamp,
                                "region": region,
                                "quality": q["score"],
                                "noHelmetProbability": no_helmet_p,
                            }
                            track.plate_candidates.append(cand)
                            if (
                                track.best_plate_frame is None
                                or cand["quality"] * cand["noHelmetProbability"]
                                > track.best_plate_frame["quality"]
                                * track.best_plate_frame["noHelmetProbability"]
                            ):
                                track.best_plate_frame = cand
                            if len(track.plate_candidates) > 30:
                                track.plate_candidates = sorted(
                                    track.plate_candidates,
                                    key=lambda c: c["quality"] * c["noHelmetProbability"],
                                    reverse=True,
                                )[:20]

            # ---- ROAD DAMAGE BRANCH (same decoded frame, no second video open) ----
            road_overlay: list[dict] = []
            if road_analyzer is not None:
                road_analyzer.process_frame(frame, frame_idx, timestamp, profiler=profiler)
                road_overlay = road_analyzer.frame_overlays.get(frame_idx, [])

            # Persist lightweight frame annotations for post-hoc video render
            timeline_f.write(
                json.dumps(
                    {
                        "f": frame_idx,
                        "t": round(timestamp, 4),
                        "tracks": frame_anns,
                        "road": road_overlay,
                    }
                )
                + "\n"
            )

            frame_idx += 1
            now = time.time()
            if now - last_progress > 1.0 or frame_idx == total:
                elapsed = max(1e-3, time.perf_counter() - t_wall0)
                proc_fps = frame_idx / elapsed
                remaining = max(0, total - frame_idx)
                eta = remaining / max(1e-3, proc_fps)
                pct = int(round(100.0 * frame_idx / max(1, total)))
                active = sum(1 for t in tracks.values() if frame_idx - t.last_frame <= 15)
                candidates = sum(
                    1
                    for t in tracks.values()
                    if temporal_decision(t, self.config)["state"]
                    in {"POTENTIAL", "CONFIRMED", "NEEDS_REVIEW"}
                )
                self.store.update_job(
                    job_id,
                    processedFrames=frame_idx,
                    progressPercentage=min(99, pct),
                    detections=sum(len(t.helmet_preds) for t in tracks.values()),
                    activeTracks=active,
                    candidateViolations=candidates,
                    motorcycles=len(moto_ids),
                    processingFps=round(proc_fps, 2),
                    etaSeconds=round(eta, 1),
                    gpu=gpu_info(),
                    profiling=profiler.snapshot(),
                )
                last_progress = now

        # -------- Post-pass: plate detection + OCR only for candidates --------
        violations = []
        plates_read = 0
        plates_detected = 0

        for tid, track in tracks.items():
            decision = temporal_decision(track, self.config)
            track.state = decision["state"]
            # Ticket gate: no helmet votes without confirmed rider analysis
            if not track.helmet_preds or not getattr(track, "rider_confirmed_once", False):
                track.state = "NORMAL"
                continue
            if track.state not in {"POTENTIAL", "CONFIRMED", "NEEDS_REVIEW"}:
                continue

            plate_text = ""
            plate_conf = 0.0
            plate_status = "NEEDS_REVIEW"
            plate_box = None
            plate_crop_path = None
            ocr_reads = []

            if self.config.enable_plate_ocr and ocr.available:
                candidates = sorted(
                    track.plate_candidates,
                    key=lambda c: c["quality"] * c["noHelmetProbability"],
                    reverse=True,
                )[: self.config.best_plate_frames]
                if track.best_overall is not None:
                    candidates = [
                        {
                            "frame": track.best_overall["frame"],
                            "timestamp": track.best_overall["timestamp"],
                            "region": track.best_overall["riderBox"],
                            "quality": track.best_overall["quality"]["score"],
                            "noHelmetProbability": track.best_overall[
                                "noHelmetProbability"
                            ],
                        }
                    ] + candidates

                seek = cv2.VideoCapture(str(video_path))
                seen = set()
                for cand in candidates:
                    if cand["frame"] in seen:
                        continue
                    seen.add(cand["frame"])
                    if track.best_overall and cand["frame"] == track.best_overall["frame"]:
                        img = track.best_overall["image"]
                    else:
                        seek.set(cv2.CAP_PROP_POS_FRAMES, cand["frame"])
                        ok_s, img = seek.read()
                        if not ok_s or img is None:
                            continue

                    t_plate = time.perf_counter()
                    plate_res = plate_det.predict(
                        source=img,
                        conf=self.config.plate_conf,
                        imgsz=imgsz,
                        **yolo_kw,
                    )[0]
                    profiler.add("plate", time.perf_counter() - t_plate)

                    if plate_res.boxes is None or len(plate_res.boxes) == 0:
                        continue
                    plates_detected += 1
                    best_plate = None
                    best_d = 1e18
                    rcx, rcy = box_center(cand["region"])
                    for box in plate_res.boxes:
                        xyxy = [float(v) for v in box.xyxy[0].tolist()]
                        clipped = clamp_box(*xyxy, img.shape[1], img.shape[0])
                        if not clipped:
                            continue
                        pcx, pcy = box_center(clipped)
                        d = (pcx - rcx) ** 2 + (pcy - rcy) ** 2
                        if d < best_d:
                            best_d = d
                            best_plate = (clipped, float(box.conf.item()))
                    if not best_plate:
                        continue
                    pbox, pconf = best_plate
                    x1, y1, x2, y2 = pbox
                    crop = img[y1:y2, x1:x2]
                    t_ocr = time.perf_counter()
                    text, oconf = ocr.read(crop)
                    profiler.add("ocr", time.perf_counter() - t_ocr)
                    if text:
                        ocr_reads.append(
                            {
                                "text": text,
                                "confidence": oconf * (0.5 + 0.5 * pconf),
                                "frame": cand["frame"],
                                "timestamp": cand["timestamp"],
                                "box": pbox,
                                "crop": crop,
                                "detConf": pconf,
                            }
                        )
                seek.release()

                vote = weighted_ocr_vote(ocr_reads)
                plate_text = vote["normalizedText"]
                plate_conf = vote["confidence"]
                plate_status = vote["plateStatus"]
                if plate_conf < self.config.min_plate_ocr_confidence:
                    plate_status = "NEEDS_REVIEW"
                if ocr_reads:
                    best_read = max(ocr_reads, key=lambda r: r["confidence"])
                    plate_box = best_read["box"]
                    plate_crop_path = evidence_dir / f"track{tid}_plate.jpg"
                    cv2.imwrite(str(plate_crop_path), best_read["crop"])
                    if plate_text:
                        plates_read += 1

            primary = track.best_overall or track.best_rider or track.best_head
            if primary is None:
                continue

            # UI ticket status: CONFIRMED only when temporal rules pass; else NEEDS_REVIEW
            ticket_status = "CONFIRMED" if track.state == "CONFIRMED" else "NEEDS_REVIEW"
            ticket_number = len(violations) + 1
            violation_id = f"VIO-{video_id[:8]}-{tid}-{uuid.uuid4().hex[:6]}"
            annotated_img = annotate_evidence(
                primary["image"],
                tid,
                primary["timestamp"],
                decision.get("avgNoHelmetConfidence", primary["noHelmetProbability"]),
                plate_text,
                primary.get("riderBox"),
                primary.get("headBox"),
                plate_box,
            )
            cv2.imwrite(str(evidence_dir / f"{violation_id}_primary.jpg"), primary["image"])
            cv2.imwrite(str(evidence_dir / f"{violation_id}_annotated.jpg"), annotated_img)
            if primary.get("headImage") is not None:
                cv2.imwrite(str(evidence_dir / f"{violation_id}_head.jpg"), primary["headImage"])

            supporting = []
            for sample in sorted(
                [p for p in track.helmet_preds if p["prediction"] == "no_helmet"],
                key=lambda p: p["noHelmetProbability"] * p["quality"]["score"],
                reverse=True,
            )[:5]:
                if sample["frame"] == primary["frame"]:
                    supporting.append(
                        {
                            "frameNumber": sample["frame"],
                            "timestamp": sample["timestamp"],
                            "path": f"/cctv/{video_id}/evidence/{violation_id}_primary.jpg",
                        }
                    )

            violation = {
                "violationId": violation_id,
                "ticketId": f"TKT-{ticket_number:03d}",
                "ticketNumber": ticket_number,
                "videoId": video_id,
                "jobId": job_id,
                "trackId": tid,
                "violationType": "NO_HELMET",
                "timestamp": primary["timestamp"],
                "frameNumber": primary["frame"],
                "helmetConfidence": round(
                    float(
                        np.mean([p["helmetProbability"] for p in track.helmet_preds])
                        if track.helmet_preds
                        else 0.0
                    ),
                    4,
                ),
                "noHelmetConfidence": decision.get(
                    "avgNoHelmetConfidence", primary["noHelmetProbability"]
                ),
                "temporalConfidence": decision.get("noHelmetRatio", 0.0),
                "temporalStats": decision,
                "plateText": plate_text or None,
                "plateConfidence": round(plate_conf, 4) if plate_text else 0.0,
                "plateStatus": plate_status if plate_text else "NEEDS_REVIEW",
                "plateValidation": validate_indian_plate(plate_text) if plate_text else None,
                "gpsLatitude": None,
                "gpsLongitude": None,
                "status": ticket_status,
                "pipelineState": track.state,
                "primaryEvidencePath": f"/cctv/{video_id}/evidence/{violation_id}_primary.jpg",
                "annotatedEvidencePath": f"/cctv/{video_id}/evidence/{violation_id}_annotated.jpg",
                "headCropPath": f"/cctv/{video_id}/evidence/{violation_id}_head.jpg",
                "plateCropPath": (
                    f"/cctv/{video_id}/evidence/track{tid}_plate.jpg" if plate_crop_path else None
                ),
                "supportingFrames": supporting,
                "createdAt": _now(),
                "caseType": "AI_DETECTED_VIOLATION_CASE",
            }
            self.store.save_violation(violation)
            violations.append(violation)

            track.best_overall = None
            track.best_rider = None
            track.best_head = None
            track.plate_candidates = []

        # Sort tickets by timestamp for stable numbering display (already sequential as created)
        violations.sort(key=lambda v: (v["timestamp"], v["trackId"]))
        for i, v in enumerate(violations, start=1):
            v["ticketNumber"] = i
            v["ticketId"] = f"TKT-{i:03d}"
            self.store.save_violation(v)

        confirmed = [v for v in violations if v["status"] == "CONFIRMED"]
        needs_review = [v for v in violations if v["status"] == "NEEDS_REVIEW"]

        # ---- Finalize ROAD DAMAGE events (aggregator) ----
        road_events: list[dict] = []
        road_summary: dict = {
            "roadEvents": 0,
            "roadRawHits": 0,
            "byCategory": {},
            "byClass": {},
            "potholes": 0,
            "cracks": 0,
            "surfaceDamage": 0,
        }
        if road_analyzer is not None:
            road_events = road_analyzer.finalize_events(
                video_id=video_id,
                job_id=job_id,
                evidence_dir=Path(road_evidence_dir),
                public_prefix=f"/cctv/{video_id}/road_evidence",
            )
            for ev in road_events:
                self.store.save_road_event(ev)
            road_summary = road_analyzer.summary(road_events)
            road_analyzer.write_timeline(job_dir / "road_timeline.jsonl")
            with open(job_dir / "road_events.json", "w", encoding="utf-8") as rf:
                json.dump(road_events, rf, indent=2)

        # Persist debug helmet logs for SIH tuning
        if debug_logs:
            dbg_path = job_dir / "debug_helmet.jsonl"
            with open(dbg_path, "w", encoding="utf-8") as df:
                for row in debug_logs:
                    df.write(json.dumps(row) + "\n")

        # -------- Post-hoc annotated video (NO second ML inference) --------
        annotated_video_url = None
        annotated_video_path = None
        video_encode_error = None
        if self.config.enable_output_video:
            # Persist violation counts BEFORE encode so UI is not stuck at "Confirmed: 0"
            self.store.update_job(
                job_id,
                progressPercentage=99,
                status="PROCESSING",
                stage="ENCODING_VIDEO",
                etaSeconds=None,
                confirmedViolations=len(confirmed),
                candidateViolations=len(needs_review) + len(confirmed),
                platesRead=plates_read,
                platesDetected=plates_detected,
                motorcycles=len(moto_ids),
                roadEvents=road_summary.get("roadEvents", 0),
                roadPotholes=road_summary.get("potholes", 0),
                roadCracks=road_summary.get("cracks", 0),
            )
            t_render = time.perf_counter()
            tracks_meta: dict[int, dict] = {}
            for tid, track in tracks.items():
                d = temporal_decision(track, self.config)
                tracks_meta[tid] = {
                    "state": track.state or d["state"],
                    "avgNoHelmetConfidence": d.get("avgNoHelmetConfidence", 0),
                    "avgNoHelmetAllFrames": d.get("avgNoHelmetAllFrames", 0),
                    "avgHelmetConfidence": d.get("avgHelmetConfidence", 0),
                    "helmetRatio": d.get("helmetRatio", 0),
                    "helmetVotes": int(
                        round(float(d.get("helmetRatio", 0)) * float(d.get("trackFrames", 0)))
                    ),
                    "helmetConfidence": d.get("avgHelmetConfidence", 0),
                    "debugMode": bool(self.config.debug_mode),
                    "riderState": getattr(track, "rider_state", RIDER_NO_RIDER),
                    "riderAssociationScore": float(
                        getattr(track, "rider_association_score", 0.0) or 0.0
                    ),
                    "riderConfirmedOnce": bool(
                        getattr(track, "rider_confirmed_once", False)
                    ),
                    "helmetGateSkips": int(getattr(track, "helmet_gate_skips", 0) or 0),
                    "helmetPredCount": len(track.helmet_preds),
                }
            tracks_meta_path = job_dir / "tracks_meta.json"
            with open(tracks_meta_path, "w", encoding="utf-8") as mf:
                json.dump({str(k): v for k, v in tracks_meta.items()}, mf)

            violations_by_track = {int(v["trackId"]): v for v in violations}
            track_display = build_track_display(tracks_meta, violations_by_track)
            with open(job_dir / "track_display.json", "w", encoding="utf-8") as df:
                json.dump({str(k): v for k, v in track_display.items()}, df)

            annotated_path = job_dir / "annotated.mp4"
            try:
                playable_path = render_annotated_video(
                    source_video=video_path,
                    timeline_path=timeline_path,
                    track_display=track_display,
                    output_path=annotated_path,
                    fps=fps,
                    width=int(meta["width"]),
                    height=int(meta["height"]),
                )
                annotated_path = Path(playable_path)
                public_annotated = self.config.public_dir / video_id / annotated_path.name
                public_annotated.parent.mkdir(parents=True, exist_ok=True)
                try:
                    import shutil as _shutil

                    _shutil.copy2(annotated_path, public_annotated)
                except Exception:
                    pass
                annotated_video_path = str(annotated_path)
                annotated_video_url = f"/api/cctv/jobs/{job_id}/video"
            except Exception as enc_exc:
                # Analysis + tickets already saved — do NOT fail the whole job at 99%.
                video_encode_error = str(enc_exc)
                # Keep raw OpenCV mp4 if present for offline use / later re-encode
                if annotated_path.exists() and annotated_path.stat().st_size > 1000:
                    annotated_video_path = str(annotated_path)
                annotated_video_url = (
                    f"/api/cctv/jobs/{job_id}/video" if annotated_video_path else None
                )

            profiler.add("output_video", time.perf_counter() - t_render)

        profiling = profiler.snapshot()
        elapsed = profiling["totalSeconds"]
        summary = {
            "framesAnalyzed": total,
            "motorcycles": len(moto_ids),
            "tracks": len(tracks),
            "noHelmetCandidates": len(needs_review) + len(confirmed),
            "confirmedViolations": len(confirmed),
            "needsReviewViolations": len(needs_review),
            "licensePlatesRecognized": plates_read,
            "platesDetected": plates_detected,
            "annotatedVideoPath": annotated_video_path,
            "annotatedVideoUrl": annotated_video_url,
            "detectionInterval": det_interval,
            "imgsz": imgsz,
            "detectionMode": self.config.detection_mode,
            "detConf": self.config.det_conf,
            "processingSeconds": elapsed,
            "processingFps": round(total / max(1e-3, elapsed), 2),
            "debugLogCount": len(debug_logs),
            "videoEncodeError": video_encode_error,
            "roadDamage": road_summary,
            "analysisBranches": ["traffic", "road"]
            if road_analyzer is not None
            else ["traffic"],
        }
        self.store.save_video(
            {
                **(self.store.get_video(video_id) or {"videoId": video_id}),
                "summary": summary,
                "annotatedVideoPath": annotated_video_path,
                "annotatedVideoUrl": annotated_video_url,
            }
        )
        return {
            "jobStats": {
                "detections": sum(len(t.helmet_preds) for t in tracks.values()),
                "activeTracks": 0,
                "candidateViolations": len(needs_review) + len(confirmed),
                "confirmedViolations": len(confirmed),
                "platesRead": plates_read,
                "platesDetected": plates_detected,
                "motorcycles": len(moto_ids),
                "processingFps": summary["processingFps"],
                "roadEvents": road_summary.get("roadEvents", 0),
                "roadPotholes": road_summary.get("potholes", 0),
                "roadCracks": road_summary.get("cracks", 0),
            },
            "summary": summary,
            "profiling": profiling,
            "gpu": gpu_info(),
            "violations": violations,
            "annotatedVideoPath": annotated_video_path,
            "annotatedVideoUrl": annotated_video_url,
            "videoEncodeError": video_encode_error,
            "roadEvents": road_events,
            "roadSummary": road_summary,
        }


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
