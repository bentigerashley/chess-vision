import tempfile
import unittest
from pathlib import Path

import numpy as np

from training.ml.real_eval import (
    evaluate_predictions,
    labels_from_fen,
    readiness_verdict,
    rectify_real_board,
)


STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'


class RealEvaluationTests(unittest.TestCase):
    def _record(self, record_id='board-1', group_id='game-1'):
        return {'id': record_id, 'group_id': group_id, 'fen': STARTING_FEN}

    def test_fen_truth_has_empty_and_known_piece_classes(self):
        labels = labels_from_fen(STARTING_FEN)
        self.assertEqual(len(labels), 64)
        self.assertEqual(labels[0], 10)  # a8 black rook
        self.assertEqual(labels[48], 1)  # a2 white pawn
        self.assertEqual(labels[16], 0)  # a6 empty

    def test_one_wrong_square_blocks_exact_board_but_preserves_occupancy_evidence(self):
        record = self._record()
        truth = labels_from_fen(STARTING_FEN)
        prediction = truth.copy()
        prediction[0] = 9
        metrics = evaluate_predictions([record], {'board-1': prediction}, {'board-1': [0.99] * 64})
        self.assertEqual(metrics['board_reconstruction']['exact_placement_accuracy'], 0.0)
        self.assertEqual(metrics['board_reconstruction']['mean_incorrect_squares'], 1.0)
        self.assertEqual(metrics['occupancy']['recall'], 1.0)

    def test_empty_accuracy_cannot_pass_a_ready_gate(self):
        record = self._record()
        prediction = [0] * 64
        metrics = evaluate_predictions([record], {'board-1': prediction}, {'board-1': [0.99] * 64})
        verdict = readiness_verdict(metrics, {
            'kind': 'held-out-real-photo', 'expected_records': 1, 'complete': True,
        })
        self.assertFalse(verdict['passed'])
        self.assertTrue(any('occupied_recall' in reason for reason in verdict['reasons']))

    def test_incomplete_or_smoke_manifest_can_never_pass(self):
        record = self._record()
        truth = labels_from_fen(STARTING_FEN)
        metrics = evaluate_predictions([record], {'board-1': truth}, {'board-1': [0.99] * 64})
        verdict = readiness_verdict(metrics, {
            'kind': 'smoke', 'expected_records': 2, 'complete': False,
        })
        self.assertFalse(verdict['passed'])
        self.assertIn('benchmark_is_not_a_held_out_real_photo_set', verdict['reasons'])
        self.assertIn('benchmark_is_incomplete', verdict['reasons'])

    def test_rectification_preserves_canonical_corner_order(self):
        image = np.zeros((4, 4, 3), dtype=np.uint8)
        image[0, 0] = [1, 2, 3]
        image[0, 3] = [4, 5, 6]
        image[3, 3] = [7, 8, 9]
        image[3, 0] = [10, 11, 12]
        result = rectify_real_board(image, [[0, 0], [3, 0], [3, 3], [0, 3]], size=4)
        self.assertEqual(result[0, 0].tolist(), [1, 2, 3])
        self.assertEqual(result[3, 3].tolist(), [7, 8, 9])


if __name__ == '__main__':
    unittest.main()
