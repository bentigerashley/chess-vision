"""Validated render discovery, leak-free splits, and canonical square crops."""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections import OrderedDict, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import cv2
import numpy as np
from PIL import Image

from .contract import CLASS_NAMES, CLASS_VOCABULARY, MODEL_INPUT_SIZE, RECTIFIED_BOARD_SIZE, SQUARE_NAMES, canonical_source_corners, crop_bounds


@dataclass(frozen=True)
class ArtifactRecord:
    artifact_id: str
    puzzle_id: str
    image_path: Path | None
    label_path: Path | None
    corners: tuple[tuple[float, float], ...]
    labels: Mapping[str, int]


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise ValueError(f'Required JSON input is missing: {path}') from error
    except json.JSONDecodeError as error:
        raise ValueError(f'Invalid JSON input: {path}') from error


def write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    """Write report-style JSON without exposing partially-written manifests."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f'{path.suffix}.tmp')
    temporary.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file_handle:
        for block in iter(lambda: file_handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def sha256_paths(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.as_posix()):
        digest.update(path.name.encode('utf-8'))
        digest.update(sha256_file(path).encode('ascii'))
    return digest.hexdigest()


def resolve_source_manifest(dataset_dir: Path, render_manifest: Mapping[str, Any]) -> Path:
    source_name = render_manifest.get('source_manifest')
    if not isinstance(source_name, str) or not source_name:
        raise ValueError('Render manifest must declare source_manifest')
    source_manifest = (dataset_dir.parent / source_name).resolve()
    if not source_manifest.is_file():
        raise ValueError(f'Render manifest source_manifest is missing: {source_manifest}')
    return source_manifest


def _corners_from_label(label: Mapping[str, Any]) -> tuple[tuple[float, float], ...]:
    raw_corners = label.get('camera', {}).get('projected_board_corners')
    if not isinstance(raw_corners, list):
        raise ValueError('Label is missing camera.projected_board_corners')
    normalized = []
    for corner in raw_corners:
        if not isinstance(corner, Mapping):
            raise ValueError('Projected board corners must be objects')
        normalized.append((float(corner['x']), float(corner['y'])))
    return tuple(normalized)


def _labels_from_label(label: Mapping[str, Any]) -> dict[str, int]:
    vocabulary = label.get('class_vocabulary')
    expected_vocabulary = list(CLASS_VOCABULARY)
    if vocabulary != expected_vocabulary:
        raise ValueError('Label class vocabulary does not match the square-classifier contract')
    squares = label.get('board', {}).get('squares')
    if not isinstance(squares, list) or len(squares) != 64:
        raise ValueError('Label must contain 64 board squares')
    labels = {str(square['square']): int(square['class_id']) for square in squares}
    if set(labels) != set(SQUARE_NAMES):
        raise ValueError('Label board squares do not match canonical chess coordinates')
    if any(class_id < 0 or class_id >= len(CLASS_NAMES) for class_id in labels.values()):
        raise ValueError('Label contains an out-of-contract class ID')
    return labels


def load_artifacts(dataset_dir: Path) -> tuple[dict[str, Any], Path, list[ArtifactRecord]]:
    """Load v6 image/label records while checking the training boundary."""
    dataset_dir = dataset_dir.resolve()
    manifest_path = dataset_dir / 'manifest.json'
    manifest = read_json(manifest_path)
    source_manifest = resolve_source_manifest(dataset_dir, manifest)
    artifacts = manifest.get('artifacts')
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError('Render manifest must contain at least one artifact')
    records = []
    for artifact in artifacts:
        artifact_id = str(artifact['id'])
        image_path = dataset_dir / str(artifact['rgb_path'])
        label_path = dataset_dir / str(artifact['label_path'])
        if not image_path.is_file():
            raise ValueError(f'Artifact RGB file is missing: {image_path}')
        label = read_json(label_path)
        if label.get('artifact', {}).get('id') != artifact_id:
            raise ValueError(f'Artifact ID mismatch in label: {label_path}')
        source = label.get('source', {})
        puzzle_id = source.get('puzzle_id')
        if not isinstance(puzzle_id, str) or not puzzle_id:
            raise ValueError(f'Label does not identify its source puzzle: {label_path}')
        records.append(ArtifactRecord(
            artifact_id=artifact_id,
            puzzle_id=puzzle_id,
            image_path=image_path,
            label_path=label_path,
            corners=_corners_from_label(label),
            labels=_labels_from_label(label),
        ))
    if len({record.artifact_id for record in records}) != len(records):
        raise ValueError('Render manifest contains duplicate artifact IDs')
    return manifest, source_manifest, records


def square_labels_by_name(labels: Mapping[str, int]) -> list[int]:
    return [int(labels.get(square, 0)) for square in SQUARE_NAMES]


def _group_has_all_classes(records: Sequence[ArtifactRecord]) -> set[int]:
    return {class_id for record in records for class_id in record.labels.values()}


def assign_grouped_splits(records: Sequence[ArtifactRecord], seed: int) -> dict[str, list[ArtifactRecord]]:
    """Choose deterministic 80/10/10 source-puzzle splits with class coverage."""
    by_puzzle: dict[str, list[ArtifactRecord]] = defaultdict(list)
    for record in records:
        by_puzzle[record.puzzle_id].append(record)
    puzzle_ids = sorted(by_puzzle)
    if len(puzzle_ids) < 10:
        raise ValueError('At least ten independent puzzle sources are required for train/validation/test splitting')
    validation_count = max(1, round(len(puzzle_ids) * 0.1))
    test_count = max(1, round(len(puzzle_ids) * 0.1))
    if validation_count + test_count >= len(puzzle_ids):
        raise ValueError('Not enough puzzle sources remain for training')
    required_classes = set(range(len(CLASS_NAMES)))
    for attempt in range(4096):
        ordered = sorted(
            puzzle_ids,
            key=lambda puzzle_id: hashlib.sha256(f'{seed}:{attempt}:{puzzle_id}'.encode('utf-8')).hexdigest(),
        )
        test_ids = set(ordered[:test_count])
        validation_ids = set(ordered[test_count:test_count + validation_count])
        train_ids = set(ordered[test_count + validation_count:])
        splits = {
            'train': [record for record in records if record.puzzle_id in train_ids],
            'validation': [record for record in records if record.puzzle_id in validation_ids],
            'test': [record for record in records if record.puzzle_id in test_ids],
        }
        if all(_group_has_all_classes(split_records) == required_classes for split_records in splits.values()):
            return splits
    raise ValueError('Could not find a source-grouped split with every class represented in every split')


def require_private_output_dir(path: Path) -> None:
    resolved = path.resolve()
    training_root = Path(__file__).resolve().parents[1]
    output_root = (training_root / 'output').resolve()
    if output_root not in resolved.parents and resolved != output_root:
        raise ValueError(f'Experiment output must remain below {output_root}')


def run_full_validator(dataset_dir: Path, source_manifest: Path) -> dict[str, Any]:
    """Run the existing label/RGB/mask validator before a model reads the corpus."""
    training_root = Path(__file__).resolve().parents[1]
    command = [
        'node', str(training_root / 'validate-dataset.mjs'),
        '--source', str(source_manifest),
        '--render', str(dataset_dir / 'manifest.json'),
        '--output', str(dataset_dir),
        '--full',
    ]
    result = subprocess.run(command, cwd=training_root, check=False, capture_output=True, text=True)
    evidence = {'command': command, 'return_code': result.returncode, 'stdout': result.stdout[-4000:], 'stderr': result.stderr[-4000:]}
    if result.returncode != 0:
        raise RuntimeError(f'Validated corpus preflight failed: {result.stderr or result.stdout}')
    return evidence


def prepare_experiment(dataset_dir: Path, output_dir: Path, seed: int, validate: bool = True) -> tuple[list[ArtifactRecord], dict[str, list[ArtifactRecord]], dict[str, Any]]:
    """Validate inputs, derive splits, and persist reproducibility evidence."""
    dataset_dir = dataset_dir.resolve()
    output_dir = output_dir.resolve()
    require_private_output_dir(output_dir)
    # Resolve only the two manifests first; the full validator must approve the
    # RGB/mask/label corpus before this process discovers label sidecars.
    preflight_manifest = read_json(dataset_dir / 'manifest.json')
    source_manifest = resolve_source_manifest(dataset_dir, preflight_manifest)
    validator = run_full_validator(dataset_dir, source_manifest) if validate else {'skipped': True}
    manifest, source_manifest, records = load_artifacts(dataset_dir)
    splits = assign_grouped_splits(records, seed)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = dataset_dir / 'manifest.json'
    split_manifest = {
        'schema_version': 'chess-vision.training-split/v1',
        'seed': seed,
        'dataset': {
            'path': str(dataset_dir),
            'render_manifest_sha256': sha256_file(manifest_path),
            'source_manifest_path': str(source_manifest),
            'source_manifest_sha256': sha256_file(source_manifest),
            'label_sha256': sha256_paths([record.label_path for record in records if record.label_path]),
            'rgb_sha256': sha256_paths([record.image_path for record in records if record.image_path]),
            'renderer_model_version': manifest.get('renderer_model_version'),
        },
        'validator': validator,
        'splits': {
            split_name: {
                'puzzle_ids': sorted({record.puzzle_id for record in split_records}),
                'artifact_ids': sorted(record.artifact_id for record in split_records),
                'class_counts': [sum(class_id == target for record in split_records for target in record.labels.values()) for class_id in range(len(CLASS_NAMES))],
            }
            for split_name, split_records in splits.items()
        },
    }
    split_path = output_dir / 'split-manifest.json'
    write_json_atomic(split_path, split_manifest)
    return records, splits, split_manifest


def rectify_board(image_rgb: np.ndarray, renderer_corners: Sequence[Sequence[float]]) -> np.ndarray:
    """Rectify a renderer RGB frame into the PWA's white-at-bottom board view."""
    if image_rgb.ndim != 3 or image_rgb.shape[2] != 3:
        raise ValueError('Expected an RGB image with three channels')
    source = np.float32(canonical_source_corners(renderer_corners))
    target = np.float32([
        (0, 0),
        (RECTIFIED_BOARD_SIZE - 1, 0),
        (RECTIFIED_BOARD_SIZE - 1, RECTIFIED_BOARD_SIZE - 1),
        (0, RECTIFIED_BOARD_SIZE - 1),
    ])
    transform = cv2.getPerspectiveTransform(source, target)
    return cv2.warpPerspective(image_rgb, transform, (RECTIFIED_BOARD_SIZE, RECTIFIED_BOARD_SIZE), flags=cv2.INTER_CUBIC)


def crop_square(rectified_rgb: np.ndarray, square_index: int) -> Image.Image:
    left, top, right, bottom = crop_bounds(square_index, rectified_rgb.shape[0])
    crop = rectified_rgb[top:bottom, left:right]
    resized = cv2.resize(crop, (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), interpolation=cv2.INTER_AREA)
    return Image.fromarray(resized, mode='RGB')


class RectifiedSquareDataset:
    """Lazily rectifies a small render corpus and emits labeled 96px cell crops."""

    def __init__(self, records: Sequence[ArtifactRecord], transform=None, cache_size: int = 256):
        self.records = list(records)
        self.transform = transform
        self.cache_size = cache_size
        self.samples = [(record_index, square_index, label) for record_index, record in enumerate(self.records) for square_index, label in enumerate(square_labels_by_name(record.labels))]
        self._cache: OrderedDict[str, np.ndarray] = OrderedDict()

    def __len__(self) -> int:
        return len(self.samples)

    def _board_for(self, record: ArtifactRecord) -> np.ndarray:
        if record.image_path is None:
            raise ValueError('Training records require a concrete RGB image path')
        key = record.image_path.as_posix()
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        image_bgr = cv2.imread(str(record.image_path), cv2.IMREAD_COLOR)
        if image_bgr is None:
            raise ValueError(f'Could not decode RGB artifact: {record.image_path}')
        board = rectify_board(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB), record.corners)
        self._cache[key] = board
        if len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)
        return board

    def __getitem__(self, index: int):
        record_index, square_index, label = self.samples[index]
        image = crop_square(self._board_for(self.records[record_index]), square_index)
        return (self.transform(image) if self.transform else image), label, self.records[record_index].artifact_id
