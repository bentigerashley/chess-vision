"""Dependency-light classification metrics for the private training reports."""

from __future__ import annotations

from typing import Iterable, Sequence


def _safe_divide(numerator: int, denominator: int) -> float:
    return numerator / denominator if denominator else 0.0


def classification_metrics(targets: Iterable[int], predictions: Iterable[int], class_names: Sequence[str]) -> dict:
    targets = list(targets)
    predictions = list(predictions)
    if len(targets) != len(predictions):
        raise ValueError('Targets and predictions must have the same length')
    count = len(class_names)
    if any(target < 0 or target >= count for target in targets + predictions):
        raise ValueError('Targets and predictions must use valid class IDs')

    per_class = []
    for class_id, name in enumerate(class_names):
        true_positive = sum(target == class_id and prediction == class_id for target, prediction in zip(targets, predictions))
        false_positive = sum(target != class_id and prediction == class_id for target, prediction in zip(targets, predictions))
        false_negative = sum(target == class_id and prediction != class_id for target, prediction in zip(targets, predictions))
        precision = _safe_divide(true_positive, true_positive + false_positive)
        recall = _safe_divide(true_positive, true_positive + false_negative)
        f1 = _safe_divide(2 * precision * recall, precision + recall)
        per_class.append({
            'id': class_id,
            'name': name,
            'support': sum(target == class_id for target in targets),
            'precision': precision,
            'recall': recall,
            'f1': f1,
        })
    accuracy = _safe_divide(sum(target == prediction for target, prediction in zip(targets, predictions)), len(targets))
    return {
        'samples': len(targets),
        'accuracy': accuracy,
        'macro_precision': sum(item['precision'] for item in per_class) / count,
        'macro_recall': sum(item['recall'] for item in per_class) / count,
        'macro_f1': sum(item['f1'] for item in per_class) / count,
        'per_class': per_class,
    }


def board_reconstruction_metrics(artifact_ids: Iterable[str], targets: Iterable[int], predictions: Iterable[int]) -> dict:
    """Measure whether all 64 predictions recreate a board, not only its individual cells."""
    grouped: dict[str, list[bool]] = {}
    for artifact_id, target, prediction in zip(artifact_ids, targets, predictions):
        grouped.setdefault(str(artifact_id), []).append(target == prediction)
    if not grouped:
        return {'boards': 0, 'exact_board_accuracy': 0.0, 'mean_incorrect_squares': 0.0, 'worst_incorrect_squares': 0}
    incorrect_counts = [sum(not correct for correct in squares) for squares in grouped.values()]
    return {
        'boards': len(grouped),
        'exact_board_accuracy': sum(count == 0 for count in incorrect_counts) / len(incorrect_counts),
        'mean_incorrect_squares': sum(incorrect_counts) / len(incorrect_counts),
        'worst_incorrect_squares': max(incorrect_counts),
    }
