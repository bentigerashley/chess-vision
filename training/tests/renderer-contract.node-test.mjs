// Kept out of the PWA's Vitest discovery: this is a Node-only renderer contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../node_modules/three/build/three.module.js';
import { allSquareLabels, configureCamera, fenToSquares, physicalSquare, validateBoardInFrame } from '../scene/board-scene.mjs';
import { assertLabelMatchesFen, boxesFromMask, idToRgb, rgbToId } from '../scene/labels.mjs';
import { createJobs } from '../renderer/run-render.mjs';
import { CHESS_SET_SPECS } from '../scene/piece-factories.mjs';
import { createRandom } from '../scene/random.mjs';

const FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 3';

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

test('camera sampling spans multiple safe photographic rigs', () => {
  const cameras = Array.from({ length: 12 }, (_, seed) => configureCamera(createRandom(seed + 1), 1024, 1024));
  assert(cameras.every(({ camera, metadata }) => validateBoardInFrame(camera, 1024, 1024, metadata.board_margin_px)));
  assert(new Set(cameras.map(({ metadata }) => metadata.camera_rig)).size >= 3);
  assert(new Set(cameras.map(({ metadata }) => metadata.fov_degrees)).size >= 3);
});

test('renderer jobs use the post-first-move source FEN and all five styles deterministically', () => {
  const manifest = { schema_version: 'chess-vision.puzzle-source/v1', positions: [{ puzzle_id: 'abc', source_fen: FEN, first_uci: 'a7a6', moves: ['a7a6'], themes: [], rendered_fen: FEN }] };
  const jobs = createJobs(manifest, { variants: 5, width: 1024, height: 1024 });
  assert.equal(jobs.length, 5);
  assert.equal(new Set(jobs.map(({ style }) => style)).size, 5);
  assert(jobs.every(({ fen }) => fen === FEN));
});
