// Kept out of the PWA's Vitest discovery: this is a Node-only renderer contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../node_modules/three/build/three.module.js';
import { allSquareLabels, configureCamera, fenToSquares, physicalSquare, projectPieceBounds, validateBoardInFrame, validateSceneInFrame } from '../scene/board-scene.mjs';
import { assertLabelMatchesFen, boxesFromMask, idToRgb, rgbToId } from '../scene/labels.mjs';
import { createJobs } from '../renderer/run-render.mjs';
import { CHESS_SET_SPECS } from '../scene/piece-factories.mjs';
import { hexToRgb } from '../scene/material-textures.mjs';
import {
  ASSET_PIECE_PROVENANCE,
  FEN_ASSET_NODE_NAMES,
  FIDE_GEOMETRY_PROFILE,
  measureBottomBaseDiameter,
  normalizeFidePieceTemplate,
} from '../scene/gltf-piece-factory.mjs';
import { createRandom } from '../scene/random.mjs';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3';

function relativeLuminance(hex) {
  const channels = hexToRgb(hex).map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('FEN parsing and 64 square labels preserve every exact position', () => {
  const squares = allSquareLabels(FEN);
  assert.equal(squares.length, 64);
  assert.equal(squares.find(({ square }) => square === 'e4').piece, 'P');
  assert.equal(squares.find(({ square }) => square === 'e5').piece, 'p');
  assert.equal(fenToSquares(FEN).length, 32);
  assert.doesNotThrow(() => assertLabelMatchesFen({ fen: FEN, board: { squares }, pieces: fenToSquares(FEN).map(({ square, piece }) => ({ square, fen_piece: piece })) }));
});

test('instance mask pixels become visible-pixel counts and image-space boxes', () => {
  const pixels = new Uint8Array(4 * 4 * 4);
  const [red, green, blue] = idToRgb(260);
  for (const [x, sourceY] of [[1, 0], [2, 0], [1, 1]]) {
    const offset = (sourceY * 4 + x) * 4;
    pixels[offset] = red; pixels[offset + 1] = green; pixels[offset + 2] = blue; pixels[offset + 3] = 255;
  }
  assert.equal(rgbToId(red, green, blue), 260);
  assert.deepEqual(boxesFromMask({ pixels, width: 4, height: 4, instanceIds: [260] }).get(260), { visible_pixels: 3, bounding_box: { x: 1, y: 2, width: 2, height: 2 } });
});

test('camera contract rejects a cropped physical board', () => {
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(10, 16, 16);
  camera.lookAt(0, 0, 0);
  assert.equal(validateBoardInFrame(camera, 1024, 1024, 32), true);
  camera.position.set(3, 3, 3);
  camera.lookAt(0, 0, 0);
  assert.equal(validateBoardInFrame(camera, 1024, 1024, 32), false);
});

test('synthetic images put White rank 1 at the bottom like rectified app captures', () => {
  const { camera } = configureCamera(() => 0.5, 1024, 1024);
  camera.updateMatrixWorld();
  const rankOne = new THREE.Vector3(...physicalSquare(0, 1).center).project(camera);
  const rankEight = new THREE.Vector3(...physicalSquare(0, 8).center).project(camera);
  assert(camera.position.z < 0);
  assert(rankOne.y < rankEight.y, 'rank 1 must project nearer the bottom of the rendered image');
});

test('every set family owns a distinct real-world board and piece specification', () => {
  const specs = Object.values(CHESS_SET_SPECS);
  assert.equal(specs.length, 5);
  assert.equal(new Set(specs.map(({ board }) => board.id)).size, 5);
  assert.equal(new Set(specs.map(({ silhouette }) => silhouette)).size, 5);
  for (const spec of specs) {
    assert.match(spec.board.light_square, /^#/);
    assert.match(spec.board.dark_square, /^#/);
    assert.match(spec.board.frame, /^#/);
  }
});

test('dark set materials stay readable without becoming light or overly glossy', () => {
  for (const spec of Object.values(CHESS_SET_SPECS)) {
    const black = spec.materials.black;
    const white = spec.materials.white;
    const blackLuminance = relativeLuminance(black.color);
    const whiteLuminance = relativeLuminance(white.color);
    // A satin patinated-metal set can be slightly lighter than wood or ebony
    // while still reading as the dark side under ordinary indoor light.
    const maximumDarkLuminance = black.metalness ? 0.18 : 0.12;
    assert(blackLuminance >= 0.03 && blackLuminance <= maximumDarkLuminance, `${spec.id} black material must be dark but not near-black`);
    assert(whiteLuminance - blackLuminance >= 0.2, `${spec.id} sets must retain light/dark separation`);
    if (black.metalness) {
      assert(black.roughness >= 0.32, `${spec.id} dark metal must not be mirror-like`);
      assert(black.clearcoat <= 0.14, `${spec.id} dark metal must not be highly glossy`);
      assert((black.specular_intensity ?? 1) <= 1.8, `${spec.id} dark metal must retain a restrained satin highlight`);
    } else {
      assert(black.roughness >= 0.28, `${spec.id} dark material must have a matte professional finish`);
      assert(black.clearcoat <= 0.3, `${spec.id} dark material must not be highly glossy`);
    }
  }
});

test('the renderer defaults to a twelve-class, provenance-locked mesh source', () => {
  assert.equal(ASSET_PIECE_PROVENANCE.source_kind, 'gltf-asset');
  assert.equal(ASSET_PIECE_PROVENANCE.fallback, false);
  assert.equal(Object.keys(FEN_ASSET_NODE_NAMES).length, 12);
  assert.equal(FEN_ASSET_NODE_NAMES.N, 'Knight_W1');
});

test('FIDE normalization fixes total height and measures the bottom eighteen-percent base footprint', () => {
  const source = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.36, 24));
  base.position.set(4.8, 2.2, -3.6);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 24));
  stem.position.set(4.8, 3.58, -3.6);
  source.add(base, stem);

  const normalized = normalizeFidePieceTemplate(source, 'k');
  const bounds = new THREE.Box3().setFromObject(normalized);
  const measurement = measureBottomBaseDiameter(normalized);
  const targetHeight = FIDE_GEOMETRY_PROFILE.height_by_type.k;

  assert(Math.abs(bounds.min.y) < 1e-8, 'the piece base must sit on the board plane');
  assert(Math.abs(bounds.getSize(new THREE.Vector3()).y - targetHeight) < 1e-8, 'king height must equal its FIDE target');
  assert(measurement.diameter / targetHeight >= FIDE_GEOMETRY_PROFILE.base_diameter_ratio.min);
  assert(measurement.diameter / targetHeight <= FIDE_GEOMETRY_PROFILE.base_diameter_ratio.max);
  assert.equal(measurement.bottom_fraction, 0.18);
  assert(measurement.vertex_count > 0);
  assert(measurement.diameter < FIDE_GEOMETRY_PROFILE.square_size_world);
  assert(Math.abs(bounds.min.x + bounds.max.x) < 1e-8, 'normalized piece must be centred on its square');
  assert(Math.abs(bounds.min.z + bounds.max.z) < 1e-8, 'normalized piece must be centred on its square');
});

test('FIDE normalization corrects only a near-compliant lower base into the professional 40–50% band', () => {
  const source = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.36, 24));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.4, 24));
  stem.position.y = 1.38;
  source.add(base, stem);
  const normalized = normalizeFidePieceTemplate(source, 'k');
  const geometry = normalized.userData.fide_geometry;
  assert(geometry.base_ratio >= FIDE_GEOMETRY_PROFILE.base_diameter_ratio.min);
  assert(geometry.base_ratio <= FIDE_GEOMETRY_PROFILE.base_diameter_ratio.max);
  assert(geometry.base_correction > 1);
});

test('camera sampling spans multiple safe photographic rigs', () => {
  const cameras = Array.from({ length: 12 }, (_, seed) => configureCamera(createRandom(seed + 1), 1024, 1024));
  assert(cameras.every(({ camera, metadata }) => validateBoardInFrame(camera, 1024, 1024, metadata.board_margin_px)));
  assert(new Set(cameras.map(({ metadata }) => metadata.camera_rig)).size >= 3);
  assert(new Set(cameras.map(({ metadata }) => metadata.fov_degrees)).size >= 3);
});

test('camera framing accounts for a full edge piece rather than only board corners', () => {
  const edgePiece = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.4, 0.75));
  mesh.position.set(3.5, 1.2, -3.5);
  edgePiece.add(mesh);
  const { camera } = configureCamera(() => 0.5, 1024, 1024, [edgePiece]);
  assert.equal(validateSceneInFrame(camera, 1024, 1024, 32, [edgePiece]), true);
  const bounds = projectPieceBounds(camera, edgePiece, 1024, 1024);
  assert(bounds.min_x >= 32 && bounds.max_x <= 992);
  assert(bounds.min_y >= 32 && bounds.max_y <= 992);
});

test('renderer jobs use the post-first-move source FEN and all five styles deterministically', () => {
  const manifest = { schema_version: 'chess-vision.puzzle-source/v1', positions: [{ puzzle_id: 'abc', source_fen: FEN, first_uci: 'a7a6', moves: ['a7a6'], themes: [], rendered_fen: FEN }] };
  const jobs = createJobs(manifest, { variants: 5, width: 1024, height: 1024 });
  assert.equal(jobs.length, 5);
  assert.equal(new Set(jobs.map(({ style }) => style)).size, 5);
  assert(jobs.every(({ fen }) => fen === FEN));
});

test('renderer batches retain their absolute deterministic artifact ids', () => {
  const nextFen = FEN.replace(' 2 3', ' 3 4');
  const manifest = { schema_version: 'chess-vision.puzzle-source/v1', positions: [
    { puzzle_id: 'first', source_fen: FEN, first_uci: 'a7a6', moves: ['a7a6'], themes: [], rendered_fen: FEN },
    { puzzle_id: 'second', source_fen: nextFen, first_uci: 'a7a6', moves: ['a7a6'], themes: [], rendered_fen: nextFen },
  ] };
  const jobs = createJobs(manifest, { variants: 5, width: 1024, height: 1024, positionStart: 2, positionCount: 1 });
  assert.equal(jobs.length, 5);
  assert(jobs.every(({ artifactId }) => artifactId.startsWith('0002-')));
});
