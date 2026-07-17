"""Validate Lichess puzzle rows and select exact rendered positions.

Lichess puzzle CSV rows describe the position *before* the opponent's first
move in ``Moves``.  The application-facing puzzle position is therefore the
position after the first UCI move.  Keeping that rule here, beside the
manifest writer, prevents a rendered scene and its FEN labels from drifting.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping
from dataclasses import asdict, dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

import chess


MANIFEST_SCHEMA_VERSION = "chess-vision.puzzle-source/v1"
SELECTION_STRATEGY = "first-eligible-deterministic-v1"


@dataclass(frozen=True)
class PuzzlePosition:
    """A Lichess record with the exact position that will be rendered."""

    puzzle_id: str
    source_fen: str
    first_uci: str
    moves: tuple[str, ...]
    rendered_fen: str
    themes: tuple[str, ...]

    def as_manifest_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["moves"] = list(self.moves)
        value["themes"] = list(self.themes)
        return value


def _required(row: Mapping[str, str], field: str) -> str:
    value = (row.get(field) or "").strip()
    if not value:
        raise ValueError(f"missing {field}")
    return value


def position_from_row(row: Mapping[str, str]) -> PuzzlePosition:
    """Return the post-first-move position for one valid Lichess CSV row.

    The first UCI move must be legal in ``FEN``.  We also exclude terminal
    results because a terminal board cannot provide a useful next-position
    classification target for the initial corpus.
    """

    puzzle_id = _required(row, "PuzzleId")
    source_fen = _required(row, "FEN")
    moves = tuple(move for move in _required(row, "Moves").split() if move)
    if not moves:
        raise ValueError("missing first UCI move")

    try:
        board = chess.Board(source_fen)
    except ValueError as error:
        raise ValueError(f"invalid source FEN: {error}") from error
    if not board.is_valid():
        raise ValueError("invalid source FEN: board status is not valid")

    try:
        first_move = chess.Move.from_uci(moves[0])
    except ValueError as error:
        raise ValueError(f"invalid first UCI move: {moves[0]}") from error

    if first_move not in board.legal_moves:
        raise ValueError(f"first UCI move is not legal in source FEN: {moves[0]}")

    board.push(first_move)
    if board.is_game_over(claim_draw=False):
        raise ValueError("post-first-move position is terminal")

    return PuzzlePosition(
        puzzle_id=puzzle_id,
        source_fen=source_fen,
        first_uci=moves[0],
        moves=moves,
        rendered_fen=board.fen(en_passant="fen"),
        themes=tuple(theme for theme in (row.get("Themes") or "").split() if theme),
    )


def deterministic_accepts(puzzle_id: str, seed: int) -> bool:
    """Stable filter used before taking the first eligible records.

    It makes a selection independent of incidental CSV batching while retaining
    the stream-and-stop property required for the large public export.  The
    threshold intentionally admits one half of IDs; a changed seed changes the
    selected set without relying on Python's randomized hash implementation.
    """

    digest = hashlib.sha256(f"{seed}:{puzzle_id}".encode("utf-8")).digest()
    return digest[0] < 128


def select_positions(
    rows: Iterable[Mapping[str, str]],
    *,
    count: int,
    seed: int,
    strategy: str = SELECTION_STRATEGY,
) -> tuple[list[PuzzlePosition], dict[str, int]]:
    """Select distinct valid post-first-move puzzle positions from a stream."""

    if count < 1:
        raise ValueError("count must be at least one")
    if strategy != SELECTION_STRATEGY:
        raise ValueError(f"unsupported selection strategy: {strategy}")

    selected: list[PuzzlePosition] = []
    seen_ids: set[str] = set()
    seen_rendered_fens: set[str] = set()
    examined = rejected = 0

    for row in rows:
        examined += 1
        try:
            candidate = position_from_row(row)
        except ValueError:
            rejected += 1
            continue

        if candidate.puzzle_id in seen_ids or candidate.rendered_fen in seen_rendered_fens:
            rejected += 1
            continue
        if not deterministic_accepts(candidate.puzzle_id, seed):
            rejected += 1
            continue

        selected.append(candidate)
        seen_ids.add(candidate.puzzle_id)
        seen_rendered_fens.add(candidate.rendered_fen)
        if len(selected) == count:
            return selected, {"examined": examined, "rejected": rejected}

    raise ValueError(
        f"only found {len(selected)} eligible unique puzzle positions after {examined} rows; "
        f"need {count}"
    )


def iter_csv_rows(reader: Iterable[str]) -> Iterator[dict[str, str]]:
    """Yield CSV rows without leaking CSV/parser details into selection code."""

    import csv

    yield from csv.DictReader(reader)


def write_manifest(
    output: Path,
    *,
    config: Mapping[str, Any],
    positions: list[PuzzlePosition],
    source_observation: Mapping[str, Any],
    selection_stats: Mapping[str, int],
) -> None:
    """Write a compact, renderer-ready source manifest atomically."""

    source = config["source"]
    selection = config["selection"]
    manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "source": {
            "url": source["url"],
            "version": source["version"],
            "license": source["license"],
            "configured_archive_sha256": source.get("expected_archive_sha256"),
            "observation": dict(source_observation),
        },
        "selection": {
            "strategy": selection["strategy"],
            "seed": selection["seed"],
            "requested_count": selection["count"],
            "accepted_count": len(positions),
            **dict(selection_stats),
        },
        "positions": [position.as_manifest_dict() for position in positions],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.tmp")
    temporary.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(output)
