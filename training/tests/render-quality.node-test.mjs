import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { assessDarkPieceReadability, validateDarkPieceReadability } from '../renderer/render-quality.mjs';

function fixture({ pieceRgb, exteriorRgb }) {
  const rgb = new PNG({ width: 8, height: 8 });
  const mask = new PNG({ width: 8, height: 8 });
  for (let index = 0; index < 64; index += 1) {
    const offset = index * 4;
    rgb.data.set([...exteriorRgb, 255], offset);
    mask.data[offset + 3] = 255;
  }
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) {
    const offset = (y * 8 + x) * 4;
    rgb.data.set([...pieceRgb, 255], offset);
    mask.data.set([1, 0, 0, 255], offset);
  }
  return { rgb, mask, label: { pieces: [{ instance_id: 1, square: 'e4', fen_piece: 'p' }] } };
}

test('quality gate accepts a dark piece with real highlight and exterior contrast', () => {
  const input = fixture({ pieceRgb: [85, 76, 68], exteriorRgb: [198, 185, 164] });
  const metrics = assessDarkPieceReadability({ ...input, thresholds: { minimum_visible_pixels: 1 } });
  assert.equal(metrics.length, 1);
  assert(metrics[0].p95_linear_luminance > 0.045);
  assert(metrics[0].max_exterior_luminance_difference > 0.06);
});

test('quality gate rejects a near-black piece without usable highlight or contrast', () => {
  const input = fixture({ pieceRgb: [20, 20, 20], exteriorRgb: [24, 24, 24] });
  assert.throws(() => validateDarkPieceReadability({
    ...input,
    thresholds: { minimum_visible_pixels: 1, minimum_p95_linear_luminance: 0.055, minimum_exterior_luminance_difference: 0.06 },
  }), /Dark-piece readability validation failed/);
});
