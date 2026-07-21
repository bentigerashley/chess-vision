#!/usr/bin/env node
/**
 * Validate the private synthetic-data contract before it is handed to model
 * training.  This deliberately has no dependency on the PWA or Three.js so it
 * can also be used on an archived render run.
 */
import { realpath, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { PNG } from 'pngjs';

const TRAINING_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_TRAINING_OUTPUT_ROOT = path.join(TRAINING_ROOT, 'output');
const FILES = 'abcdefgh';
const FEN_PIECES = new Set(['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k']);
// Kept as plain metadata so archival validation does not depend on Three.js or a DOM.
const V2_SET_PROVENANCE = Object.freeze({
  'wood-staunton': { board_family: 'walnut-maple', silhouette: 'club-staunton' },
  'marble-classical': { board_family: 'carrara-serpentine', silhouette: 'neoclassical-column' },
  'ebony-ivory-tournament': { board_family: 'ebony-ivory-inlay', silhouette: 'slender-tournament' },
  'brass-minimal': { board_family: 'brushed-brass-slate', silhouette: 'architectural-minimal' },
  'ornate-dark-wood': { board_family: 'mahogany-boxwood', silhouette: 'baroque-ornate' },
});

/** The classifier contract: index 0 is intentionally the empty-square class. */
export const CLASS_VOCABULARY = Object.freeze([
  { id: 0, name: 'empty' },
  { id: 1, name: 'white_pawn' }, { id: 2, name: 'white_knight' }, { id: 3, name: 'white_bishop' },
  { id: 4, name: 'white_rook' }, { id: 5, name: 'white_queen' }, { id: 6, name: 'white_king' },
  { id: 7, name: 'black_pawn' }, { id: 8, name: 'black_knight' }, { id: 9, name: 'black_bishop' },
  { id: 10, name: 'black_rook' }, { id: 11, name: 'black_queen' }, { id: 12, name: 'black_king' },
]);

const CLASS_BY_PIECE = Object.freeze({
  P: CLASS_VOCABULARY[1], N: CLASS_VOCABULARY[2], B: CLASS_VOCABULARY[3], R: CLASS_VOCABULARY[4], Q: CLASS_VOCABULARY[5], K: CLASS_VOCABULARY[6],
  p: CLASS_VOCABULARY[7], n: CLASS_VOCABULARY[8], b: CLASS_VOCABULARY[9], r: CLASS_VOCABULARY[10], q: CLASS_VOCABULARY[11], k: CLASS_VOCABULARY[12],
});

export class DatasetValidationError extends Error {
  constructor(errors) {
    super(`Dataset validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'DatasetValidationError';
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, pathName, message) {
  errors.push(`${pathName}: ${message}`);
}

function requireString(value, field, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    addError(errors, field, 'must be a non-empty string');
    return null;
  }
  return value;
}

function requireInteger(value, field, errors, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    addError(errors, field, `must be an integer in ${min}..${max}`);
    return null;
  }
  return value;
}

function requireFiniteNumber(value, field, errors) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addError(errors, field, 'must be a finite number');
    return null;
  }
  return value;
}

function approximatelyEqual(left, right) {
  return Math.abs(left - right) < 0.00001;
}

function expectedSquares() {
  return new Set(Array.from({ length: 8 }, (_, rankIndex) => {
    const rank = 8 - rankIndex;
    return Array.from(FILES, (file) => `${file}${rank}`);
  }).flat());
}

/** Parse only the placement portion, but reject malformed full FENs too. */
export function parseFen(fen) {
  if (typeof fen !== 'string') throw new Error('FEN must be a string');
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) throw new Error('FEN must contain all six fields');
  const ranks = fields[0].split('/');
  if (ranks.length !== 8) throw new Error('FEN piece placement must contain eight ranks');
  const pieces = new Map();
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let fileIndex = 0;
    for (const token of ranks[rankIndex]) {
      if (/^[1-8]$/.test(token)) fileIndex += Number(token);
      else if (FEN_PIECES.has(token)) {
        if (fileIndex >= 8) throw new Error(`FEN rank ${8 - rankIndex} overflows`);
        pieces.set(`${FILES[fileIndex]}${8 - rankIndex}`, token);
        fileIndex += 1;
      } else throw new Error(`invalid FEN piece token ${token}`);
    }
    if (fileIndex !== 8) throw new Error(`FEN rank ${8 - rankIndex} does not contain eight files`);
  }
  if (!/^[wb]$/.test(fields[1])) throw new Error('FEN active-colour field is invalid');
  if (!/^(?:-|K?Q?k?q?)$/.test(fields[2])) throw new Error('FEN castling field is invalid');
  if (!/^(?:-|[a-h][36])$/.test(fields[3])) throw new Error('FEN en-passant field is invalid');
  if (!/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) throw new Error('FEN move counters are invalid');
  return pieces;
}

function replayFirstUci(sourceFen, firstUci) {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(firstUci);
  if (!match) throw new Error('first UCI move is malformed');
  const board = new Chess(sourceFen);
  const movedPiece = board.get(match[1]);
  board.move({ from: match[1], to: match[2], promotion: match[3] });
  const fields = board.fen().split(' ');
  const fromRank = Number(match[1][1]);
  const toRank = Number(match[2][1]);
  if (movedPiece?.type === 'p' && match[1][0] === match[2][0] && Math.abs(fromRank - toRank) === 2) {
    // python-chess emits the FEN-spec en-passant target after every double pawn
    // push; chess.js emits legal-only targets, so restore that source convention.
    fields[3] = `${match[1][0]}${(fromRank + toRank) / 2}`;
  }
  return fields.join(' ');
}

function validateVocabulary(vocabulary, pathName, errors) {
  if (!Array.isArray(vocabulary) || vocabulary.length !== CLASS_VOCABULARY.length) {
    addError(errors, pathName, 'must contain the exact 13-class vocabulary');
    return;
  }
  for (const [index, expected] of CLASS_VOCABULARY.entries()) {
    const actual = vocabulary[index];
    if (!isPlainObject(actual) || actual.id !== expected.id || actual.name !== expected.name) {
      addError(errors, `${pathName}[${index}]`, `must equal { id: ${expected.id}, name: '${expected.name}' }`);
    }
  }
}

function validateVector(value, field, errors, count = 3) {
  if (!Array.isArray(value) || value.length !== count) {
    addError(errors, field, `must be a ${count}-value coordinate`);
    return false;
  }
  let valid = true;
  value.forEach((coordinate, index) => {
    if (requireFiniteNumber(coordinate, `${field}[${index}]`, errors) === null) valid = false;
  });
  return valid;
}

function validateSquareGeometry(square, index, board, errors) {
  const field = `label.board.squares[${index}]`;
  if (!isPlainObject(square)) {
    addError(errors, field, 'must be an object');
    return;
  }
  const match = typeof square.square === 'string' && /^([a-h])([1-8])$/.exec(square.square);
  if (!match) {
    addError(errors, `${field}.square`, 'must be an algebraic board square');
    return;
  }
  const fileIndex = FILES.indexOf(match[1]);
  const rank = Number(match[2]);
  if (square.file !== match[1] || square.rank !== rank) addError(errors, field, 'file and rank must agree with square');
  validateVector(square.center, `${field}.center`, errors);
  if (!Array.isArray(square.corners) || square.corners.length !== 4) addError(errors, `${field}.corners`, 'must contain four physical corners');
  else square.corners.forEach((corner, cornerIndex) => validateVector(corner, `${field}.corners[${cornerIndex}]`, errors));

  const size = board.square_size_world;
  const topY = board.top_y_world;
  if (typeof size === 'number' && typeof topY === 'number' && Array.isArray(square.center) && square.center.length === 3) {
    const expectedX = (fileIndex - 3.5) * size;
    const expectedZ = (rank - 4.5) * size;
    if (!approximatelyEqual(square.center[0], expectedX) || !approximatelyEqual(square.center[1], topY) || !approximatelyEqual(square.center[2], expectedZ)) {
      addError(errors, `${field}.center`, 'must be the physical centre of its labelled square');
    }
  }
}

function validateCamera(label, errors) {
  const camera = label.camera;
  if (!isPlainObject(camera)) {
    addError(errors, 'label.camera', 'is required');
    return;
  }
  if (camera.frame_accepted !== true) addError(errors, 'label.camera.frame_accepted', 'must be true; cropped boards are rejected');
  const width = label.image?.width;
  const height = label.image?.height;
  const margin = requireFiniteNumber(camera.board_margin_px, 'label.camera.board_margin_px', errors);
  if (label.style?.model_version === 'procedural-piece-families/v2') {
    requireString(camera.camera_rig, 'label.camera.camera_rig', errors);
  }
  requireFiniteNumber(camera.fov_degrees, 'label.camera.fov_degrees', errors);
  validateVector(camera.position, 'label.camera.position', errors);
  validateVector(camera.target, 'label.camera.target', errors);
  if (!Array.isArray(camera.projected_board_corners) || camera.projected_board_corners.length !== 4) {
    addError(errors, 'label.camera.projected_board_corners', 'must record four projected physical board corners');
    return;
  }
  camera.projected_board_corners.forEach((corner, index) => {
    const field = `label.camera.projected_board_corners[${index}]`;
    if (!isPlainObject(corner)) {
      addError(errors, field, 'must be an object');
      return;
    }
    const x = requireFiniteNumber(corner.x, `${field}.x`, errors);
    const y = requireFiniteNumber(corner.y, `${field}.y`, errors);
    const z = requireFiniteNumber(corner.z, `${field}.z`, errors);
    if (x !== null && y !== null && z !== null && margin !== null && typeof width === 'number' && typeof height === 'number') {
      if (x < margin || x > width - margin || y < margin || y > height - margin || z < -1 || z > 1) {
        addError(errors, field, 'falls outside the accepted full-board camera frame');
      }
    }
  });
}

function validateBoundingBox(box, field, image, errors) {
  if (!isPlainObject(box)) {
    addError(errors, field, 'is required for a visible piece');
    return;
  }
  const x = requireInteger(box.x, `${field}.x`, errors, { min: 0 });
  const y = requireInteger(box.y, `${field}.y`, errors, { min: 0 });
  const width = requireInteger(box.width, `${field}.width`, errors, { min: 1 });
  const height = requireInteger(box.height, `${field}.height`, errors, { min: 1 });
  if (x !== null && y !== null && width !== null && height !== null && image) {
    if (x + width > image.width || y + height > image.height) addError(errors, field, 'must lie inside the RGB/mask image bounds');
  }
}

/** Validate one rendered label against every truth field that a trainer uses. */
export function validateLabel(label) {
  const errors = [];
  if (!isPlainObject(label)) throw new DatasetValidationError(['label: must be an object']);
  if (Object.keys(label)[0] !== 'fen') addError(errors, 'label', 'fen must be the first JSON field');
  if (label.schema_version !== 'chess-vision.render-label/v1') addError(errors, 'label.schema_version', 'must be chess-vision.render-label/v1');
  let expectedPieces = new Map();
  try { expectedPieces = parseFen(label.fen); } catch (error) { addError(errors, 'label.fen', error.message); }
  validateVocabulary(label.class_vocabulary, 'label.class_vocabulary', errors);

  const image = label.image;
  if (!isPlainObject(image)) addError(errors, 'label.image', 'is required');
  else {
    requireInteger(image.width, 'label.image.width', errors, { min: 1 });
    requireInteger(image.height, 'label.image.height', errors, { min: 1 });
    if (image.color_space !== 'srgb') addError(errors, 'label.image.color_space', 'must be srgb');
  }

  const board = label.board;
  if (!isPlainObject(board)) addError(errors, 'label.board', 'is required');
  else {
    if (board.orientation !== 'white-at-rank-1') addError(errors, 'label.board.orientation', 'must be white-at-rank-1');
    const size = requireFiniteNumber(board.square_size_world, 'label.board.square_size_world', errors);
    requireFiniteNumber(board.top_y_world, 'label.board.top_y_world', errors);
    if (size !== null && size <= 0) addError(errors, 'label.board.square_size_world', 'must be positive');
    if (!Array.isArray(board.squares) || board.squares.length !== 64) addError(errors, 'label.board.squares', 'must contain exactly 64 labels');
    else {
      const seen = new Set();
      for (const [index, square] of board.squares.entries()) {
        validateSquareGeometry(square, index, board, errors);
        const field = `label.board.squares[${index}]`;
        if (!isPlainObject(square) || typeof square.square !== 'string') continue;
        if (seen.has(square.square)) addError(errors, field, 'duplicates a square label');
        seen.add(square.square);
        const expectedPiece = expectedPieces.get(square.square) ?? null;
        if (square.piece !== expectedPiece) addError(errors, `${field}.piece`, `does not agree with FEN (${square.square})`);
        const expectedClass = expectedPiece ? CLASS_BY_PIECE[expectedPiece] : CLASS_VOCABULARY[0];
        if (square.class_id !== expectedClass.id || square.class_name !== expectedClass.name) addError(errors, field, 'class_name/class_id does not agree with its FEN piece');
      }
      for (const square of expectedSquares()) if (!seen.has(square)) addError(errors, 'label.board.squares', `is missing ${square}`);
    }
  }

  if (!isPlainObject(label.artifact)) addError(errors, 'label.artifact', 'is required');
  else {
    requireString(label.artifact.id, 'label.artifact.id', errors);
    requireString(label.artifact.rgb_path, 'label.artifact.rgb_path', errors);
    requireString(label.artifact.instance_mask_path, 'label.artifact.instance_mask_path', errors);
  }
  const source = label.source;
  if (!isPlainObject(source)) addError(errors, 'label.source', 'is required');
  else {
    ['puzzle_id', 'source_fen', 'first_uci', 'source_version', 'config_version'].forEach((field) => requireString(source[field], `label.source.${field}`, errors));
    if (!Array.isArray(source.moves) || source.moves.length === 0 || source.moves.some((move) => typeof move !== 'string' || !move)) addError(errors, 'label.source.moves', 'must contain the source UCI continuation');
  }
  const style = label.style;
  if (!isPlainObject(style)) addError(errors, 'label.style', 'is required');
  else {
    requireString(style.family, 'label.style.family', errors);
    const modelVersion = requireString(style.model_version, 'label.style.model_version', errors);
    requireInteger(style.seed, 'label.style.seed', errors, { min: 0 });
    if (modelVersion === 'procedural-piece-families/v2') {
      const expected = V2_SET_PROVENANCE[style.family];
      if (!expected) addError(errors, 'label.style.family', 'must be a known procedural-piece-families/v2 set');
      const boardFamily = requireString(style.board_family, 'label.style.board_family', errors);
      const silhouette = requireString(style.silhouette, 'label.style.silhouette', errors);
      if (expected && boardFamily !== null && boardFamily !== expected.board_family) addError(errors, 'label.style.board_family', `must match ${style.family} (${expected.board_family})`);
      if (expected && silhouette !== null && silhouette !== expected.silhouette) addError(errors, 'label.style.silhouette', `must match ${style.family} (${expected.silhouette})`);
    }
  }
  if (!isPlainObject(label.lighting)) addError(errors, 'label.lighting', 'is required');
  else if (style?.model_version === 'procedural-piece-families/v2') requireString(label.lighting.id, 'label.lighting.id', errors);
  if (!isPlainObject(label.renderer) || label.renderer.webgl2 !== true) addError(errors, 'label.renderer.webgl2', 'must record an accepted WebGL2 renderer');
  validateCamera(label, errors);

  const pieces = label.pieces;
  if (!Array.isArray(pieces)) addError(errors, 'label.pieces', 'is required');
  else {
    const seenIds = new Set();
    const bySquare = new Map();
    for (const [index, piece] of pieces.entries()) {
      const field = `label.pieces[${index}]`;
      if (!isPlainObject(piece)) { addError(errors, field, 'must be an object'); continue; }
      const instanceId = requireInteger(piece.instance_id, `${field}.instance_id`, errors, { min: 1 });
      if (instanceId !== null && seenIds.has(instanceId)) addError(errors, `${field}.instance_id`, 'must be unique');
      if (instanceId !== null) seenIds.add(instanceId);
      if (typeof piece.square !== 'string' || !expectedPieces.has(piece.square)) addError(errors, `${field}.square`, 'must be an occupied FEN square');
      else if (bySquare.has(piece.square)) addError(errors, `${field}.square`, 'must have one annotation per piece');
      else bySquare.set(piece.square, piece);
      const expectedPiece = expectedPieces.get(piece.square);
      if (piece.fen_piece !== expectedPiece) addError(errors, `${field}.fen_piece`, 'does not agree with FEN');
      const expectedClass = CLASS_BY_PIECE[expectedPiece];
      if (!expectedClass || piece.class_id !== expectedClass.id || piece.class_name !== expectedClass.name) addError(errors, field, 'class_name/class_id does not agree with FEN piece');
      const pixels = requireInteger(piece.visible_pixels, `${field}.visible_pixels`, errors, { min: 1 });
      if (pixels !== null && image && pixels > image.width * image.height) addError(errors, `${field}.visible_pixels`, 'cannot exceed image area');
      validateBoundingBox(piece.bounding_box, `${field}.bounding_box`, image, errors);
    }
    if (pieces.length !== expectedPieces.size) addError(errors, 'label.pieces', 'must have one annotation for each FEN piece and no extras');
    for (const square of expectedPieces.keys()) if (!bySquare.has(square)) addError(errors, 'label.pieces', `is missing FEN piece at ${square}`);
  }
  if (errors.length) throw new DatasetValidationError(errors);
  return { piece_count: expectedPieces.size, artifact_id: label.artifact.id, puzzle_id: label.source.puzzle_id };
}

/** Validate source truth before its records are expanded into style variants. */
export function validateSourceManifest(sourceManifest, { requireFullRun = undefined } = {}) {
  const errors = [];
  if (!isPlainObject(sourceManifest)) throw new DatasetValidationError(['source manifest: must be an object']);
  if (sourceManifest.schema_version !== 'chess-vision.puzzle-source/v1') addError(errors, 'source.schema_version', 'must be chess-vision.puzzle-source/v1');
  if (!isPlainObject(sourceManifest.source)) addError(errors, 'source.source', 'is required');
  else ['url', 'version', 'license'].forEach((field) => requireString(sourceManifest.source[field], `source.source.${field}`, errors));
  const selection = sourceManifest.selection;
  if (!isPlainObject(selection)) addError(errors, 'source.selection', 'is required');
  else {
    requireInteger(selection.requested_count, 'source.selection.requested_count', errors, { min: 1 });
    requireInteger(selection.accepted_count, 'source.selection.accepted_count', errors, { min: 1 });
  }
  const positions = sourceManifest.positions;
  if (!Array.isArray(positions)) addError(errors, 'source.positions', 'is required');
  else {
    if (selection?.accepted_count !== positions.length) addError(errors, 'source.selection.accepted_count', 'must equal positions.length');
    const ids = new Set();
    const fens = new Set();
    for (const [index, position] of positions.entries()) {
      const field = `source.positions[${index}]`;
      if (!isPlainObject(position)) { addError(errors, field, 'must be an object'); continue; }
      ['puzzle_id', 'source_fen', 'first_uci', 'rendered_fen'].forEach((name) => requireString(position[name], `${field}.${name}`, errors));
      if (!Array.isArray(position.moves) || position.moves.length === 0) addError(errors, `${field}.moves`, 'must be a non-empty UCI continuation');
      if (!Array.isArray(position.themes)) addError(errors, `${field}.themes`, 'must be an array');
      try { parseFen(position.source_fen); } catch (error) { addError(errors, `${field}.source_fen`, error.message); }
      try { parseFen(position.rendered_fen); } catch (error) { addError(errors, `${field}.rendered_fen`, error.message); }
      if (position.moves?.[0] !== position.first_uci) addError(errors, `${field}.first_uci`, 'must equal the first source move');
      else {
        try {
          if (replayFirstUci(position.source_fen, position.first_uci) !== position.rendered_fen) addError(errors, `${field}.rendered_fen`, 'must equal source_fen after the first legal UCI move');
        } catch (error) { addError(errors, `${field}.first_uci`, error.message); }
      }
      if (ids.has(position.puzzle_id)) addError(errors, `${field}.puzzle_id`, 'must be unique');
      if (fens.has(position.rendered_fen)) addError(errors, `${field}.rendered_fen`, 'must be unique');
      ids.add(position.puzzle_id); fens.add(position.rendered_fen);
    }
    const fullRun = requireFullRun ?? selection?.requested_count === 50;
    if (fullRun && (positions.length !== 50 || ids.size !== 50 || fens.size !== 50)) addError(errors, 'source.positions', 'a configured full run must contain 50 unique source records and 50 unique derived FENs');
  }
  if (errors.length) throw new DatasetValidationError(errors);
  return { positions: sourceManifest.positions, source_version: sourceManifest.source.version, full_run: requireFullRun ?? sourceManifest.selection.requested_count === 50 };
}

function assertSafeRelativePath(relativePath, field, errors) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) {
    addError(errors, field, 'must be a non-empty relative path');
    return null;
  }
  if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes('..')) {
    addError(errors, field, 'must stay below the selected training/output directory');
    return null;
  }
  return relativePath.split('\\').join('/');
}

async function assertPathInsideRoot(outputRoot, trainingOutputRoot, relativePath, field, errors) {
  const normalized = assertSafeRelativePath(relativePath, field, errors);
  if (!normalized) return null;
  const candidate = path.resolve(outputRoot, normalized);
  const relativeToOutput = path.relative(outputRoot, candidate);
  if (relativeToOutput === '' || relativeToOutput.startsWith('..') || path.isAbsolute(relativeToOutput)) {
    addError(errors, field, 'escapes the render output root');
    return null;
  }
  try {
    const candidateReal = await realpath(candidate);
    const relativeToTraining = path.relative(trainingOutputRoot, candidateReal);
    if (relativeToTraining.startsWith('..') || path.isAbsolute(relativeToTraining)) addError(errors, field, 'resolves outside training/output');
    const metadata = await stat(candidateReal);
    if (!metadata.isFile()) addError(errors, field, 'must refer to a file');
    return candidateReal;
  } catch {
    addError(errors, field, 'does not exist inside training/output');
    return null;
  }
}

async function allFiles(root) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(absolute);
    }
  }
  await visit(root);
  return files;
}

function requirePng(contents, field, errors) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (contents.length < signature.length || !contents.subarray(0, signature.length).equals(signature)) addError(errors, field, 'must be a PNG file');
}

function decodePng(contents, field, errors) {
  requirePng(contents, field, errors);
  try {
    return PNG.sync.read(contents);
  } catch {
    addError(errors, field, 'must contain a decodable PNG image');
    return null;
  }
}

function validateMaskTruth(mask, rgb, label, field, errors) {
  const expectedWidth = label.image.width;
  const expectedHeight = label.image.height;
  if (rgb.width !== expectedWidth || rgb.height !== expectedHeight) {
    addError(errors, `${field}.rgb_path`, `PNG dimensions must equal label.image (${expectedWidth}x${expectedHeight})`);
  }
  if (mask.width !== expectedWidth || mask.height !== expectedHeight) {
    addError(errors, `${field}.instance_mask_path`, `PNG dimensions must equal label.image (${expectedWidth}x${expectedHeight})`);
    return;
  }

  const piecesById = new Map(label.pieces.map((piece) => [piece.instance_id, piece]));
  const observed = new Map(label.pieces.map((piece) => [piece.instance_id, {
    visible_pixels: 0,
    min_x: expectedWidth,
    min_y: expectedHeight,
    max_x: -1,
    max_y: -1,
  }]));
  const unknownIds = new Set();
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const offset = (y * mask.width + x) * 4;
      const instanceId = mask.data[offset] | (mask.data[offset + 1] << 8) | (mask.data[offset + 2] << 16);
      if (instanceId === 0) continue;
      const record = observed.get(instanceId);
      if (!record) {
        unknownIds.add(instanceId);
        continue;
      }
      record.visible_pixels += 1;
      record.min_x = Math.min(record.min_x, x);
      record.min_y = Math.min(record.min_y, y);
      record.max_x = Math.max(record.max_x, x);
      record.max_y = Math.max(record.max_y, y);
    }
  }
  for (const instanceId of unknownIds) addError(errors, `${field}.instance_mask_path`, `contains unknown instance id ${instanceId}`);
  for (const [instanceId, piece] of piecesById) {
    const actual = observed.get(instanceId);
    const expectedBox = actual.visible_pixels ? {
      x: actual.min_x,
      y: actual.min_y,
      width: actual.max_x - actual.min_x + 1,
      height: actual.max_y - actual.min_y + 1,
    } : null;
    if (actual.visible_pixels !== piece.visible_pixels) {
      addError(errors, `${field}.instance_mask_path`, `instance ${instanceId} visible_pixels must equal its label`);
    }
    if (!expectedBox || !piece.bounding_box
      || expectedBox.x !== piece.bounding_box.x || expectedBox.y !== piece.bounding_box.y
      || expectedBox.width !== piece.bounding_box.width || expectedBox.height !== piece.bounding_box.height) {
      addError(errors, `${field}.instance_mask_path`, `instance ${instanceId} bounding_box must equal its label`);
    }
  }
}

/**
 * Read and validate a complete render run.  `outputRoot` must itself be below
 * `training/output`; this makes label paths portable while forbidding traversal
 * or symlink escape into a developer machine.
 */
export async function validateDatasetDirectory({ sourceManifestPath, renderManifestPath, outputRoot, trainingOutputRoot = DEFAULT_TRAINING_OUTPUT_ROOT, requireFullRun = undefined }) {
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
  const renderManifest = JSON.parse(await readFile(renderManifestPath, 'utf8'));
  const source = validateSourceManifest(sourceManifest, { requireFullRun });
  const errors = [];
  const absoluteOutput = path.resolve(outputRoot);
  const absoluteTrainingOutput = path.resolve(trainingOutputRoot);
  let outputReal;
  let trainingReal;
  try { [outputReal, trainingReal] = await Promise.all([realpath(absoluteOutput), realpath(absoluteTrainingOutput)]); } catch { throw new DatasetValidationError(['output: outputRoot and trainingOutputRoot must exist']); }
  const relativeToTraining = path.relative(trainingReal, outputReal);
  if (relativeToTraining === '' || relativeToTraining.startsWith('..') || path.isAbsolute(relativeToTraining)) throw new DatasetValidationError(['output: render output must be a child of training/output']);
  if (!isPlainObject(renderManifest) || renderManifest.schema_version !== 'chess-vision.render-manifest/v1') addError(errors, 'render.schema_version', 'must be chess-vision.render-manifest/v1');
  if (!Array.isArray(renderManifest.artifacts)) addError(errors, 'render.artifacts', 'must be an array');
  const artifacts = Array.isArray(renderManifest.artifacts) ? renderManifest.artifacts : [];
  if (renderManifest.artifact_count !== artifacts.length) addError(errors, 'render.artifact_count', 'must equal artifacts.length');
  if (renderManifest.expected_positions !== source.positions.length) addError(errors, 'render.expected_positions', 'must equal source positions.length');
  const variants = requireInteger(renderManifest.variants_per_position, 'render.variants_per_position', errors, { min: 1 });
  if (variants !== null && artifacts.length !== source.positions.length * variants) addError(errors, 'render.artifacts', 'must contain every configured position/style variant exactly once');
  const fullRun = source.full_run;
  if (fullRun && variants !== 5) addError(errors, 'render.variants_per_position', 'must be 5 for the configured full five-set run');

  const knownSources = new Map(source.positions.map((position) => [position.puzzle_id, position]));
  const artifactIds = new Set();
  const artifactPaths = new Set();
  const sourceCounts = new Map();
  const v2StylesBySource = new Map();
  const expectedFiles = new Set([path.resolve(outputReal, 'manifest.json')]);
  for (const [index, artifact] of artifacts.entries()) {
    const field = `render.artifacts[${index}]`;
    if (!isPlainObject(artifact)) { addError(errors, field, 'must be an object'); continue; }
    const id = requireString(artifact.id, `${field}.id`, errors);
    if (id && artifactIds.has(id)) addError(errors, `${field}.id`, 'must be unique');
    if (id) artifactIds.add(id);
    const paths = await Promise.all([
      assertPathInsideRoot(outputReal, trainingReal, artifact.rgb_path, `${field}.rgb_path`, errors),
      assertPathInsideRoot(outputReal, trainingReal, artifact.instance_mask_path, `${field}.instance_mask_path`, errors),
      assertPathInsideRoot(outputReal, trainingReal, artifact.label_path, `${field}.label_path`, errors),
    ]);
    for (const artifactPath of paths) {
      if (!artifactPath) continue;
      if (artifactPaths.has(artifactPath)) addError(errors, field, 'must not reuse another artifact file');
      artifactPaths.add(artifactPath); expectedFiles.add(artifactPath);
    }
    const [rgbPath, maskPath, labelPath] = paths;
    const rgb = rgbPath ? decodePng(await readFile(rgbPath), `${field}.rgb_path`, errors) : null;
    const mask = maskPath ? decodePng(await readFile(maskPath), `${field}.instance_mask_path`, errors) : null;
    if (!labelPath) continue;
    let label;
    try { label = JSON.parse(await readFile(labelPath, 'utf8')); } catch { addError(errors, `${field}.label_path`, 'must contain valid JSON'); continue; }
    try { validateLabel(label); } catch (error) {
      if (error instanceof DatasetValidationError) error.errors.forEach((message) => addError(errors, `${field}.label`, message));
      else addError(errors, `${field}.label`, String(error));
      continue;
    }
    if (label.artifact.id !== artifact.id || label.artifact.rgb_path !== artifact.rgb_path || label.artifact.instance_mask_path !== artifact.instance_mask_path) addError(errors, field, 'must agree exactly with the label artifact paths and id');
    if (label.fen !== artifact.fen || label.style.family !== artifact.style) addError(errors, field, 'FEN and style must agree exactly with the label');
    if (rgb && mask) validateMaskTruth(mask, rgb, label, field, errors);
    const sourcePosition = knownSources.get(label.source.puzzle_id);
    if (!sourcePosition) addError(errors, `${field}.label.source.puzzle_id`, 'is not present in the source manifest');
    else {
      if (label.fen !== sourcePosition.rendered_fen || label.source.source_fen !== sourcePosition.source_fen || label.source.first_uci !== sourcePosition.first_uci) addError(errors, `${field}.label.source`, 'does not match the source position truth');
      if (label.source.source_version !== source.source_version) addError(errors, `${field}.label.source.source_version`, 'does not match the source manifest version');
      sourceCounts.set(label.source.puzzle_id, (sourceCounts.get(label.source.puzzle_id) ?? 0) + 1);
      if (label.style.model_version === 'procedural-piece-families/v2') {
        const styles = v2StylesBySource.get(label.source.puzzle_id) ?? new Set();
        if (styles.has(label.style.family)) addError(errors, field, `duplicates ${label.style.family} for source ${label.source.puzzle_id}`);
        styles.add(label.style.family);
        v2StylesBySource.set(label.source.puzzle_id, styles);
      }
    }
  }
  for (const sourceId of knownSources.keys()) if (sourceCounts.get(sourceId) !== variants) addError(errors, 'render.artifacts', `must contain exactly ${variants} artifacts for source ${sourceId}`);
  if (fullRun) for (const [sourceId, styles] of v2StylesBySource.entries()) {
    if (styles.size !== Object.keys(V2_SET_PROVENANCE).length) addError(errors, 'render.artifacts', `must contain every v2 set family exactly once for source ${sourceId}`);
  }
  if (fullRun && (knownSources.size !== 50 || artifacts.length !== 250)) addError(errors, 'render', 'full configured run must contain 50 sources × 5 styles = 250 artifacts');

  const actualFiles = await allFiles(outputReal);
  for (const actualFile of actualFiles) if (!expectedFiles.has(actualFile)) addError(errors, 'output', `contains an unreferenced extra file: ${path.relative(outputReal, actualFile)}`);
  if (errors.length) throw new DatasetValidationError(errors);
  return { valid: true, source_positions: source.positions.length, artifacts: artifacts.length, output: outputReal };
}

function argument(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const sourceManifestPath = argument(argumentsList, '--source');
  const renderManifestPath = argument(argumentsList, '--render');
  const outputRoot = argument(argumentsList, '--output');
  if (!sourceManifestPath || !renderManifestPath || !outputRoot) {
    throw new Error('Usage: node validate-dataset.mjs --source <puzzle-sources.json> --render <manifest.json> --output <training/output/run> [--full | --partial]');
  }
  if (argumentsList.includes('--full') && argumentsList.includes('--partial')) throw new Error('Use only one of --full or --partial');
  const requireFullRun = argumentsList.includes('--full') ? true : argumentsList.includes('--partial') ? false : undefined;
  const result = await validateDatasetDirectory({ sourceManifestPath, renderManifestPath, outputRoot, requireFullRun });
  process.stdout.write(`validated ${result.artifacts} artifacts from ${result.source_positions} puzzle positions\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
