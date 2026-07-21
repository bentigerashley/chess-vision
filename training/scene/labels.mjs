import { allSquareLabels, fenToSquares } from './board-scene.mjs';

const CLASS_BY_FEN = Object.freeze({
  P: 'white_pawn', N: 'white_knight', B: 'white_bishop', R: 'white_rook', Q: 'white_queen', K: 'white_king',
  p: 'black_pawn', n: 'black_knight', b: 'black_bishop', r: 'black_rook', q: 'black_queen', k: 'black_king',
});

export const PIECE_CLASSES = Object.freeze([
  'empty', 'white_pawn', 'white_knight', 'white_bishop', 'white_rook', 'white_queen', 'white_king',
  'black_pawn', 'black_knight', 'black_bishop', 'black_rook', 'black_queen', 'black_king',
]);

export function classForPiece(piece) {
  const className = CLASS_BY_FEN[piece];
  if (!className) throw new Error(`No class for FEN piece: ${piece}`);
  return { class_name: className, class_id: PIECE_CLASSES.indexOf(className) };
}

export function idToRgb(instanceId) {
  if (!Number.isInteger(instanceId) || instanceId < 1 || instanceId > 0xffffff) throw new Error(`Invalid mask instance id: ${instanceId}`);
  return [instanceId & 0xff, (instanceId >>> 8) & 0xff, (instanceId >>> 16) & 0xff];
}

export function rgbToId(red, green, blue) {
  return red | (green << 8) | (blue << 16);
}

export function boxesFromMask({ pixels, width, height, instanceIds }) {
  const boxes = new Map(instanceIds.map((instanceId) => [instanceId, { minX: width, minY: height, maxX: -1, maxY: -1, visiblePixels: 0 }]));
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    const y = height - 1 - sourceY; // WebGL rows start at the lower edge.
    for (let x = 0; x < width; x += 1) {
      const index = (sourceY * width + x) * 4;
      const instanceId = rgbToId(pixels[index], pixels[index + 1], pixels[index + 2]);
      const box = boxes.get(instanceId);
      if (!box) continue;
      box.minX = Math.min(box.minX, x);
      box.minY = Math.min(box.minY, y);
      box.maxX = Math.max(box.maxX, x);
      box.maxY = Math.max(box.maxY, y);
      box.visiblePixels += 1;
    }
  }
  return new Map([...boxes].map(([instanceId, box]) => [instanceId, {
    visible_pixels: box.visiblePixels,
    bounding_box: box.visiblePixels ? { x: box.minX, y: box.minY, width: box.maxX - box.minX + 1, height: box.maxY - box.minY + 1 } : null,
  }]));
}

export function buildLabel({ fen, artifact, source, style, seed, width, height, squares = allSquareLabels(fen), pieces, camera, lighting, renderer }) {
  const pieceLabels = pieces.map((piece) => {
    const classification = classForPiece(piece.piece);
    return {
      instance_id: piece.instanceId,
      ...classification,
      fen_piece: piece.piece,
      square: piece.square,
      bounding_box: piece.mask.bounding_box,
      visible_pixels: piece.mask.visible_pixels,
    };
  });
  // Keep `fen` first: downstream tooling can cheaply reject labels whose first
  // source-of-truth field does not agree with its rendered square labels.
  const label = {
    fen,
    schema_version: 'chess-vision.render-label/v1',
    class_vocabulary: PIECE_CLASSES.map((name, id) => ({ id, name })),
    artifact,
    source,
    image: { width, height, color_space: 'srgb', board_margin_px: camera.board_margin_px },
    board: {
      square_size_world: 1,
      top_y_world: 0.22,
      orientation: 'white-at-rank-1',
      squares: squares.map((square) => ({
        ...square,
        ...(square.piece ? classForPiece(square.piece) : { class_name: 'empty', class_id: 0 }),
      })),
    },
    style: typeof style === 'string' ? { family: style, seed, model_version: 'procedural-piece-families/v1' } : style,
    camera,
    lighting,
    renderer,
    pieces: pieceLabels,
  };
  assertLabelMatchesFen(label);
  return label;
}

export function assertLabelMatchesFen(label) {
  if (!label || typeof label.fen !== 'string') throw new Error('Label must have FEN as its first source-of-truth field');
  const expected = new Map(fenToSquares(label.fen).map(({ square, piece }) => [square, piece]));
  const squareLabels = label.board?.squares;
  if (!Array.isArray(squareLabels) || squareLabels.length !== 64) throw new Error('Label must contain exactly 64 square labels');
  const seen = new Set();
  for (const squareLabel of squareLabels) {
    if (seen.has(squareLabel.square)) throw new Error(`Duplicate square label: ${squareLabel.square}`);
    seen.add(squareLabel.square);
    if ((expected.get(squareLabel.square) ?? null) !== squareLabel.piece) throw new Error(`FEN mismatch at square ${squareLabel.square}`);
  }
  if (seen.size !== 64) throw new Error('Label must enumerate every square exactly once');
  const labelsBySquare = new Map((label.pieces ?? []).map((piece) => [piece.square, piece.fen_piece]));
  if (labelsBySquare.size !== expected.size) throw new Error('Piece labels do not have one entry per FEN piece');
  for (const [square, piece] of expected) if (labelsBySquare.get(square) !== piece) throw new Error(`Piece label mismatch at ${square}`);
  return true;
}
