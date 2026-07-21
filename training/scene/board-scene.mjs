import * as THREE from '../node_modules/three/build/three.module.js';
import { between, createRandom } from './random.mjs';
import { CHESS_SET_FAMILIES, getChessSetSpec } from './piece-factories.mjs';
import { createGltfPieceFactory } from './gltf-piece-factory.mjs';
import { canvasTexture, hexToRgb, seededUnit, TEXTURE_SIZE } from './material-textures.mjs';

export const BOARD_SQUARE_SIZE = 1;
export const BOARD_HALF_SIZE = 4;
export const BOARD_FRAME_HALF_SIZE = BOARD_HALF_SIZE + 0.58;
export const BOARD_TOP_Y = 0.22;
export const BOARD_FRAME_BOTTOM_Y = -0.2;
export const REQUIRED_BOARD_MARGIN_PX = 32;

const FEN_PIECES = new Set(['p', 'r', 'n', 'b', 'q', 'k', 'P', 'R', 'N', 'B', 'Q', 'K']);
const FILES = 'abcdefgh';

export const CAMERA_RIGS = Object.freeze([
  { id: 'player-oblique', fov: [37, 46], x: [-0.78, 0.68], y: [0.56, 0.84], z: [-1.04, -0.62], distance: [14.4, 17] },
  { id: 'diagonal-gallery', fov: [34, 42], x: [-1.02, 0.96], y: [0.78, 1.14], z: [-0.88, -0.45], distance: [15.2, 18] },
  { id: 'elevated-overlook', fov: [42, 52], x: [-0.55, 0.55], y: [1.14, 1.55], z: [-0.82, -0.45], distance: [16, 19] },
  { id: 'low-player-side', fov: [35, 43], x: [-0.6, 0.62], y: [0.4, 0.6], z: [-1.1, -0.72], distance: [15, 18] },
]);

const LIGHTING_RIGS = Object.freeze([
  { id: 'north-window', sky: '#dcecff', ground: '#3c2b21', key: '#fff5e1', fill: '#aec5e6', rim: '#eff4ff', exposure: [0.92, 1.08] },
  { id: 'warm-study', sky: '#ffe9c9', ground: '#2e1d16', key: '#ffd69a', fill: '#8ba5c2', rim: '#ffe5b2', exposure: [0.88, 1.02] },
  { id: 'neutral-studio', sky: '#f4f1eb', ground: '#2f302f', key: '#fffdf7', fill: '#c7d3dd', rim: '#ffffff', exposure: [0.96, 1.12] },
]);
const LIGHTING_RIG_BY_ID = new Map(LIGHTING_RIGS.map((rig) => [rig.id, rig]));

export function fenToSquares(fen) {
  const placement = String(fen).trim().split(/\s+/)[0];
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error(`FEN must contain eight ranks: ${fen}`);
  const squares = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    let fileIndex = 0;
    for (const token of ranks[rankIndex]) {
      if (/^[1-8]$/.test(token)) fileIndex += Number(token);
      else if (FEN_PIECES.has(token)) {
        if (fileIndex > 7) throw new Error(`FEN rank overflows: ${fen}`);
        const rank = 8 - rankIndex;
        squares.push({ square: `${FILES[fileIndex]}${rank}`, fileIndex, rank, piece: token });
        fileIndex += 1;
      } else throw new Error(`Invalid FEN piece token: ${token}`);
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
  for (let rank = 8; rank >= 1; rank -= 1) for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
    const square = `${FILES[fileIndex]}${rank}`;
    labels.push({ square, file: FILES[fileIndex], rank, piece: occupied.get(square) ?? null, ...physicalSquare(fileIndex, rank) });
  }
  return labels;
}

function materialTexture({ surface, color, seed, repeat = 1 }) {
  const data = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const rgb = hexToRgb(color);
  const random = seededUnit(`${surface}:${seed}`);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) for (let x = 0; x < TEXTURE_SIZE; x += 1) {
    const offset = (y * TEXTURE_SIZE + x) * 4;
    const noise = random(x, y) - 0.5;
    const grain = surface === 'walnut' || surface === 'mahogany' || surface === 'ebony'
      ? Math.sin(y * 0.31 + Math.sin(x * 0.045) * 2.4) * 0.032 + Math.sin(y * 0.065 + x * 0.022) * 0.018 + noise * 0.028
      : surface === 'stone' || surface === 'slate'
        ? Math.sin(x * 0.037 + y * 0.052) * 0.022 + noise * 0.036
        : noise * 0.035;
    for (let channel = 0; channel < 3; channel += 1) data[offset + channel] = THREE.MathUtils.clamp(rgb[channel] * (1 + grain), 0, 255);
    data[offset + 3] = 255;
  }
  return canvasTexture(data, THREE.SRGBColorSpace, { repeat });
}

function pbrBoardMaterial(color, { roughness, metalness = 0, clearcoat = 0, surface, seed, repeat = 1 }) {
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness, metalness, clearcoat, clearcoatRoughness: Math.min(roughness + 0.1, 1),
    map: materialTexture({ surface, color, seed, repeat }), envMapIntensity: metalness ? 1.25 : 0.82,
  });
}

function shadowMesh(geometry, material, x, y, z) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function createBoard(random, spec) {
  const group = new THREE.Group();
  const board = spec.board;
  const variant = Math.floor(random() * 100000);
  const squareDepth = 0.13;
  const whiteMaterial = pbrBoardMaterial(board.light_square, { roughness: 0.42, clearcoat: 0.12, surface: board.table_surface, seed: `${board.id}:light:${variant}`, repeat: 1 });
  const darkMaterial = pbrBoardMaterial(board.dark_square, { roughness: 0.4, clearcoat: 0.12, surface: board.table_surface, seed: `${board.id}:dark:${variant}`, repeat: 1 });
  const frameMaterial = pbrBoardMaterial(board.frame, { roughness: 0.28, clearcoat: 0.42, surface: board.table_surface, seed: `${board.id}:frame:${variant}`, repeat: 1.8 });
  const inlayMaterial = pbrBoardMaterial(board.inlay, { roughness: 0.24, metalness: board.inlay_metalness, clearcoat: 0.2, surface: board.inlay_surface, seed: `${board.id}:inlay:${variant}` });
  const squareGeometry = new THREE.BoxGeometry(1, squareDepth, 1);
  for (let rank = 1; rank <= 8; rank += 1) for (let file = 0; file < 8; file += 1) {
    const { center } = physicalSquare(file, rank);
    group.add(shadowMesh(squareGeometry, (file + rank) % 2 ? whiteMaterial : darkMaterial, center[0], BOARD_TOP_Y - squareDepth / 2, center[2]));
  }
  const inner = BOARD_HALF_SIZE + 0.2;
  const outer = BOARD_FRAME_HALF_SIZE;
  const frameHeight = 0.23;
  const rails = [
    [outer * 2, frameHeight, outer - inner, 0, -(inner + outer) / 2],
    [outer * 2, frameHeight, outer - inner, 0, (inner + outer) / 2],
    [outer - inner, frameHeight, inner * 2, -(inner + outer) / 2, 0],
    [outer - inner, frameHeight, inner * 2, (inner + outer) / 2, 0],
  ];
  for (const [width, height, depth, x, z] of rails) group.add(shadowMesh(new THREE.BoxGeometry(width, height, depth), frameMaterial, x, BOARD_TOP_Y - frameHeight / 2, z));
  const trim = inner + 0.06;
  for (const [width, depth, x, z] of [[trim * 2, 0.038, 0, -trim], [trim * 2, 0.038, 0, trim], [0.038, trim * 2, -trim, 0], [0.038, trim * 2, trim, 0]]) {
    group.add(shadowMesh(new THREE.BoxGeometry(width, 0.028, depth), inlayMaterial, x, BOARD_TOP_Y + 0.01, z));
  }
  group.add(shadowMesh(new THREE.BoxGeometry(outer * 2, 0.22, outer * 2), frameMaterial, 0, -0.09, 0));
  const table = shadowMesh(new THREE.BoxGeometry(25, 0.35, 25), pbrBoardMaterial(board.table, { roughness: 0.44, clearcoat: 0.08, surface: board.table_surface, seed: `${board.id}:table:${variant}`, repeat: 0.72 }), 0, -0.38, 0);
  table.receiveShadow = true;
  group.add(table);
  return group;
}

export function configureCamera(random, width, height, pieceRoots = []) {
  const rig = CAMERA_RIGS[Math.floor(random() * CAMERA_RIGS.length)];
  const camera = new THREE.PerspectiveCamera(between(random, rig.fov[0], rig.fov[1]), width / height, 0.1, 100);
  const direction = new THREE.Vector3(between(random, rig.x[0], rig.x[1]), between(random, rig.y[0], rig.y[1]), between(random, rig.z[0], rig.z[1])).normalize();
  const target = new THREE.Vector3(between(random, -0.34, 0.34), between(random, 0.02, 0.18), between(random, -0.26, 0.26));
  let distance = between(random, rig.distance[0], rig.distance[1]);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    if (validateSceneInFrame(camera, width, height, REQUIRED_BOARD_MARGIN_PX, pieceRoots)) break;
    distance += 1.55;
  }
  if (!validateSceneInFrame(camera, width, height, REQUIRED_BOARD_MARGIN_PX, pieceRoots)) throw new Error('Frame rejected: the physical board or a complete piece would be cropped');
  return { camera, metadata: { camera_rig: rig.id, fov_degrees: camera.fov, position: camera.position.toArray(), target: target.toArray(), board_margin_px: REQUIRED_BOARD_MARGIN_PX } };
}

export function projectWorldPoints(camera, points, width, height) {
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return points.map((point) => {
    const projected = point.clone().project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, z: projected.z };
  });
}

function boxCorners(bounds) {
  return [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.y, bounds.max.y].flatMap((y) => [bounds.min.z, bounds.max.z].map((z) => new THREE.Vector3(x, y, z))));
}

function boardBoundsCorners() {
  return boxCorners(new THREE.Box3(
    new THREE.Vector3(-BOARD_FRAME_HALF_SIZE, BOARD_FRAME_BOTTOM_Y, -BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, BOARD_FRAME_HALF_SIZE),
  ));
}

export function projectBoardCorners(camera, width, height) {
  return projectWorldPoints(camera, [
    new THREE.Vector3(-BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, -BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, -BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, BOARD_FRAME_HALF_SIZE),
    new THREE.Vector3(-BOARD_FRAME_HALF_SIZE, BOARD_TOP_Y, BOARD_FRAME_HALF_SIZE),
  ], width, height);
}

export function validateProjectedPointsInFrame(points, width, height, margin = REQUIRED_BOARD_MARGIN_PX) {
  return points.every(({ x, y, z }) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && z >= -1 && z <= 1 && x >= margin && x <= width - margin && y >= margin && y <= height - margin);
}

function exactWorldBounds(root) {
  root.updateMatrixWorld(true);
  const transformKey = root.matrixWorld.elements.join(',');
  const cached = root.userData.exact_world_bounds;
  if (cached?.transform_key === transformKey) return cached.bounds;
  // The source GLB has detailed/morph-capable meshes. The fast cached box can
  // be a few pixels tighter than the real raster silhouette, so compute the
  // exact world-space vertex envelope used by the truth contract once per
  // final root transform.
  const bounds = new THREE.Box3().setFromObject(root, true);
  root.userData.exact_world_bounds = { transform_key: transformKey, bounds };
  return bounds;
}

export function projectPieceBounds(camera, root, width, height) {
  const bounds = exactWorldBounds(root);
  if (bounds.isEmpty()) throw new Error('Piece bounds are empty');
  const corners = projectWorldPoints(camera, boxCorners(bounds), width, height);
  return {
    min_x: Math.min(...corners.map(({ x }) => x)), min_y: Math.min(...corners.map(({ y }) => y)),
    max_x: Math.max(...corners.map(({ x }) => x)), max_y: Math.max(...corners.map(({ y }) => y)),
    corners,
  };
}

export function validateBoardInFrame(camera, width, height, margin = REQUIRED_BOARD_MARGIN_PX) {
  return validateProjectedPointsInFrame(projectWorldPoints(camera, boardBoundsCorners(), width, height), width, height, margin);
}

export function validateSceneInFrame(camera, width, height, margin = REQUIRED_BOARD_MARGIN_PX, pieceRoots = []) {
  return validateBoardInFrame(camera, width, height, margin)
    && pieceRoots.every((root) => validateProjectedPointsInFrame(projectPieceBounds(camera, root, width, height).corners, width, height, margin));
}

function chooseLightingRig(random, board) {
  const id = board.lighting[Math.floor(random() * board.lighting.length)];
  return LIGHTING_RIG_BY_ID.get(id);
}

function createLighting(scene, random, board) {
  const rig = chooseLightingRig(random, board);
  // A tournament board photographed indoors still receives broad room and
  // window bounce. This keeps ebony and oxidised-metal detail visible without
  // resorting to emissive materials or a studio-flat look.
  const hemisphere = new THREE.HemisphereLight(rig.sky, rig.ground, between(random, 1.28, 1.65));
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(rig.key, between(random, 2.4, 3.6));
  key.position.set(between(random, -7, 7), between(random, 9, 14), between(random, -1, 8));
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -9;
  key.shadow.camera.right = key.shadow.camera.top = 9;
  key.shadow.bias = -0.00016;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.DirectionalLight(rig.fill, between(random, 0.9, 1.28));
  fill.position.set(between(random, -10, -4), between(random, 5, 9), between(random, -9, -3));
  scene.add(fill);
  const rim = new THREE.SpotLight(rig.rim, between(random, 0.7, 1.35), 18, Math.PI / 5.2, 0.55, 1.2);
  rim.position.set(between(random, 2, 8), between(random, 7, 12), between(random, -8, -2));
  rim.target.position.set(0, 0.2, 0);
  rim.castShadow = true;
  rim.shadow.mapSize.set(1024, 1024);
  scene.add(rim, rim.target);
  const toneMappingExposure = between(random, rig.exposure[0], rig.exposure[1]);
  return {
    id: rig.id, hemisphere_intensity: hemisphere.intensity, key_intensity: key.intensity, key_position: key.position.toArray(),
    fill_intensity: fill.intensity, rim_intensity: rim.intensity, rim_position: rim.position.toArray(), tone_mapping_exposure: toneMappingExposure,
  };
}

/**
 * Assemble one private training scene from the approved, asset-backed source.
 * There is intentionally no procedural selection in this path: a dataset
 * either uses the locked GLB or fails before an ambiguous truth is emitted.
 */
export async function buildChessScene({ fen, style, seed, width, height }) {
  if (!CHESS_SET_FAMILIES.includes(style)) throw new Error(`Unsupported style: ${style}`);
  const random = createRandom(seed);
  const spec = getChessSetSpec(style);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(spec.board.table);
  scene.add(createBoard(random, spec));
  const lighting = createLighting(scene, random, spec.board);
  const factory = await createGltfPieceFactory(style);
  const pieces = [];
  let instanceId = 1;
  for (const entry of fenToSquares(fen)) {
    const root = factory.create(entry.piece);
    const { center } = physicalSquare(entry.fileIndex, entry.rank);
    root.position.set(center[0], BOARD_TOP_Y, center[2]);
    root.rotation.y = between(random, -0.055, 0.055);
    root.userData.instanceId = instanceId;
    scene.add(root);
    pieces.push({ instanceId, root, piece: entry.piece, square: entry.square });
    instanceId += 1;
  }
  const { camera, metadata: cameraMetadata } = configureCamera(random, width, height, pieces.map(({ root }) => root));
  return {
    scene, camera, pieces, squares: allSquareLabels(fen), cameraMetadata, lighting,
    environment: {
      board_id: spec.board.id,
      silhouette: spec.silhouette,
      ...factory.provenance,
    },
    renderSettings: { tone_mapping_exposure: lighting.tone_mapping_exposure },
  };
}
