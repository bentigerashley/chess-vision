"""CUDA evaluation of the private square classifier on labelled real photos."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import cv2
import numpy as np

from .contract import CLASS_NAMES, IMAGENET_MEAN, IMAGENET_STD, SQUARE_NAMES, validate_model_contract
from .dataset import crop_square, require_private_output_dir, sha256_file, write_json_atomic
from .metrics import board_reconstruction_metrics, classification_metrics
from .train import make_model, require_cuda


REPORT_SCHEMA = 'chess-vision.real-photo-evaluation/v1'
DEFAULT_THRESHOLDS = {
    'macro_f1': 0.95,
    'piece_macro_f1': 0.95,
    'occupied_recall': 0.97,
    'exact_placement_accuracy': 0.75,
    'p95_incorrect_squares_max': 2,
    'structural_invalid_predictions_max': 0,
}


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise ValueError(f'Required JSON input is missing: {path}') from error
    except json.JSONDecodeError as error:
        raise ValueError(f'Invalid JSON input: {path}') from error


def _quantile(values: Sequence[int | float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return float(ordered[max(0, math.ceil(percentile * len(ordered)) - 1)])


def labels_from_fen(fen: str) -> list[int]:
    """Decode piece-placement FEN into the stable a8..h1 class traversal."""
    placement = fen.strip().split()[0]
    symbol_to_class = {
        'P': 1, 'N': 2, 'B': 3, 'R': 4, 'Q': 5, 'K': 6,
        'p': 7, 'n': 8, 'b': 9, 'r': 10, 'q': 11, 'k': 12,
    }
    labels: list[int] = []
    ranks = placement.split('/')
    if len(ranks) != 8:
        raise ValueError('FEN must contain exactly eight ranks')
    for rank in ranks:
        width = 0
        for token in rank:
            if token.isdigit() and token != '0':
                labels.extend([0] * int(token))
                width += int(token)
            elif token in symbol_to_class:
                labels.append(symbol_to_class[token])
                width += 1
            else:
                raise ValueError(f'Unsupported FEN placement token: {token}')
        if width != 8:
            raise ValueError('Every FEN rank must describe exactly eight squares')
    return labels


def labels_from_record(record: Mapping[str, Any]) -> list[int]:
    labels = record.get('labels')
    if isinstance(labels, Mapping):
        if set(labels) != set(SQUARE_NAMES):
            raise ValueError(f"Record {record.get('id')} labels must cover exactly a8 through h1")
        result = [int(labels[square]) for square in SQUARE_NAMES]
    elif isinstance(record.get('fen'), str):
        result = labels_from_fen(str(record['fen']))
    else:
        raise ValueError(f"Record {record.get('id')} needs labels or a FEN")
    if any(class_id < 0 or class_id >= len(CLASS_NAMES) for class_id in result):
        raise ValueError(f"Record {record.get('id')} includes an invalid class ID")
    return result


def validate_record(record: Mapping[str, Any]) -> None:
    record_id = record.get('id')
    if not isinstance(record_id, str) or not record_id:
        raise ValueError('Every real-photo record needs a stable ID')
    if not isinstance(record.get('group_id'), str) or not record['group_id']:
        raise ValueError(f'Record {record_id} needs a source/game group ID')
    image_path = record.get('image_path')
    if not isinstance(image_path, str) or not Path(image_path).is_file():
        raise ValueError(f'Record {record_id} image is missing: {image_path}')
    corners = record.get('corners')
    if not isinstance(corners, list) or len(corners) != 4:
        raise ValueError(f'Record {record_id} needs four canonical board corners')
    try:
        parsed = [(float(point[0]), float(point[1])) for point in corners]
    except (TypeError, ValueError, IndexError) as error:
        raise ValueError(f'Record {record_id} has invalid board corners') from error
    if len(set(parsed)) != 4:
        raise ValueError(f'Record {record_id} must have four distinct board corners')
    labels_from_record(record)


def load_records(path: Path) -> dict[str, Any]:
    payload = _read_json(path)
    if payload.get('schema_version') != 'chess-vision.real-photo-records/v1':
        raise ValueError('Unexpected real-photo records schema')
    records = payload.get('records')
    if not isinstance(records, list) or not records:
        raise ValueError('Real-photo records manifest must contain at least one record')
    ids = []
    for record in records:
        if not isinstance(record, Mapping):
            raise ValueError('Real-photo records must be objects')
        validate_record(record)
        ids.append(str(record['id']))
    if len(ids) != len(set(ids)):
        raise ValueError('Real-photo records must have unique IDs')
    benchmark = payload.get('benchmark')
    if not isinstance(benchmark, Mapping):
        raise ValueError('Real-photo records need benchmark provenance')
    expected_records = int(benchmark.get('expected_records', 0))
    if expected_records < len(records):
        raise ValueError('Benchmark expected_records cannot be lower than the included records')
    return payload


def rectify_real_board(image_rgb: np.ndarray, canonical_corners: Sequence[Sequence[float]], size: int = 512) -> np.ndarray:
    """Rectify the confirmed outer frame `[a8, h8, h1, a1]` into app orientation."""
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ValueError('Expected a three-channel RGB image')
    source = np.float32(canonical_corners)
    target = np.float32([(0, 0), (size - 1, 0), (size - 1, size - 1), (0, size - 1)])
    transform = cv2.getPerspectiveTransform(source, target)
    return cv2.warpPerspective(image_rgb, transform, (size, size), flags=cv2.INTER_CUBIC)


def _occupancy_metrics(targets: Sequence[int], predictions: Sequence[int]) -> dict[str, float | int]:
    target_occupied = [target != 0 for target in targets]
    prediction_occupied = [prediction != 0 for prediction in predictions]
    true_positive = sum(target and prediction for target, prediction in zip(target_occupied, prediction_occupied))
    false_positive = sum(not target and prediction for target, prediction in zip(target_occupied, prediction_occupied))
    false_negative = sum(target and not prediction for target, prediction in zip(target_occupied, prediction_occupied))
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    return {
        'support': sum(target_occupied),
        'precision': precision,
        'recall': recall,
        'f1': 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
        'false_positive_empty_to_piece': false_positive,
        'false_negative_piece_to_empty': false_negative,
    }


def _structural_validity(labels: Sequence[int]) -> tuple[bool, list[str]]:
    reasons = []
    if labels.count(6) != 1:
        reasons.append('white_king_count')
    if labels.count(12) != 1:
        reasons.append('black_king_count')
    if labels.count(1) > 8 or labels.count(7) > 8:
        reasons.append('pawn_count')
    for index, class_id in enumerate(labels):
        if class_id in (1, 7) and SQUARE_NAMES[index][1] in ('1', '8'):
            reasons.append('pawn_on_terminal_rank')
            break
    if sum(class_id != 0 for class_id in labels) > 32:
        reasons.append('piece_count')
    return (not reasons, reasons)


def evaluate_predictions(
    records: Sequence[Mapping[str, Any]],
    predictions: Mapping[str, Sequence[int]],
    confidences: Mapping[str, Sequence[float]],
) -> dict[str, Any]:
    """Compute a gate that treats board reconstruction as the primary result."""
    targets, predicted, artifact_ids = [], [], []
    per_board = []
    for record in records:
        record_id = str(record['id'])
        target = labels_from_record(record)
        current_prediction = [int(value) for value in predictions[record_id]]
        current_confidence = [float(value) for value in confidences[record_id]]
        if len(current_prediction) != 64 or len(current_confidence) != 64:
            raise ValueError(f'Record {record_id} must emit 64 labels and confidences')
        if any(value < 0 or value >= len(CLASS_NAMES) for value in current_prediction):
            raise ValueError(f'Record {record_id} emitted an invalid prediction class')
        incorrect = sum(left != right for left, right in zip(target, current_prediction))
        valid, reasons = _structural_validity(current_prediction)
        per_board.append({
            'id': record_id,
            'group_id': str(record['group_id']),
            'incorrect_squares': incorrect,
            'exact_placement': incorrect == 0,
            'structurally_valid': valid,
            'structural_failure_reasons': reasons,
            'mean_confidence': sum(current_confidence) / 64,
            'low_confidence_squares': sum(value < 0.80 for value in current_confidence),
        })
        targets.extend(target)
        predicted.extend(current_prediction)
        artifact_ids.extend([record_id] * 64)
    classes = classification_metrics(targets, predicted, CLASS_NAMES)
    board = board_reconstruction_metrics(artifact_ids, targets, predicted)
    incorrect_counts = [item['incorrect_squares'] for item in per_board]
    piece_classes = classes['per_class'][1:]
    confidence_values = [value for values in confidences.values() for value in values]
    groups = defaultdict(list)
    for item in per_board:
        groups[item['group_id']].append(item)
    return {
        'square_classification': classes,
        'piece_macro_f1': sum(item['f1'] for item in piece_classes) / len(piece_classes),
        'occupancy': _occupancy_metrics(targets, predicted),
        'board_reconstruction': {
            **board,
            'exact_placement_accuracy': board['exact_board_accuracy'],
            'p95_incorrect_squares': _quantile(incorrect_counts, 0.95),
        },
        'structural_validity': {
            'invalid_predictions': sum(not item['structurally_valid'] for item in per_board),
            'total_boards': len(per_board),
        },
        'confidence': {
            'mean': sum(confidence_values) / len(confidence_values),
            'p05': _quantile(confidence_values, 0.05),
            'below_0_80': sum(value < 0.80 for value in confidence_values),
        },
        'groups': {
            group_id: {
                'boards': len(items),
                'exact_placement_accuracy': sum(item['exact_placement'] for item in items) / len(items),
                'mean_incorrect_squares': sum(item['incorrect_squares'] for item in items) / len(items),
            }
            for group_id, items in sorted(groups.items())
        },
        'per_board': per_board,
    }


def readiness_verdict(metrics: Mapping[str, Any], benchmark: Mapping[str, Any], thresholds: Mapping[str, float | int] = DEFAULT_THRESHOLDS) -> dict[str, Any]:
    """Return explicit reasons; incomplete or smoke-only evidence can never pass."""
    reasons = []
    expected_records = int(benchmark.get('expected_records', 0))
    measured_records = int(metrics['board_reconstruction']['boards'])
    if benchmark.get('kind') != 'held-out-real-photo':
        reasons.append('benchmark_is_not_a_held_out_real_photo_set')
    if benchmark.get('complete') is not True or measured_records != expected_records:
        reasons.append('benchmark_is_incomplete')
    observed = {
        'macro_f1': metrics['square_classification']['macro_f1'],
        'piece_macro_f1': metrics['piece_macro_f1'],
        'occupied_recall': metrics['occupancy']['recall'],
        'exact_placement_accuracy': metrics['board_reconstruction']['exact_placement_accuracy'],
        'p95_incorrect_squares_max': metrics['board_reconstruction']['p95_incorrect_squares'],
        'structural_invalid_predictions_max': metrics['structural_validity']['invalid_predictions'],
    }
    for name, threshold in thresholds.items():
        value = observed[name]
        if name in ('p95_incorrect_squares_max', 'structural_invalid_predictions_max'):
            if value > threshold:
                reasons.append(f'{name}={value} exceeds {threshold}')
        elif value < threshold:
            reasons.append(f'{name}={value:.6f} is below {threshold:.6f}')
    return {
        'status': 'ready-for-native-runtime-decision' if not reasons else 'not-ready',
        'passed': not reasons,
        'thresholds': dict(thresholds),
        'observed': observed,
        'reasons': reasons,
    }


def _inference(records: Sequence[Mapping[str, Any]], checkpoint: Path, batch_size: int) -> tuple[dict[str, list[int]], dict[str, list[float]], dict[str, Any]]:
    import torch
    from torchvision import transforms

    device = require_cuda(torch)
    checkpoint_payload = torch.load(checkpoint, map_location=device, weights_only=True)
    if checkpoint_payload.get('classes') != list(CLASS_NAMES):
        raise ValueError('Checkpoint class vocabulary does not match the real-photo evaluator')
    model = make_model(torch, weights=None).to(device).eval()
    model.load_state_dict(checkpoint_payload['model_state'])
    transform = transforms.Compose([transforms.ToTensor(), transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD)])
    predictions: dict[str, list[int]] = {}
    confidences: dict[str, list[float]] = {}
    with torch.no_grad():
        for record in records:
            image_bgr = cv2.imread(str(record['image_path']), cv2.IMREAD_COLOR)
            if image_bgr is None:
                raise ValueError(f"Could not decode real-photo image: {record['image_path']}")
            board = rectify_real_board(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB), record['corners'])
            tensors = [transform(crop_square(board, square_index)) for square_index in range(64)]
            output_probabilities = []
            for start in range(0, len(tensors), batch_size):
                batch = torch.stack(tensors[start:start + batch_size]).to(device, non_blocking=True)
                output_probabilities.append(torch.softmax(model(batch), dim=1).cpu())
            probabilities = torch.cat(output_probabilities)
            predictions[str(record['id'])] = probabilities.argmax(dim=1).tolist()
            confidences[str(record['id'])] = probabilities.max(dim=1).values.tolist()
    return predictions, confidences, {
        'device': str(device),
        'gpu_name': torch.cuda.get_device_name(device),
        'torch': torch.__version__,
        'cuda': torch.version.cuda,
    }


def run_real_evaluation(records_path: Path, checkpoint: Path, contract_path: Path, output: Path, batch_size: int = 128) -> dict[str, Any]:
    require_private_output_dir(output)
    records_payload = load_records(records_path)
    contract = _read_json(contract_path)
    validate_model_contract(contract)
    records = records_payload['records']
    predictions, confidences, runtime = _inference(records, checkpoint, batch_size)
    metrics = evaluate_predictions(records, predictions, confidences)
    verdict = readiness_verdict(metrics, records_payload['benchmark'])
    report = {
        'schema_version': REPORT_SCHEMA,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source': records_payload['source'],
        'benchmark': records_payload['benchmark'],
        'model': {
            'checkpoint': str(checkpoint),
            'checkpoint_sha256': sha256_file(checkpoint),
            'contract': str(contract_path),
            'contract_sha256': sha256_file(contract_path),
        },
        'runtime': runtime,
        'metrics': metrics,
        'verdict': verdict,
    }
    write_json_atomic(output, report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description='Evaluate a Chess Vision checkpoint on private, labelled real-board photographs.')
    parser.add_argument('--records', type=Path, required=True)
    parser.add_argument('--checkpoint', type=Path, required=True)
    parser.add_argument('--contract', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--batch-size', type=int, default=128)
    arguments = parser.parse_args()
    if arguments.batch_size <= 0:
        raise ValueError('Batch size must be positive')
    report = run_real_evaluation(arguments.records, arguments.checkpoint, arguments.contract, arguments.output, arguments.batch_size)
    print(json.dumps({
        'output': str(arguments.output),
        'status': report['verdict']['status'],
        'reasons': report['verdict']['reasons'],
        'exact_placement_accuracy': report['metrics']['board_reconstruction']['exact_placement_accuracy'],
    }, indent=2))


if __name__ == '__main__':
    main()
