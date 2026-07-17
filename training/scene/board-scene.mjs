import * as THREE from '../node_modules/three/build/three.module.js';
import { between, createRandom } from './random.mjs';
import { createPieceFactory, CHESS_SET_FAMILIES } from './piece-factories.mjs';

export const BOARD_SQUARE_SIZE = 1;
export const BOARD_HALF_SIZE = 4;
// The acceptance gate uses the visible outer edge of the physical board frame,
// not just the 8x8 playing surface. This prevents a technically complete grid
// from still looking like a cropped chessboard in a training image.
export const BOARD_FRAME_HALF_SIZE = BOARD_HALF_SIZE + 0.58;
export const BOARD_TOP_Y = 0.22;
export const REQUIRED_BOARD_MARGIN_PX = 32;

const FEN_PIECES = new Set(['p', 'r', 'n', 'b', 'q', 'k', 'P', 'R', 'N', 'B', 'Q', 'K']);
const FILES = 'abcdefgh';

export function fenToSquares(fen) {
  const placement = String(fen).trim().split(/\s+/)[0];
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error(`FEN must contain eight ranks: ${fen}`);
  const squares = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let fileIndex = 0;
    for (const token of ranks[rankIndex]) {
      if (/^[1-8]$/.test(token)) {
        fileIndex += Number(token);
      } else if (FEN_PIECES.has(token)) {
        if (fileIndex > 7) throw new Error(`FEN rank overflows: ${fen}`);
        const rank = 8 - rankIndex;
        const file = FILES[fileIndex];
        squares.push({ square: `${file}${rank}`, fileIndex, rank, piece: token });
        fileIndex += 1;
      } else {
        throw new Error(`Invalid FEN piece token: ${token}`);
      }
    }
    if (fileIndex !== 8) throw new Error(`FEN rank does not contain eight files: ${fen}`);
  }
  return squares;
}

export function physicalSquare(fileIndex, rank) {
  const x = (fileIndex - 3.5) * BOARD_SQUARE_SIZE;
  const z = (rank - 4.5) * BOARD_SQUARE_SIZE;
  const half = BOARD_SQUARE_SIZE / 2;
  return {
    center: [x, BOARD_TOP_Y, z],
    corners: [
      [x - half, BOARD_TOP_Y, z - half], [x + half, BOARD_TOP_Y, z - half],
      [x + half, BOARD_TOP_Y, z + half], [x - half, BOARD_TOP_Y, z + half],
    ],
  };
}

export function allSquareLabels(fen) {
  const occupied = new Map(fenToSquares(fen).map((entry) => [entry.square, entry.piece]));
  const labels = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const square = `${FILES[fileIndex]}${rank}`;
      labels.push({ square, file: FILES[fileIndex], rank, piece: occupied.get(square) ?? null, ...physicalSquare(fileIndex, rank) });
    }
  }
  return labels;
}

function shadowMesh(geometry, material, x, y, z) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function createBoard(random) {
  const group = new THREE.Group();
  const light = new THREE.Color(random() > 0.5 ? '#d7bd83' : '#e1c98d');
  const dark = new THREE.Color(random() > 0.5 ? '#6a8755' : '#557b4b');
  const squareDepth = 0.13;
  const whiteMaterial = new THREE.MeshPhysicalMaterial({ color: light, roughness: 0.52, clearcoat: 0.08 });
  const darkMaterial = new THREE.MeshPhysicalMaterial({ color: dark, roughness: 0.5, clearcoat: 0.06 });
  for (let rank = 1; rank <= 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const { center } = physicalSquare(file, rank);
      group.add(shadowMesh(new THREE.BoxGeometry(1, squareDepth, 1), (file + rank) % 2 ? whiteMaterial : darkMaterial, center[0], BOARD_TOP_Y - squareDepth / 2, center[2]));
    }
  }
  const frameMaterial = new THREE.MeshPhysicalMaterial({ color: '#462716', roughness: 0.31, clearcoat: 0.37, clearcoatRoughness: 0.25 });
  const inner = BOARD_HALF_SIZE + 0.2;
  const outer = BOARD_FRAME_HALF_SIZE;
  const frameHeight = 0.21;
  group.add(shadowMesh(new THREE.BoxGeometry(outer * 2, frameHeight, outer - inner), frameMaterial, 0, BOARD_TOP_Y - frameHeight / 2, -(inner + outer) / 2));
  group.add(shadowMesh(new THREE.BoxGeometry(outer * 2, frameHeight, outer - inner), frameMaterial, 0, BOARD_TOP_Y - frameHeight / 2, (inner + outer) / 2));
  group.add(shadowMesh(new THREE.BoxGeometry(outer - inner, frameHeight, inner * 2), frameMaterial, -(inner + outer) / 2, BOARD_TOP_Y - frameHeight / 2, 0));
  group.add(shadowMesh(new THREE.BoxGeometry(outer - inner, frameHeight, inner * 2), frameMaterial, (inner + outer) / 2, BOARD_TOP_Y - frameHeight / 2, 0));
  const under = shadowMesh(new THREE.BoxGeometry(outer * 2, 0.2, outer * 2), new THREE.MeshPhysicalMaterial({ color: '#27170e', roughness: 0.5 }), 0, -0.09, 0);
  group.add(under);
  return group;
}

export function configureCamera(random, width, height) {
  const camera = new THREE.PerspectiveCamera(between(random, 36, 43), width / height, 0.1, 100);
  // Rank 1 is at negative Z. A negative-Z camera makes White's side nearest
  // the bottom of the frame, matching the PWA's canonical rectified input.
  const direction = new THREE.Vector3(between(random, 0.45, 0.75), between(random, 0.65, 0.9), between(random, -0.85, -0.55)).normalize();
  const target = new THREE.Vector3(between(random, -0.18, 0.18), 0.1, between(random, -0.18, 0.18));
  let distance = between(random, 17.2, 19.5);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    if (validateBoardInFrame(camera, width, height, REQUIRED_BOARD_MARGIN_PX)) break;
    distance += 1.6;
  }
  if (!validateBoardInFrame(camera, width, height, REQUIRED_BOARD_MARGIN_PX)) {
    throw new Error('Frame rejected: physical outer board frame would be cropped');
  }
  return {
    camera,
    metadata: {
      fov_degrees: camera.fov,
      position: camera.position.toArray(),
      target: target.toArray(),
      board_margin_px: REQUIRED_BOARD_MARGIN_PX,
    },
  };
}

export function projectBoardCorners(camera, width, height) {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return [
    new THREE.Vector3(-BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, -BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, -BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(-BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, BOARD_FRAME_HALF_SIZE),
  ].map((corner) => {
    const projected = corner.project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, z: projected.z };
  });
}

export function validateBoardInFrame(camera, width, height, margin = REQUIRED_BOARD_MARGIN_PX) {
  return projectBoardCorners(camera, width, height).every(({ x, y, z }) => Number.isFinite(x) && Number.isFinite(y) && z >= -1 && z <= 1 && x >= margin && x <= width - margin && y >= margin && y <= height - margin);
}

function createLighting(scene, random) {
  const hemisphere = new THREE.HemisphereLight('#eef0ea', '#372218', between(random, 0.6, 0.95));
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight('#fff3d3', between(random, 2.1, 3.2));
  key.position.set(between(random, -5, 5), between(random, 8, 12), between(random, 2, 8));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#b8c7df', between(random, 0.2, 0.55));
  fill.position.set(between(random, -8, -3), between(random, 4, 7), between(random, -8, -3));
  scene.add(fill);
  return {
    hemisphere_intensity: hemisphere.intensity,
    key_intensity: key.intensity,
    key_position: key.position.toArray(),
    fill_intensity: fill.intensity,
    fill_position: fill.position.toArray(),
  };
}

export function buildChessScene({ fen, style, seed, width, height }) {
  if (!CHESS_SET_FAMILIES.includes(style)) throw new Error(`Unsupported style: ${style}`);
  const random = createRandom(seed);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9c4b8');
  const board = createBoard(random);
  scene.add(board);
  const lighting = createLighting(scene, random);
  const factory = createPieceFactory(style);
  const pieces = [];
  let instanceId = 1;
  for (const entry of fenToSquares(fen)) {
    const root = factory.create(entry.piece);
    const { center } = physicalSquare(entry.fileIndex, entry.rank);
    root.position.set(center[0], BOARD_TOP_Y, center[2]);
    root.rotation.y = between(random, -0.075, 0.075);
    root.userData.instanceId = instanceId;
    scene.add(root);
    pieces.push({ instanceId, root, piece: entry.piece, square: entry.square });
    instanceId += 1;
  }
  const { camera, metadata: cameraMetadata } = configureCamera(random, width, height);
  return { scene, camera, pieces, squares: allSquareLabels(fen), cameraMetadata, lighting };
}
