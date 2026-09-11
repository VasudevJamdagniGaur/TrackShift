"""Re-encode an existing job's annotated.mp4 → browser H.264 without re-running ML."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.cctv.render_video import _ensure_browser_mp4  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--job-id", required=True)
    args = ap.parse_args()
    job_path = ROOT / "data" / "cctv" / "jobs" / f"{args.job_id}.json"
    job_dir = ROOT / "data" / "cctv" / "jobs" / args.job_id
    src = job_dir / "annotated.mp4"
    if not src.exists():
        print(json.dumps({"ok": False, "error": f"missing {src}"}))
        return 1
    playable = _ensure_browser_mp4(src)
    job = json.loads(job_path.read_text(encoding="utf-8"))
    job["annotatedVideoPath"] = str(playable.resolve())
    job["annotatedVideoUrl"] = f"/api/cctv/jobs/{args.job_id}/video"
    job["status"] = "COMPLETED"
    job["error"] = None
    job["progressPercentage"] = 100
    job["stage"] = "DONE"
    if job.get("summary"):
        job["summary"]["annotatedVideoPath"] = job["annotatedVideoPath"]
        job["summary"]["annotatedVideoUrl"] = job["annotatedVideoUrl"]
        job["summary"]["videoEncodeError"] = None
    job_path.write_text(json.dumps(job, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "path": str(playable), "size": playable.stat().st_size}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
