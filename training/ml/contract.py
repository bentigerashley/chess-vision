"""Stable data and artifact contracts shared by the private training workflow."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Mapping, Sequence


MODEL_CONTRACT_SCHEMA_VERSION = 'chess-vision.square-classifier/v1'
MODEL_ARCHITECTURE = 'mobilenet_v3_small'
CLASS_NAMES = (
    'empty',
    'white_pawn',
    'white_knight',
    'white_bishop',
    'white_rook',
    'white_queen',
    'white_king',
    'black_pawn',
    'black_knight',
    'black_bishop',
    'black_rook',
    'black_queen',
    'black_king',
)
CLASS_VOCABULARY = tuple({'id': index, 'name': name} for index, name in enumerate(CLASS_NAMES))

RECTIFIED_BOARD_SIZE = 512
MODEL_INPUT_SIZE = 96
OUTER_FRAME_HALF_SIZE = 4.58
PLAYABLE_HALF_SIZE = 4.0
PLAYABLE_MARGIN_RATIO = (OUTER_FRAME_HALF_SIZE - PLAYABLE_HALF_SIZE) / (2 * OUTER_FRAME_HALF_SIZE)
CROP_CONTEXT_RATIO = 0.05
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)
RECTIFICATION_INTERPOLATION = 'opencv.INTER_CUBIC'
RESIZE_INTERPOLATION = 'opencv.INTER_AREA'

SQUARE_NAMES = tuple(f'{file_name}{rank}' for rank in range(8, 0, -1) for file_name in 'abcdefgh')


def canonical_source_corners(projected_corners: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
    """Convert renderer `[a1, h1, h8, a8]` corners to canonical `[a8, h8, h1, a1]`."""
    if len(projected_corners) != 4:
        raise ValueError('Renderer projected_board_corners must have exactly four entries')
    try:
        normalized = [(float(point[0]), float(point[1])) for point in projected_corners]
    except (IndexError, TypeError, ValueError) as error:
        raise ValueError('Each projected board corner must contain numeric x and y values') from error
    return [normalized[index] for index in (3, 2, 1, 0)]


def crop_bounds(square_index: int, board_size: int = RECTIFIED_BOARD_SIZE) -> tuple[int, int, int, int]:
    """Return an in-bounds context crop for `a8` through `h1` in rectified pixels."""
    if not 0 <= square_index < 64:
        raise ValueError(f'Square index must be in [0, 63], got {square_index}')
    if board_size <= 0:
        raise ValueError('Board size must be positive')
    margin = board_size * PLAYABLE_MARGIN_RATIO
    square_size = (board_size - 2 * margin) / 8
    row, column = divmod(square_index, 8)
    context = square_size * CROP_CONTEXT_RATIO
    left = max(0, math.floor(margin + column * square_size - context))
    top = max(0, math.floor(margin + row * square_size - context))
    right = min(board_size, math.ceil(margin + (column + 1) * square_size + context))
    bottom = min(board_size, math.ceil(margin + (row + 1) * square_size + context))
    if right <= left or bottom <= top:
        raise ValueError('Square crop has no area')
    return left, top, right, bottom


def build_model_contract(
    model_file: str,
    checkpoint_file: str,
    checkpoint_sha256: str | None = None,
    onnx_sha256: str | None = None,
) -> dict[str, Any]:
    """Build the portable-but-private contract stored beside an ONNX experiment."""
    return {
        'schema_version': MODEL_CONTRACT_SCHEMA_VERSION,
        'architecture': MODEL_ARCHITECTURE,
        'classes': list(CLASS_VOCABULARY),
        'input': {
            'name': 'rgb',
            'layout': 'NCHW',
            'color_space': 'srgb',
            'width': MODEL_INPUT_SIZE,
            'height': MODEL_INPUT_SIZE,
            'normalization': {'mean': list(IMAGENET_MEAN), 'std': list(IMAGENET_STD)},
            'resize_interpolation': RESIZE_INTERPOLATION,
        },
        'output': {'name': 'logits', 'classes': len(CLASS_NAMES)},
        'board': {
            'rectified_size': RECTIFIED_BOARD_SIZE,
            'orientation': 'white-at-bottom',
            'traversal': {'first': SQUARE_NAMES[0], 'last': SQUARE_NAMES[-1], 'squares': list(SQUARE_NAMES)},
            'renderer_corner_order': ['a1', 'h1', 'h8', 'a8'],
            'canonical_corner_order': ['a8', 'h8', 'h1', 'a1'],
            'renderer_source_reorder': [3, 2, 1, 0],
            'playable_margin_ratio': PLAYABLE_MARGIN_RATIO,
            'crop_context_ratio': CROP_CONTEXT_RATIO,
            'rectification_interpolation': RECTIFICATION_INTERPOLATION,
        },
        'artifacts': {
            'onnx': Path(model_file).name,
            'checkpoint': Path(checkpoint_file).name,
            'checkpoint_sha256': checkpoint_sha256,
            'onnx_sha256': onnx_sha256,
        },
        'promotion': {
            'synthetic_only': True,
            'pwa_eligible': False,
            'reason': 'Requires a held-out real-photo evaluation and a separate browser runtime/adapter decision.',
        },
    }


def validate_model_contract(contract: Mapping[str, Any]) -> None:
    """Reject contract drift before a private artifact is published to disk."""
    if contract.get('schema_version') != MODEL_CONTRACT_SCHEMA_VERSION:
        raise ValueError('Unexpected model contract schema_version')
    classes = contract.get('classes')
    expected_classes = list(CLASS_VOCABULARY)
    if classes != expected_classes:
        raise ValueError('Model contract classes must match the Chess Vision vocabulary exactly')
    input_contract = contract.get('input', {})
    if (input_contract.get('layout'), input_contract.get('width'), input_contract.get('height')) != ('NCHW', MODEL_INPUT_SIZE, MODEL_INPUT_SIZE):
        raise ValueError('Model contract input must be a 96x96 NCHW tensor')
    if input_contract.get('color_space') != 'srgb' or input_contract.get('normalization') != {'mean': list(IMAGENET_MEAN), 'std': list(IMAGENET_STD)}:
        raise ValueError('Model contract must pin the expected RGB normalization')
    if input_contract.get('resize_interpolation') != RESIZE_INTERPOLATION:
        raise ValueError('Model contract must pin crop resize interpolation')
    output = contract.get('output', {})
    if output != {'name': 'logits', 'classes': len(CLASS_NAMES)}:
        raise ValueError('Model contract output must be thirteen logits')
    board = contract.get('board', {})
    traversal = board.get('traversal', {})
    if traversal.get('squares') != list(SQUARE_NAMES):
        raise ValueError('Model contract traversal must be a8 through h1')
    if board.get('renderer_source_reorder') != [3, 2, 1, 0]:
        raise ValueError('Model contract must retain the renderer-to-canonical corner reorder')
    if board.get('orientation') != 'white-at-bottom' or board.get('rectification_interpolation') != RECTIFICATION_INTERPOLATION:
        raise ValueError('Model contract must pin white-at-bottom rectification semantics')
    promotion = contract.get('promotion', {})
    if promotion.get('synthetic_only') is not True or promotion.get('pwa_eligible') is not False:
        raise ValueError('Synthetic training artifacts cannot be PWA eligible')
