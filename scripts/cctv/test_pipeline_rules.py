"""Unit tests for CCTV forensic rules (duration, voting, dedup)."""

from __future__ import annotations

import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.cctv.config import CctvConfig
from scripts.cctv.pipeline import TrackState, reject_if_too_long, temporal_decision
from scripts.cctv.utils import validate_indian_plate, weighted_ocr_vote


class DurationTests(unittest.TestCase):
    def test_reject_over_5_minutes(self):
        cfg = CctvConfig(max_video_duration_seconds=300)
        with self.assertRaises(ValueError) as ctx:
            reject_if_too_long({"durationSeconds": 301}, cfg)
        self.assertIn("Maximum supported video duration is 5 minutes.", str(ctx.exception))

    def test_allow_exactly_5_minutes(self):
        cfg = CctvConfig(max_video_duration_seconds=300)
        reject_if_too_long({"durationSeconds": 300}, cfg)

    def test_frame_expectations(self):
        # Documentation invariants for native FPS processing
        self.assertEqual(30 * 30, 900)
        self.assertEqual(30 * 60, 1800)
        self.assertEqual(30 * 300, 9000)
        self.assertEqual(60 * 300, 18000)


class VotingTests(unittest.TestCase):
    def _track(self, preds):
        t = TrackState(1, 0, 0.0)
        t.helmet_preds = preds
        return t

    def test_one_hundred_no_helmet_frames_single_candidate(self):
        cfg = CctvConfig()
        preds = [
            {
                "prediction": "no_helmet",
                "helmetProbability": 0.05,
                "noHelmetProbability": 0.95,
            }
            for _ in range(100)
        ]
        decision = temporal_decision(self._track(preds), cfg)
        self.assertEqual(decision["state"], "CONFIRMED")
        self.assertEqual(decision["noHelmetVotes"], 100)

    def test_one_blurry_no_helmet_among_helmet_majority(self):
        cfg = CctvConfig()
        preds = [
            {
                "prediction": "helmet",
                "helmetProbability": 0.9,
                "noHelmetProbability": 0.1,
            }
            for _ in range(20)
        ]
        preds.append(
            {
                "prediction": "no_helmet",
                "helmetProbability": 0.2,
                "noHelmetProbability": 0.91,
            }
        )
        decision = temporal_decision(self._track(preds), cfg)
        self.assertEqual(decision["state"], "NORMAL")


class PlateTests(unittest.TestCase):
    def test_indian_plate_validation(self):
        self.assertTrue(validate_indian_plate("DL01AB1234")["valid"])
        self.assertFalse(validate_indian_plate("XXXX")["valid"])

    def test_weighted_ocr_vote(self):
        vote = weighted_ocr_vote(
            [
                {"text": "DL01AB1234", "confidence": 0.82},
                {"text": "DL01AB1234", "confidence": 0.94},
                {"text": "DL01AB1284", "confidence": 0.61},
            ]
        )
        self.assertEqual(vote["normalizedText"], "DL01AB1234")


if __name__ == "__main__":
    unittest.main()
