"""Compare private ONNX logits with the selected PyTorch checkpoint."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .contract import MODEL_INPUT_SIZE, validate_model_contract
from .dataset import read_json, sha256_file, write_json_atomic
from .train import make_model


def validate_artifact_bindings(contract: dict, checkpoint_path: Path, onnx_path: Path) -> None:
    artifacts = contract['artifacts']
    if artifacts.get('checkpoint') != checkpoint_path.name or artifacts.get('onnx') != onnx_path.name:
        raise ValueError('Model contract artifact names do not match the files being verified')
    if artifacts.get('checkpoint_sha256') != sha256_file(checkpoint_path):
        raise ValueError('Model contract checkpoint hash does not match the file being verified')
    if artifacts.get('onnx_sha256') != sha256_file(onnx_path):
        raise ValueError('Model contract ONNX hash does not match the file being verified')


def verify_export(checkpoint_path: Path, onnx_path: Path, contract_path: Path, tolerance: float = 1e-4) -> dict:
    import onnxruntime as ort
    import torch

    contract = read_json(contract_path)
    validate_model_contract(contract)
    validate_artifact_bindings(contract, checkpoint_path, onnx_path)
    checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    model = make_model(torch, weights=None).eval()
    model.load_state_dict(checkpoint['model_state'])
    sample = np.random.default_rng(20260721).standard_normal((2, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), dtype=np.float32)
    with torch.no_grad():
        expected = model(torch.from_numpy(sample)).numpy()
    session = ort.InferenceSession(str(onnx_path), providers=['CPUExecutionProvider'])
    actual = session.run(['logits'], {'rgb': sample})[0]
    max_absolute_delta = float(np.max(np.abs(expected - actual)))
    report = {
        'schema_version': 'chess-vision.onnx-parity/v1',
        'passed': max_absolute_delta <= tolerance,
        'max_absolute_delta': max_absolute_delta,
        'tolerance': tolerance,
        'input_shape': list(sample.shape),
        'providers': session.get_providers(),
        'checkpoint_sha256': sha256_file(checkpoint_path),
        'onnx_sha256': sha256_file(onnx_path),
    }
    if not report['passed']:
        raise RuntimeError(f'ONNX parity check failed: {max_absolute_delta} > {tolerance}')
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description='Verify ONNX/PyTorch parity for a private Chess Vision experiment.')
    parser.add_argument('--experiment', type=Path, required=True)
    parser.add_argument('--tolerance', type=float, default=1e-4)
    arguments = parser.parse_args()
    report = verify_export(arguments.experiment / 'best.pt', arguments.experiment / 'model.onnx', arguments.experiment / 'model-contract.json', arguments.tolerance)
    report_path = arguments.experiment / 'onnx-verification.json'
    write_json_atomic(report_path, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
