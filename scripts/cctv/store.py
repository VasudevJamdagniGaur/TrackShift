"""JSON file-backed store for CCTV jobs / videos / violations."""

from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

from .config import CONFIG


def _atomic_write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def _read(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class CctvStore:
    def __init__(self, root: Path | None = None):
        self.root = root or CONFIG.data_dir
        self.jobs_dir = self.root / "jobs"
        self.videos_dir = self.root / "videos"
        self.violations_dir = self.root / "violations"
        self.index_path = self.root / "index.json"
        for d in (self.jobs_dir, self.videos_dir, self.violations_dir):
            d.mkdir(parents=True, exist_ok=True)
        if not self.index_path.exists():
            _atomic_write(
                self.index_path,
                {"videos": [], "jobs": [], "violations": [], "updatedAt": _now()},
            )

    def job_path(self, job_id: str) -> Path:
        return self.jobs_dir / f"{job_id}.json"

    def video_path(self, video_id: str) -> Path:
        return self.videos_dir / f"{video_id}.json"

    def violation_path(self, violation_id: str) -> Path:
        return self.violations_dir / f"{violation_id}.json"

    def save_job(self, job: dict) -> dict:
        job = {**job, "updatedAt": _now()}
        _atomic_write(self.job_path(job["jobId"]), job)
        self._touch_index("jobs", job["jobId"])
        return job

    def get_job(self, job_id: str) -> dict | None:
        return _read(self.job_path(job_id))

    def update_job(self, job_id: str, **fields) -> dict:
        job = self.get_job(job_id) or {"jobId": job_id}
        job.update(fields)
        return self.save_job(job)

    def save_video(self, video: dict) -> dict:
        video = {**video, "updatedAt": _now()}
        _atomic_write(self.video_path(video["videoId"]), video)
        self._touch_index("videos", video["videoId"])
        return video

    def get_video(self, video_id: str) -> dict | None:
        return _read(self.video_path(video_id))

    def save_violation(self, violation: dict) -> dict:
        violation = {**violation, "updatedAt": _now()}
        _atomic_write(self.violation_path(violation["violationId"]), violation)
        self._touch_index("violations", violation["violationId"])
        return violation

    def get_violation(self, violation_id: str) -> dict | None:
        return _read(self.violation_path(violation_id))

    def list_violations(self, video_id: str | None = None) -> list[dict]:
        items = []
        for path in sorted(self.violations_dir.glob("*.json"), reverse=True):
            data = _read(path)
            if not data:
                continue
            if video_id and data.get("videoId") != video_id:
                continue
            items.append(data)
        return items

    def list_jobs(self) -> list[dict]:
        items = []
        for path in sorted(self.jobs_dir.glob("*.json"), reverse=True):
            data = _read(path)
            if data:
                items.append(data)
        return items

    def dashboard_stats(self) -> dict:
        jobs = self.list_jobs()
        violations = self.list_violations()
        videos = [_read(p) for p in self.videos_dir.glob("*.json")]
        videos = [v for v in videos if v]
        confirmed = [v for v in violations if v.get("status") == "CONFIRMED"]
        potential = [v for v in violations if v.get("status") == "POTENTIAL"]
        plates_ok = [
            v
            for v in violations
            if v.get("plateText") and v.get("plateStatus") != "NEEDS_REVIEW"
        ]
        plates_bad = [
            v
            for v in violations
            if not v.get("plateText") or v.get("plateStatus") == "NEEDS_REVIEW"
        ]
        return {
            "totalVideos": len(videos),
            "totalJobs": len(jobs),
            "totalMotorcycles": sum(int(j.get("motorcycles", 0) or 0) for j in jobs),
            "totalPotentialViolations": len(potential),
            "totalConfirmedViolations": len(confirmed),
            "platesIdentified": len(plates_ok),
            "platesUnreadable": len(plates_bad),
            "processingJobs": len([j for j in jobs if j.get("status") == "PROCESSING"]),
        }

    def _touch_index(self, key: str, item_id: str) -> None:
        index = _read(self.index_path, {"videos": [], "jobs": [], "violations": []})
        arr = index.setdefault(key, [])
        if item_id not in arr:
            arr.insert(0, item_id)
        index["updatedAt"] = _now()
        _atomic_write(self.index_path, index)


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
