import unittest

from training.ml.contract import CLASS_NAMES
from training.ml.metrics import board_reconstruction_metrics, classification_metrics


class MetricTests(unittest.TestCase):
    def test_metrics_cover_all_classes_even_when_absent(self):
        metrics = classification_metrics([0, 1, 1, 2], [0, 1, 2, 2], CLASS_NAMES)
        self.assertEqual(len(metrics['per_class']), 13)
        self.assertEqual(metrics['accuracy'], 0.75)
        self.assertEqual(metrics['per_class'][3]['support'], 0)
        self.assertEqual(metrics['per_class'][3]['f1'], 0.0)

    def test_one_wrong_square_prevents_exact_board_reconstruction(self):
        metrics = board_reconstruction_metrics(['board-a'] * 64, [0] * 64, [0] * 63 + [1])
        self.assertEqual(metrics['boards'], 1)
        self.assertEqual(metrics['exact_board_accuracy'], 0.0)
        self.assertEqual(metrics['mean_incorrect_squares'], 1.0)


if __name__ == '__main__':
    unittest.main()
