"""CLI for preparing a validated, source-grouped Chess Vision experiment."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .dataset import prepare_experiment


def main() -> None:
    parser = argparse.ArgumentParser(description='Prepare a validated source-grouped Chess Vision experiment.')
    parser.add_argument('--dataset', type=Path, required=True, help='Validated render directory containing manifest.json')
    parser.add_argument('--output', type=Path, required=True, help='Ignored training/output experiment directory')
    parser.add_argument('--seed', type=int, default=20260721)
    parser.add_argument('--skip-validator', action='store_true', help='For unit tests only; never use this for model training.')
    arguments = parser.parse_args()
    _, splits, split_manifest = prepare_experiment(arguments.dataset, arguments.output, arguments.seed, validate=not arguments.skip_validator)
    print(json.dumps({
        'split_manifest': str(arguments.output / 'split-manifest.json'),
        'artifacts': {name: len(records) for name, records in splits.items()},
        'puzzles': {name: len({record.puzzle_id for record in records}) for name, records in splits.items()},
        'dataset_hash': split_manifest['dataset']['rgb_sha256'],
    }, indent=2))


if __name__ == '__main__':
    main()
