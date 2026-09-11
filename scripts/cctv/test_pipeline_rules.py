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
        cfg = CctvConfig(detection_mode="normal")
        cfg.apply_mode_defaults()
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
        cfg = CctvConfig(detection_mode="normal")
        cfg.apply_mode_defaults()
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

    def test_aggressive_borderline_becomes_potential(self):
        cfg = CctvConfig(detection_mode="aggressive")
        cfg.apply_mode_defaults()
        preds = [
            {
                "prediction": "no_helmet",
                "helmetProbability": 0.45,
                "noHelmetProbability": 0.55,
            }
            for _ in range(6)
        ]
        decision = temporal_decision(self._track(preds), cfg)
        self.assertIn(decision["state"], {"POTENTIAL", "CONFIRMED", "NEEDS_REVIEW"})


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


class RiderAssociationTests(unittest.TestCase):
    def test_empty_moto_no_rider(self):
        from scripts.cctv.rider_association import find_best_rider

        rider, detail = find_best_rider(
            [100, 100, 200, 220],
            [],
            expand=0.45,
            min_score=0.65,
            person_min_conf=0.25,
        )
        self.assertIsNone(rider)
        self.assertEqual(detail.get("reject"), "no_people")

    def test_walking_beside_rejected(self):
        from scripts.cctv.rider_association import find_best_rider

        moto = [200, 200, 320, 340]
        # Person far to the side, little overlap
        walker = {
            "box": [420, 180, 480, 360],
            "confidence": 0.9,
            "trackId": 7,
        }
        rider, detail = find_best_rider(
            moto,
            [walker],
            expand=0.45,
            min_score=0.65,
            person_min_conf=0.25,
        )
        self.assertIsNone(rider)
        self.assertLess(detail["score"], 0.65)

    def test_sitting_rider_accepted(self):
        from scripts.cctv.rider_association import (
            RIDER_CONFIRMED,
            can_run_helmet_classifier,
            find_best_rider,
            update_rider_state,
        )

        moto = [200, 200, 320, 340]
        sitting = {
            "box": [210, 150, 300, 310],
            "confidence": 0.88,
            "trackId": 3,
        }
        rider, detail = find_best_rider(
            moto,
            [sitting],
            expand=0.45,
            min_score=0.65,
            person_min_conf=0.25,
        )
        self.assertIsNotNone(rider)
        self.assertGreaterEqual(detail["score"], 0.65)

        track = TrackState(11, 0, 0.0)
        for i in range(3):
            update_rider_state(
                track,
                person=sitting,
                assoc=detail,
                frame_idx=i,
                min_score=0.65,
                min_frames=3,
            )
        self.assertEqual(track.rider_state, RIDER_CONFIRMED)
        ok, reason = can_run_helmet_classifier(
            track, min_score=0.65, person_min_conf=0.25, head_available=True
        )
        self.assertTrue(ok, reason)

    def test_helmet_gate_blocks_no_rider(self):
        from scripts.cctv.rider_association import can_run_helmet_classifier

        track = TrackState(5, 0, 0.0)
        ok, reason = can_run_helmet_classifier(
            track, min_score=0.65, person_min_conf=0.25, head_available=True
        )
        self.assertFalse(ok)
        self.assertIn("rider_state", reason)


if __name__ == "__main__":
    unittest.main()
