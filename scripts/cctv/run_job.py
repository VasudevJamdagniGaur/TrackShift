#!/usr/bin/env python3
"""CLI entry for background CCTV forensic jobs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.cctv.config import CONFIG  # noqa: E402
from scripts.cctv.pipeline import ForensicPipeline, read_video_metadata, reject_if_too_long  # noqa: E402
from scripts.cctv.store import CctvStore  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--probe-video", type=str, default=None)
    args = parser.parse_args()

    if args.probe_video:
        meta = read_video_metadata(Path(args.probe_video))
        try:
            reject_if_too_long(meta, CONFIG)
            print(json.dumps({"ok": True, "metadata": meta}))
            return 0
        except ValueError as exc:
            print(json.dumps({"ok": False, "error": str(exc), "metadata": meta}))
            return 2

    store = CctvStore()
    pipeline = ForensicPipeline(store=store)
    result = pipeline.run_job(args.job_id)
    print(json.dumps({"ok": result.get("status") == "COMPLETED", "job": result}))
    return 0 if result.get("status") == "COMPLETED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
