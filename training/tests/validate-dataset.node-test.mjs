import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { CLASS_VOCABULARY, DatasetValidationError, validateDatasetDirectory, validateLabel, validateSourceManifest } from '../validate-dataset.mjs';

const SOURCE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const PIECE_CLASS = { P: CLASS_VOCABULARY[1], N: CLASS_VOCABULARY[2], B: CLASS_VOCABULARY[3], R: CLASS_VOCABULARY[4], Q: CLASS_VOCABULARY[5], K: CLASS_VOCABULARY[6], p: CLASS_VOCABULARY[7], n: CLASS_VOCABULARY[8], b: CLASS_VOCABULARY[9], r: CLASS_VOCABULARY[10], q: CLASS_VOCABULARY[11], k: CLASS_VOCABULARY[12] };
const EMPTY = CLASS_VOCABULARY[0];

function fenPieces(fen) {
  const pieces = new Map();
  const ranks = fen.split(' ')[0].split('/');
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let fileIndex = 0;
    for (const token of ranks[rankIndex]) {
      if (/\d/.test(token)) fileIndex += Number(token);
      else { pieces.set(`${'abcdefgh'[fileIndex]}${8 - rankIndex}`, token); fileIndex += 1; }
    }
  }
  return pieces;
}

function makeSource({ id = 'puzzle-1', fen = FEN, sourceFen = SOURCE_FEN, firstUci = 'e2e4' } = {}) {
  return {
    schema_version: 'chess-vision.puzzle-source/v1',
    source: { url: 'fixture://puzzles', version: 'fixture-v1', license: 'CC0-1.0' },
    selection: { requested_count: 1, accepted_count: 1 },
    positions: [{ puzzle_id: id, source_fen: sourceFen, first_uci: firstUci, moves: [firstUci], rendered_fen: fen, themes: ['fixture'] }],
  };
}

function makeLabel({ id = '0001-wooden-staunton', fen = FEN, sourceId = 'puzzle-1', badSquare = false } = {}) {
  const pieces = fenPieces(fen);
  const squares = [];
  for (let rank = 8; rank >= 1; rank -= 1) for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
    const square = `${'abcdefgh'[fileIndex]}${rank}`;
    const piece = pieces.get(square) ?? null;
    const classInfo = piece ? PIECE_CLASS[piece] : EMPTY;
    squares.push({ square, file: square[0], rank, piece: badSquare && square === 'e4' ? null : piece, class_id: classInfo.id, class_name: classInfo.name, center: [fileIndex - 3.5, 0.22, rank - 4.5], corners: [[fileIndex - 4, 0.22, rank - 5], [fileIndex - 3, 0.22, rank - 5], [fileIndex - 3, 0.22, rank - 4], [fileIndex - 4, 0.22, rank - 4]] });
  }
  let instanceId = 1;
  return {
    fen,
    schema_version: 'chess-vision.render-label/v1',
    class_vocabulary: CLASS_VOCABULARY,
    artifact: { id, rgb_path: `images/${id}.png`, instance_mask_path: `instance-masks/${id}.png` },
    image: { width: 256, height: 256, color_space: 'srgb' },
    board: { square_size_world: 1, top_y_world: 0.22, orientation: 'white-at-rank-1', squares },
    style: { family: 'wooden-staunton', model_version: 'procedural-v1', seed: 11 },
    source: { puzzle_id: sourceId, source_fen: SOURCE_FEN, first_uci: 'e2e4', moves: ['e2e4'], source_version: 'fixture-v1', config_version: 'chess-vision.dataset-config/v1' },
    camera: { frame_accepted: true, board_margin_px: 16, fov_degrees: 40, position: [8, 11, 11], target: [0, 0, 0], projected_board_corners: [{ x: 16, y: 16, z: 0 }, { x: 240, y: 16, z: 0 }, { x: 240, y: 240, z: 0 }, { x: 16, y: 240, z: 0 }] },
    lighting: { key_intensity: 2.4 }, renderer: { webgl2: true },
    pieces: [...pieces.entries()].map(([square, piece], index) => ({
      instance_id: instanceId++, class_id: PIECE_CLASS[piece].id, class_name: PIECE_CLASS[piece].name, fen_piece: piece, square,
      bounding_box: { x: (index % 8) * 30 + 4, y: Math.floor(index / 8) * 30 + 4, width: 10, height: 10 }, visible_pixels: 100,
    })),
  };
}

function pngBuffer(width, height, draw) {
  const png = new PNG({ width, height });
  png.data.fill(0);
  draw?.(png);
  return PNG.sync.write(png);
}

function instanceMaskBuffer(label) {
  return pngBuffer(label.image.width, label.image.height, (png) => {
    for (const piece of label.pieces) {
      const { x, y, width, height } = piece.bounding_box;
      const red = piece.instance_id & 0xff;
      const green = (piece.instance_id >>> 8) & 0xff;
      const blue = (piece.instance_id >>> 16) & 0xff;
      for (let pixelY = y; pixelY < y + height; pixelY += 1) for (let pixelX = x; pixelX < x + width; pixelX += 1) {
        const offset = (pixelY * png.width + pixelX) * 4;
        png.data[offset] = red;
        png.data[offset + 1] = green;
        png.data[offset + 2] = blue;
        png.data[offset + 3] = 255;
      }
    }
  });
}

async function writeValidRun({ label = makeLabel(), source = makeSource(), tamperArtifact, tamperFiles } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chess-vision-validate-'));
  const output = path.join(root, 'training-output', 'run');
  await Promise.all(['images', 'instance-masks', 'labels'].map((directory) => mkdir(path.join(output, directory), { recursive: true })));
  const artifact = { id: label.artifact.id, rgb_path: label.artifact.rgb_path, instance_mask_path: label.artifact.instance_mask_path, label_path: `labels/${label.artifact.id}.json`, fen: label.fen, style: label.style.family };
  if (tamperArtifact) tamperArtifact(artifact);
  const render = { schema_version: 'chess-vision.render-manifest/v1', expected_positions: 1, variants_per_position: 1, artifact_count: 1, artifacts: [artifact] };
  await Promise.all([
    writeFile(path.join(root, 'source.json'), JSON.stringify(source)),
    writeFile(path.join(output, artifact.rgb_path), pngBuffer(label.image.width, label.image.height)),
    writeFile(path.join(output, artifact.instance_mask_path), instanceMaskBuffer(label)),
    writeFile(path.join(output, artifact.label_path), JSON.stringify(label)),
    writeFile(path.join(output, 'manifest.json'), JSON.stringify(render)),
  ]);
  if (tamperFiles) await tamperFiles({ output, label, artifact });
  return { root, output, sourcePath: path.join(root, 'source.json'), renderPath: path.join(output, 'manifest.json') };
}

test('accepts an exact 64-square, full-board label with source/model/config provenance', async () => {
  const run = await writeValidRun();
  try {
    const result = await validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false });
    assert.deepEqual({ valid: result.valid, source_positions: result.source_positions, artifacts: result.artifacts }, { valid: true, source_positions: 1, artifacts: 1 });
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('requires visual-family provenance for the realistic procedural renderer', () => {
  const label = makeLabel();
  label.style.model_version = 'procedural-piece-families/v2';
  label.camera.camera_rig = 'player-oblique';
  label.lighting = { id: 'neutral-studio', key_intensity: 2.4 };

  assert.throws(() => validateLabel(label), (error) => error instanceof DatasetValidationError && error.message.includes('label.style.board_family'));
});

test('binds a v2 label to the declared chess-set family', () => {
  const label = makeLabel();
  label.style = {
    family: 'wood-staunton', model_version: 'procedural-piece-families/v2', seed: 11,
    board_family: 'carrara-serpentine', silhouette: 'club-staunton',
  };
  label.camera.camera_rig = 'player-oblique';
  label.lighting = { id: 'neutral-studio', key_intensity: 2.4 };

  assert.throws(() => validateLabel(label), (error) => error instanceof DatasetValidationError && error.message.includes('must match wood-staunton'));
});

test('rejects a square label that contradicts the FEN', async () => {
  const run = await writeValidRun({ label: makeLabel({ badSquare: true }) });
  try {
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('does not agree with FEN'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('rejects traversal paths before a label can reference files outside training/output', async () => {
  const run = await writeValidRun({ tamperArtifact: (artifact) => { artifact.rgb_path = '../outside.png'; } });
  try {
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('must stay below the selected training/output directory'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('rejects a cropped physical board even when the rest of the label is well-formed', async () => {
  const label = makeLabel();
  label.camera.projected_board_corners[0].x = 3;
  const run = await writeValidRun({ label });
  try {
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('falls outside the accepted full-board camera frame'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('rejects unreferenced output files rather than silently training on an ambiguous run', async () => {
  const run = await writeValidRun();
  try {
    await writeFile(path.join(run.output, 'images', 'unreferenced.png'), pngBuffer(1, 1));
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('unreferenced extra file'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('rejects a valid PNG whose dimensions do not match the label', async () => {
  const run = await writeValidRun({ tamperFiles: ({ output, artifact }) => writeFile(path.join(output, artifact.rgb_path), pngBuffer(1, 1)) });
  try {
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('PNG dimensions must equal label.image'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('rejects an instance mask that does not reproduce its labelled geometry', async () => {
  const run = await writeValidRun({ tamperFiles: ({ output, label, artifact }) => writeFile(path.join(output, artifact.instance_mask_path), pngBuffer(label.image.width, label.image.height)) });
  try {
    await assert.rejects(() => validateDatasetDirectory({ sourceManifestPath: run.sourcePath, renderManifestPath: run.renderPath, outputRoot: run.output, trainingOutputRoot: path.join(run.root, 'training-output'), requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('visible_pixels must equal its label'));
  } finally { await rm(run.root, { recursive: true, force: true }); }
});

test('source truth requires a legal move whose exact FEN result is rendered', () => {
  const unrelated = makeSource({ fen: SOURCE_FEN });
  assert.throws(() => validateSourceManifest(unrelated, { requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('must equal source_fen after the first legal UCI move'));
  const illegal = makeSource({ firstUci: 'e2e5' });
  assert.throws(() => validateSourceManifest(illegal, { requireFullRun: false }), (error) => error instanceof DatasetValidationError && error.message.includes('Invalid move'));
});

test('full-run source validation demands 50 unique source ids and derived FENs', () => {
  const source = makeSource();
  source.selection = { requested_count: 50, accepted_count: 50 };
  source.positions = Array.from({ length: 50 }, (_, index) => ({ ...source.positions[0], puzzle_id: `puzzle-${index}`, rendered_fen: FEN }));
  assert.throws(() => validateSourceManifest(source, { requireFullRun: true }), (error) => error instanceof DatasetValidationError && error.message.includes('rendered_fen: must be unique'));
});
