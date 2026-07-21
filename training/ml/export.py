"""ONNX export for the private synthetic-only model artifact."""

from __future__ import annotations

from pathlib import Path

from .contract import MODEL_ARCHITECTURE, MODEL_INPUT_SIZE, build_model_contract, validate_model_contract
from .dataset import require_private_output_dir, sha256_file, write_json_atomic


def export_experiment(checkpoint_path: Path, output_dir: Path, torch_module=None) -> Path:
    if torch_module is None:
        import torch as torch_module
    checkpoint_path = checkpoint_path.resolve()
    output_dir = output_dir.resolve()
    require_private_output_dir(output_dir)
    from .train import make_model

    checkpoint = torch_module.load(checkpoint_path, map_location='cpu', weights_only=True)
    if checkpoint.get('architecture') != MODEL_ARCHITECTURE:
        raise ValueError('Only mobilenet_v3_small checkpoints match this export contract')
    model = make_model(torch_module, weights=None).eval()
    model.load_state_dict(checkpoint['model_state'])
    onnx_path = output_dir / 'model.onnx'
    example = torch_module.zeros((1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), dtype=torch_module.float32)
    torch_module.onnx.export(
        model,
        example,
        onnx_path,
        input_names=['rgb'],
        output_names=['logits'],
        dynamic_axes={'rgb': {0: 'batch'}, 'logits': {0: 'batch'}},
        opset_version=17,
        dynamo=False,
    )
    contract = build_model_contract(
        onnx_path.name,
        checkpoint_path.name,
        checkpoint_sha256=sha256_file(checkpoint_path),
        onnx_sha256=sha256_file(onnx_path),
    )
    validate_model_contract(contract)
    contract_path = output_dir / 'model-contract.json'
    write_json_atomic(contract_path, contract)
    return onnx_path
