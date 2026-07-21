import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from training.ml.chessred import CHESSRED_ANNOTATIONS_MD5, chessred_records


class ChessReDTests(unittest.TestCase):
    @staticmethod
    def _source(digest: str) -> dict[str, str]:
        return {
            'schema_version': 'chess-vision.real-photo-source/v1',
            'dataset_url': 'https://example.test/dataset',
            'annotations_url': 'https://example.test/annotations',
            'archive_url': 'https://example.test/archive',
            'allowed_use': 'private_evaluation_only',
            'license': 'CC BY-NC-SA 4.0',
            'annotations_md5': digest,
        }

    def _write_annotations(self, directory: Path, override=None) -> Path:
        payload = {
            'categories': [
                {'id': 0, 'name': 'white-pawn'}, {'id': 1, 'name': 'white-rook'}, {'id': 2, 'name': 'white-knight'},
                {'id': 3, 'name': 'white-bishop'}, {'id': 4, 'name': 'white-queen'}, {'id': 5, 'name': 'white-king'},
                {'id': 6, 'name': 'black-pawn'}, {'id': 7, 'name': 'black-rook'}, {'id': 8, 'name': 'black-knight'},
                {'id': 9, 'name': 'black-bishop'}, {'id': 10, 'name': 'black-queen'}, {'id': 11, 'name': 'black-king'},
            ],
            'images': [{'id': 5, 'path': 'images/0/G000_IMG005.jpg', 'game_id': 7, 'camera': 'test camera'}],
            'annotations': {
                'pieces': [
                    {'image_id': 5, 'category_id': 7, 'chessboard_position': 'a8'},
                    {'image_id': 5, 'category_id': 5, 'chessboard_position': 'e1'},
                    {'image_id': 5, 'category_id': 11, 'chessboard_position': 'e8'},
                ],
                'corners': [{'image_id': 5, 'corners': {
                    'top_left': [1, 2], 'top_right': [3, 4], 'bottom_right': [5, 6], 'bottom_left': [7, 8],
                }}],
            },
            'splits': {'chessred2k': {'test': {'image_ids': [5]}}},
        }
        if override:
            override(payload)
        path = directory / 'annotations.json'
        path.write_text(json.dumps(payload), encoding='utf-8')
        return path

    def test_requires_explicit_noncommercial_acceptance(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self._write_annotations(Path(temporary))
            with self.assertRaisesRegex(ValueError, 'accept-noncommercial'):
                chessred_records(path, Path(temporary), self._source(CHESSRED_ANNOTATIONS_MD5), False)

    def test_maps_truth_empty_squares_and_corners(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = self._write_annotations(root)
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            # The source checksum is asserted separately by the real source
            # metadata; patch the module constant only for this isolated unit fixture.
            import training.ml.chessred as chessred
            original = chessred.CHESSRED_ANNOTATIONS_MD5
            chessred.CHESSRED_ANNOTATIONS_MD5 = digest
            try:
                result = chessred_records(path, root, self._source(digest), True)
            finally:
                chessred.CHESSRED_ANNOTATIONS_MD5 = original
            record = result['records'][0]
            self.assertEqual(record['corners'], [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0], [7.0, 8.0]])
            self.assertEqual(record['labels']['a8'], 10)
            self.assertEqual(record['labels']['e1'], 6)
            self.assertEqual(record['labels']['e8'], 12)
            self.assertEqual(record['labels']['d4'], 0)
            self.assertTrue(result['benchmark']['complete'])

    def test_rejects_duplicate_piece_square(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = self._write_annotations(root, lambda payload: payload['annotations']['pieces'].append(
                {'image_id': 5, 'category_id': 0, 'chessboard_position': 'a8'}))
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            import training.ml.chessred as chessred
            original = chessred.CHESSRED_ANNOTATIONS_MD5
            chessred.CHESSRED_ANNOTATIONS_MD5 = digest
            try:
                with self.assertRaisesRegex(ValueError, 'duplicate'):
                    chessred_records(path, root, self._source(digest), True)
            finally:
                chessred.CHESSRED_ANNOTATIONS_MD5 = original

    def test_rejects_a_source_that_allows_training_or_shipping(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = self._write_annotations(root)
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            import training.ml.chessred as chessred
            original = chessred.CHESSRED_ANNOTATIONS_MD5
            chessred.CHESSRED_ANNOTATIONS_MD5 = digest
            source = self._source(digest)
            source['allowed_use'] = 'training'
            try:
                with self.assertRaisesRegex(ValueError, 'private evaluation'):
                    chessred_records(path, root, source, True)
            finally:
                chessred.CHESSRED_ANNOTATIONS_MD5 = original


if __name__ == '__main__':
    unittest.main()
