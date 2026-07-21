import unittest
from pathlib import Path

from training.ml.train import require_cuda
from training.ml.dataset import require_private_output_dir


class _CpuTorch:
    class cuda:
        @staticmethod
        def is_available():
            return False


class TrainPreflightTests(unittest.TestCase):
    def test_cpu_only_torch_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'CUDA'):
            require_cuda(_CpuTorch())

    def test_private_output_guard_rejects_public_model_directory(self):
        with self.assertRaises(ValueError):
            require_private_output_dir(Path('public/models/chess-piece'))


if __name__ == '__main__':
    unittest.main()
