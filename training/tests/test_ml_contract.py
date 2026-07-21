import unittest

from training.ml.contract import (
    CLASS_NAMES,
    SQUARE_NAMES,
    build_model_contract,
    canonical_source_corners,
    crop_bounds,
    validate_model_contract,
)


class ModelContractTests(unittest.TestCase):
    def test_square_traversal_and_crop_bounds_are_stable(self):
        self.assertEqual(SQUARE_NAMES[0], 'a8')
        self.assertEqual(SQUARE_NAMES[-1], 'h1')
        self.assertEqual(len(SQUARE_NAMES), 64)
        self.assertEqual(CLASS_NAMES[0], 'empty')
        self.assertEqual(CLASS_NAMES[-1], 'black_king')
        self.assertTrue(all(0 <= value <= 512 for value in crop_bounds(0)))
        self.assertTrue(all(0 <= value <= 512 for value in crop_bounds(63)))

    def test_renderer_corner_order_maps_to_canonical_white_orientation(self):
        corners = [(10, 90), (90, 90), (90, 10), (10, 10)]  # [a1, h1, h8, a8]
        self.assertEqual(canonical_source_corners(corners), [(10, 10), (90, 10), (90, 90), (10, 90)])

    def test_contract_rejects_reordered_classes(self):
        contract = build_model_contract('model.onnx', 'best.pt')
        contract['classes'][1], contract['classes'][2] = contract['classes'][2], contract['classes'][1]
        with self.assertRaises(ValueError):
            validate_model_contract(contract)

    def test_contract_rejects_preprocessing_and_output_drift(self):
        contract = build_model_contract('model.onnx', 'best.pt')
        contract['input']['color_space'] = 'bgr'
        with self.assertRaises(ValueError):
            validate_model_contract(contract)
        contract = build_model_contract('model.onnx', 'best.pt')
        contract['output']['classes'] = 1
        with self.assertRaises(ValueError):
            validate_model_contract(contract)


if __name__ == '__main__':
    unittest.main()
