#!/usr/bin/env python3
"""Stream a Lichess puzzle export into a compact, reproducible source manifest.

This intentionally never downloads the complete multi-gigabyte export to disk.
It stops as soon as the configured deterministic sample has been selected.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import sys
from typing import Any, BinaryIO, Iterator, Mapping
from urllib.request import Request, urlopen

import zstandard as zstd

from puzzle_selector import iter_csv_rows, select_positions, write_manifest


class HashingReader:
    """Read-through wrapper that records exactly which compressed prefix was read."""

    def __init__(self, raw: BinaryIO) -> None:
        self.raw = raw
        self.digest = hashlib.sha256()
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self.raw.read(size)
        self.digest.update(chunk)
        self.bytes_read += len(chunk)
        return chunk

    def readable(self) -> bool:
        return True

    def close(self) -> None:
        self.raw.close()


def load_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    source = config.get("source", {})
    selection = config.get("selection", {})
    required = ("url", "version", "license", "timeout_seconds")
    missing = [field for field in required if not source.get(field)]
    if missing:
        raise ValueError(f"source config missing: {', '.join(missing)}")
    if selection.get("strategy") != "first-eligible-deterministic-v1":
        raise ValueError("selection.strategy must be first-eligible-deterministic-v1")
    if not isinstance(selection.get("seed"), int) or not isinstance(selection.get("count"), int):
        raise ValueError("selection.seed and selection.count must be integers")
    return config


def _response_headers(response: Any) -> dict[str, str | None]:
    headers = response.headers
    return {
        "etag": headers.get("ETag"),
        "last_modified": headers.get("Last-Modified"),
        "content_length": headers.get("Content-Length"),
    }


def stream_rows_from_url(
    url: str, *, timeout_seconds: int
) -> tuple[Iterator[dict[str, str]], dict[str, Any], HashingReader, Any]:
    request = Request(url, headers={"User-Agent": "chess-vision-training-source/1"})
    response = urlopen(request, timeout=timeout_seconds)
    hashing_reader = HashingReader(response)
    decompressor = zstd.ZstdDecompressor()
    text = io.TextIOWrapper(decompressor.stream_reader(hashing_reader), encoding="utf-8", newline="")
    observation: dict[str, Any] = _response_headers(response)
    return iter_csv_rows(text), observation, hashing_reader, text


def select_to_manifest(config: Mapping[str, Any], output: Path) -> None:
    source = config["source"]
    selection = config["selection"]
    rows, observation, hashing_reader, text = stream_rows_from_url(
        source["url"], timeout_seconds=source["timeout_seconds"]
    )
    try:
        positions, stats = select_positions(
            rows,
            count=selection["count"],
            seed=selection["seed"],
            strategy=selection["strategy"],
        )
    finally:
        text.close()
        hashing_reader.close()

    observation.update(
        {
            "compressed_prefix_bytes_read": hashing_reader.bytes_read,
            "compressed_prefix_sha256": hashing_reader.digest.hexdigest(),
        }
    )
    # A full archive checksum can only be verified after reading the full file,
    # which this stream-and-stop tool intentionally does not do.  Retain a
    # configured reference checksum and the precise consumed-prefix checksum.
    write_manifest(
        output,
        config=config,
        positions=positions,
        source_observation=observation,
        selection_stats=stats,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True, help="Dataset config JSON")
    parser.add_argument("--output", type=Path, required=True, help="Ignored source manifest path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        config = load_config(args.config)
        select_to_manifest(config, args.output)
    except (OSError, ValueError, zstd.ZstdError) as error:
        print(f"puzzle source selection failed: {error}", file=sys.stderr)
        return 1
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
