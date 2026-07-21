import unittest

from training.ml.contract import SQUARE_NAMES
import numpy as np

from training.ml.dataset import ArtifactRecord, assign_grouped_splits, rectify_board, square_labels_by_name


def _artifact(puzzle_id: str, variant: str) -> ArtifactRecord:
    labels = {square: index % 13 for index, square in enumerate(SQUARE_NAMES)}
    return ArtifactRecord(
        artifact_id=f'{puzzle_id}-{variant}',
        puzzle_id=puzzle_id,
        image_path=None,
        label_path=None,
        corners=((0, 1), (1, 1), (1, 0), (0, 0)),
        labels=labels,
    )


class DatasetSplitTests(unittest.TestCase):
    def test_variants_never_leak_between_source_splits(self):
        artifacts = [_artifact(f'puzzle-{number:02}', variant) for number in range(20) for variant in ('wood', 'marble')]
        splits = assign_grouped_splits(artifacts, seed=23)
        memberships = {}
        for split_name, records in splits.items():
            for record in records:
                memberships.setdefault(record.puzzle_id, set()).add(split_name)
        self.assertTrue(all(len(split_names) == 1 for split_names in memberships.values()))
        self.assertEqual(set(splits), {'train', 'validation', 'test'})
        self.assertTrue(all(len(records) for records in splits.values()))

    def test_square_labels_are_presented_in_canonical_order(self):
        labels = {'h1': 12, 'a8': 10}
        ordered = square_labels_by_name(labels)
        self.assertEqual(ordered[0], 10)
        self.assertEqual(ordered[-1], 12)
        self.assertEqual(len(ordered), 64)

    def test_renderer_corner_reorder_places_a8_at_top_left(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        image[10, 10] = (1, 2, 3)     # a8
        image[10, 90] = (4, 5, 6)     # h8
        image[90, 90] = (7, 8, 9)     # h1
        image[90, 10] = (10, 11, 12)  # a1
        board = rectify_board(image, [(10, 90), (90, 90), (90, 10), (10, 10)])
        self.assertTrue(np.array_equal(board[0, 0], (1, 2, 3)))
        self.assertTrue(np.array_equal(board[-1, -1], (7, 8, 9)))


if __name__ == '__main__':
    unittest.main()
