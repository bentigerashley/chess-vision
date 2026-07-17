from __future__ import annotations

import csv
from pathlib import Path
import tempfile
import unittest

import chess

from source.puzzle_selector import (
    MANIFEST_SCHEMA_VERSION,
    deterministic_accepts,
    position_from_row,
    select_positions,
    write_manifest,
)


FIXTURE = Path(__file__).parent / "fixtures" / "puzzles.csv"


class PuzzleSelectorTests(unittest.TestCase):
    def fixture_rows(self) -> list[dict[str, str]]:
        with FIXTURE.open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))

    def test_applies_first_uci_move_to_the_rendered_fen(self) -> None:
        position = position_from_row(self.fixture_rows()[0])
        self.assertEqual(position.first_uci, "e2e4")
        self.assertEqual(
            position.rendered_fen,
            "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        )
        self.assertTrue(chess.Board(position.rendered_fen).is_valid())

    def test_rejects_invalid_fen_and_illegal_first_move(self) -> None:
        rows = self.fixture_rows()
        with self.assertRaisesRegex(ValueError, "first UCI move is not legal"):
            position_from_row(rows[2])
        with self.assertRaisesRegex(ValueError, "invalid source FEN"):
            position_from_row(rows[3])

    def test_selects_requested_unique_derived_positions(self) -> None:
        rows = list(self.generated_rows(90))
        accepted_seed = next(seed for seed in range(1000) if sum(deterministic_accepts(row["PuzzleId"], seed) for row in rows) >= 50)
        selected, stats = select_positions(rows, count=50, seed=accepted_seed)
        self.assertEqual(len(selected), 50)
        self.assertEqual(len({position.puzzle_id for position in selected}), 50)
        self.assertEqual(len({position.rendered_fen for position in selected}), 50)
        self.assertGreaterEqual(stats["examined"], 50)

    def test_manifest_keeps_source_and_derived_truth_together(self) -> None:
        rows = list(self.generated_rows(3))
        seed = next(seed for seed in range(1000) if all(deterministic_accepts(row["PuzzleId"], seed) for row in rows))
        positions, stats = select_positions(rows, count=3, seed=seed)
        config = {
            "source": {"url": "fixture://puzzles", "version": "fixture-v1", "license": "CC0-1.0"},
            "selection": {"strategy": "first-eligible-deterministic-v1", "seed": seed, "count": 3},
        }
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sources.json"
            write_manifest(output, config=config, positions=positions, source_observation={"etag": "fixture"}, selection_stats=stats)
            content = output.read_text(encoding="utf-8")
        self.assertIn(MANIFEST_SCHEMA_VERSION, content)
        self.assertIn('"first_uci"', content)
        self.assertIn('"rendered_fen"', content)

    @staticmethod
    def generated_rows(count: int):
        board = chess.Board()
        for index in range(count):
            source_fen = board.fen(en_passant="fen")
            move = list(board.legal_moves)[index % board.legal_moves.count()]
            yield {
                "PuzzleId": f"generated-{index}",
                "FEN": source_fen,
                "Moves": move.uci(),
                "Themes": "fixture",
            }
            board.push(move)
            if board.is_game_over(claim_draw=False):
                board = chess.Board()


if __name__ == "__main__":
    unittest.main()
