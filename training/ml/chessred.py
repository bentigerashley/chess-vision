"""Truth and provenance adapter for the private ChessReD2K evaluation gate.

ChessReD2K is licensed CC BY-NC-SA 4.0.  This module deliberately supports
private evaluation only: it never writes images into the repository, trains a
model, or exposes a path that app code can import.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping

from .contract import CLASS_NAMES, SQUARE_NAMES
from .dataset import require_private_output_dir, write_json_atomic


RECORDS_SCHEMA = 'chess-vision.real-photo-records/v1'
CHESSRED_ANNOTATIONS_MD5 = 'd34bca5ad46ec7a8df96a1d3c36784f3'

_CHESSRED_TO_CLASS_NAME = {
    'white-pawn': 'white_pawn',
    'white-rook': 'white_rook',
    'white-knight': 'white_knight',
    'white-bishop': 'white_bishop',
    'white-queen': 'white_queen',
    'white-king': 'white_king',
    'black-pawn': 'black_pawn',
    'black-rook': 'black_rook',
    'black-knight': 'black_knight',
    'black-bishop': 'black_bishop',
    'black-queen': 'black_queen',
    'black-king': 'black_king',
}


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with path.open('rb') as file_handle:
        for block in iter(lambda: file_handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError as error:
        raise ValueError(f'Required ChessReD file is missing: {path}') from error
    except json.JSONDecodeError as error:
        raise ValueError(f'Invalid JSON: {path}') from error


def _canonical_corners(corners: Mapping[str, Any]) -> list[list[float]]:
    """Return physical-frame corners in the app's `[a8, h8, h1, a1]` order."""
    required = ('top_left', 'top_right', 'bottom_right', 'bottom_left')
    try:
        ordered = [[float(corners[name][0]), float(corners[name][1])] for name in required]
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise ValueError('ChessReD corner annotation must include four numeric named corners') from error
    return ordered


def chessred_records(
    annotations_path: Path,
    images_root: Path,
    source: Mapping[str, Any],
    accept_noncommercial: bool,
) -> dict[str, Any]:
    """Create the official ChessReD2K held-out test manifest without copying images."""
    if not accept_noncommercial:
        raise ValueError('ChessReD2K is CC BY-NC-SA 4.0; pass --accept-noncommercial for private evaluation only.')
    if source.get('schema_version') != 'chess-vision.real-photo-source/v1':
        raise ValueError('ChessReD source metadata has an unexpected schema version')
    if source.get('allowed_use') != 'private_evaluation_only':
        raise ValueError('ChessReD source metadata must be restricted to private evaluation only')
    if not all(isinstance(source.get(name), str) and source[name] for name in ('dataset_url', 'annotations_url', 'archive_url')):
        raise ValueError('ChessReD source metadata must include the official dataset, annotation, and archive URLs')
    if source.get('license') != 'CC BY-NC-SA 4.0':
        raise ValueError('ChessReD source metadata must declare CC BY-NC-SA 4.0')
    if source.get('annotations_md5', '').lower() != CHESSRED_ANNOTATIONS_MD5:
        raise ValueError('ChessReD source metadata must pin the official annotations MD5')
    if md5_file(annotations_path) != CHESSRED_ANNOTATIONS_MD5:
        raise ValueError('ChessReD annotations MD5 does not match the pinned official file')

    annotations = _read_json(annotations_path)
    categories = {int(item['id']): str(item['name']) for item in annotations.get('categories', [])}
    if set(categories.values()) != set(_CHESSRED_TO_CLASS_NAME):
        raise ValueError('ChessReD category vocabulary is not the expected twelve physical piece classes')
    image_by_id = {int(item['id']): item for item in annotations.get('images', [])}
    pieces_by_image: dict[int, list[Mapping[str, Any]]] = {}
    for piece in annotations.get('annotations', {}).get('pieces', []):
        pieces_by_image.setdefault(int(piece['image_id']), []).append(piece)
    corner_by_image = {
        int(corner['image_id']): corner['corners']
        for corner in annotations.get('annotations', {}).get('corners', [])
    }
    try:
        test_ids = [int(image_id) for image_id in annotations['splits']['chessred2k']['test']['image_ids']]
    except (KeyError, TypeError) as error:
        raise ValueError('ChessReD annotations do not include the ChessReD2K held-out test split') from error
    if not test_ids or len(set(test_ids)) != len(test_ids):
        raise ValueError('ChessReD2K test image IDs must be present and unique')

    records = []
    for image_id in sorted(test_ids):
        image = image_by_id.get(image_id)
        if image is None:
            raise ValueError(f'ChessReD test image {image_id} is absent from image metadata')
        if image_id not in corner_by_image:
            raise ValueError(f'ChessReD test image {image_id} has no four-corner annotation')
        labels = {square: 0 for square in SQUARE_NAMES}
        for piece in pieces_by_image.get(image_id, []):
            square = str(piece.get('chessboard_position'))
            if square not in labels or labels[square] != 0:
                raise ValueError(f'ChessReD test image {image_id} has an invalid or duplicate square label: {square}')
            category_name = categories.get(int(piece.get('category_id', -1)))
            class_name = _CHESSRED_TO_CLASS_NAME.get(category_name or '')
            if class_name is None:
                raise ValueError(f'ChessReD test image {image_id} has an unknown category')
            labels[square] = CLASS_NAMES.index(class_name)
        image_relative_path = Path(str(image['path']))
        records.append({
            'id': f'chessred2k-{image_id}',
            'source_image_id': image_id,
            'group_id': f"game-{int(image['game_id']):03d}",
            'camera': str(image.get('camera', 'unknown')),
            'image_path': str((images_root / image_relative_path).resolve()),
            'corners': _canonical_corners(corner_by_image[image_id]),
            'labels': labels,
        })

    return {
        'schema_version': RECORDS_SCHEMA,
        'source': dict(source),
        'benchmark': {
            'name': 'ChessReD2K official held-out test split',
            'kind': 'held-out-real-photo',
            'expected_records': len(test_ids),
            'complete': len(records) == len(test_ids),
            'training_permitted': False,
            'shipping_permitted': False,
        },
        'records': records,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Prepare a private ChessReD2K held-out evaluation manifest.')
    parser.add_argument('--annotations', type=Path, required=True)
    parser.add_argument('--images-root', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True, help='Committed source metadata JSON')
    parser.add_argument('--output', type=Path, required=True, help='Ignored output records JSON')
    parser.add_argument('--accept-noncommercial', action='store_true')
    arguments = parser.parse_args()
    require_private_output_dir(arguments.output)
    source = _read_json(arguments.source)
    records = chessred_records(arguments.annotations, arguments.images_root, source, arguments.accept_noncommercial)
    write_json_atomic(arguments.output, records)
    print(json.dumps({
        'output': str(arguments.output),
        'records': len(records['records']),
        'benchmark': records['benchmark']['name'],
        'private_evaluation_only': True,
    }, indent=2))


if __name__ == '__main__':
    main()
