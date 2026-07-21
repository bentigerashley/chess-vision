import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from training.ml.contract import build_model_contract, validate_model_contract
from training.ml.dataset import sha256_file
from training.ml.verify_export import validate_artifact_bindings


class ExportContractTests(unittest.TestCase):
    def test_private_contract_cannot_claim_pwa_eligibility(self):
        contract = build_model_contract('model.onnx', 'best.pt')
        self.assertFalse(contract['promotion']['pwa_eligible'])
        validate_model_contract(contract)
        contract['promotion']['pwa_eligible'] = True
        with self.assertRaises(ValueError):
            validate_model_contract(contract)

    def test_artifact_bindings_reject_a_stale_checkpoint(self):
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            checkpoint = root / 'best.pt'
            onnx = root / 'model.onnx'
            checkpoint.write_bytes(b'checkpoint-a')
            onnx.write_bytes(b'onnx-a')
            contract = build_model_contract('model.onnx', 'best.pt', sha256_file(checkpoint), sha256_file(onnx))
            validate_artifact_bindings(contract, checkpoint, onnx)
            checkpoint.write_bytes(b'checkpoint-b')
            with self.assertRaises(ValueError):
                validate_artifact_bindings(contract, checkpoint, onnx)


if __name__ == '__main__':
    unittest.main()
