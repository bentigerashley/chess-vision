import * as THREE from '../node_modules/three/build/three.module.js';

const WHITE = 'w';
const BLACK = 'b';

function makeCanvasTexture(kind, color, vein) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 192;
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (kind === 'wood') {
    for (let y = 0; y < canvas.height; y += 3) {
      const wave = Math.sin(y * 0.11) * 12;
      context.strokeStyle = `rgba(38, 16, 5, ${0.08 + (y % 11) / 160})`;
      context.lineWidth = 1 + (y % 7) / 8;
      context.beginPath();
      context.moveTo(0, y + wave);
      context.bezierCurveTo(54, y - wave, 132, y + wave, 192, y - wave * 0.4);
      context.stroke();
    }
  } else if (kind === 'marble') {
    context.lineCap = 'round';
    for (let line = 0; line < 20; line += 1) {
      context.strokeStyle = vein;
      context.lineWidth = 0.5 + (line % 4) * 0.33;
      context.beginPath();
      const offset = line * 14 - 40;
      context.moveTo(offset, 0);
      context.bezierCurveTo(offset + 45, 62, offset - 22, 132, offset + 48, 192);
      context.stroke();
    }
  } else if (kind === 'brushed') {
    for (let y = 0; y < canvas.height; y += 2) {
      context.fillStyle = `rgba(255,255,255,${0.025 + (y % 5) / 270})`;
      context.fillRect(0, y, canvas.width, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}

function pbrMaterial({ color, roughness, metalness = 0, clearcoat = 0, map = null }) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: Math.min(roughness + 0.08, 1),
    map,
    envMapIntensity: metalness ? 1.25 : 0.8,
  });
}

function buildMaterials(style) {
  switch (style) {
    case 'wood-staunton':
      return {
        [WHITE]: pbrMaterial({ color: '#d6a253', roughness: 0.3, clearcoat: 0.32, map: makeCanvasTexture('wood', '#d6a253') }),
        [BLACK]: pbrMaterial({ color: '#21130d', roughness: 0.25, clearcoat: 0.38, map: makeCanvasTexture('wood', '#442315') }),
        accent: pbrMaterial({ color: '#7b421b', roughness: 0.27, clearcoat: 0.35 }),
      };
    case 'marble-classical':
      return {
        [WHITE]: pbrMaterial({ color: '#e9e3d5', roughness: 0.19, clearcoat: 0.18, map: makeCanvasTexture('marble', '#e9e3d5', 'rgba(96,95,85,0.22)') }),
        [BLACK]: pbrMaterial({ color: '#272a2a', roughness: 0.2, clearcoat: 0.15, map: makeCanvasTexture('marble', '#292d2d', 'rgba(216,224,218,0.17)') }),
        accent: pbrMaterial({ color: '#aa9f90', roughness: 0.24 }),
      };
    case 'ebony-ivory-tournament':
      return {
        [WHITE]: pbrMaterial({ color: '#f4ecd7', roughness: 0.28, clearcoat: 0.15 }),
        [BLACK]: pbrMaterial({ color: '#080807', roughness: 0.17, clearcoat: 0.5 }),
        accent: pbrMaterial({ color: '#b88b48', roughness: 0.3, metalness: 0.15 }),
      };
    case 'brass-minimal':
      return {
        [WHITE]: pbrMaterial({ color: '#d3a849', roughness: 0.24, metalness: 0.94, map: makeCanvasTexture('brushed', '#d3a849') }),
        [BLACK]: pbrMaterial({ color: '#30383a', roughness: 0.28, metalness: 0.92, map: makeCanvasTexture('brushed', '#30383a') }),
        accent: pbrMaterial({ color: '#f3d47c', roughness: 0.18, metalness: 0.95 }),
      };
    case 'ornate-dark-wood':
      return {
        [WHITE]: pbrMaterial({ color: '#c5894b', roughness: 0.32, clearcoat: 0.34, map: makeCanvasTexture('wood', '#c5894b') }),
        [BLACK]: pbrMaterial({ color: '#170b08', roughness: 0.24, clearcoat: 0.4, map: makeCanvasTexture('wood', '#34110d') }),
        accent: pbrMaterial({ color: '#b98a32', roughness: 0.2, metalness: 0.72 }),
      };
    default:
      throw new Error(`Unknown chess-set family: ${style}`);
  }
}

function mesh(geometry, material, y = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.y = y;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function lathe(profile, material, y = 0, segments = 32) {
  return mesh(new THREE.LatheGeometry(profile.map(([x, height]) => new THREE.Vector2(x, height)), segments), material, y);
}

function ring(material, radius, tube, y) {
  const part = mesh(new THREE.TorusGeometry(radius, tube, 10, 34), material, y);
  part.rotation.x = Math.PI / 2;
  return part;
}

function baseAndStem(group, material, accent, scale, detail = 1) {
  group.add(lathe([
    [0, 0], [0.37 * scale, 0], [0.43 * scale, 0.055 * scale], [0.42 * scale, 0.13 * scale],
    [0.31 * scale, 0.19 * scale], [0.27 * scale, 0.25 * scale], [0.26 * scale, 0.31 * scale],
  ], material));
  group.add(ring(accent, 0.29 * scale, 0.025 * scale, 0.195 * scale));
  if (detail > 1) {
    group.add(ring(material, 0.23 * scale, 0.018 * scale, 0.305 * scale));
  }
}

function createPawn(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.pawnScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.23 * scale, 0.3 * scale], [0.18 * scale, 0.44 * scale], [0.14 * scale, 0.55 * scale], [0.13 * scale, 0.62 * scale],
  ], material));
  group.add(ring(accent, 0.145 * scale, 0.018 * scale, 0.59 * scale));
  const head = mesh(new THREE.SphereGeometry(0.19 * scale, 28, 20), material, 0.79 * scale);
  group.add(head);
  return group;
}

function createRook(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.majorScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.25 * scale, 0.3 * scale], [0.21 * scale, 0.48 * scale], [0.2 * scale, 0.76 * scale], [0.28 * scale, 0.82 * scale], [0.29 * scale, 0.98 * scale],
  ], material));
  group.add(ring(accent, 0.27 * scale, 0.025 * scale, 0.84 * scale));
  const tower = mesh(new THREE.CylinderGeometry(0.29 * scale, 0.29 * scale, 0.17 * scale, 32), material, 1.02 * scale);
  group.add(tower);
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    const crenel = mesh(new THREE.BoxGeometry(0.16 * scale, 0.12 * scale, 0.16 * scale), material, 1.145 * scale);
    crenel.position.x = Math.cos(angle) * 0.24 * scale;
    crenel.position.z = Math.sin(angle) * 0.24 * scale;
    crenel.rotation.y = -angle;
    group.add(crenel);
  }
  return group;
}

function createKnight(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.majorScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.25 * scale, 0.3 * scale], [0.18 * scale, 0.48 * scale], [0.17 * scale, 0.58 * scale], [0.23 * scale, 0.65 * scale],
  ], material));
  // An extruded horse-head silhouette provides a recognisable knight, rather
  // than approximating it with a sphere or cone.
  const shape = new THREE.Shape();
  shape.moveTo(-0.19 * scale, 0.56 * scale);
  shape.lineTo(-0.1 * scale, 0.86 * scale);
  shape.quadraticCurveTo(-0.22 * scale, 1.08 * scale, -0.08 * scale, 1.3 * scale);
  shape.lineTo(0.03 * scale, 1.5 * scale);
  shape.lineTo(0.14 * scale, 1.33 * scale);
  shape.quadraticCurveTo(0.27 * scale, 1.17 * scale, 0.15 * scale, 1.0 * scale);
  shape.lineTo(0.21 * scale, 0.76 * scale);
  shape.lineTo(0.09 * scale, 0.58 * scale);
  shape.closePath();
  const headGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.23 * scale, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.025 * scale, bevelThickness: 0.025 * scale, curveSegments: 18 });
  headGeometry.translate(0, 0, -0.115 * scale);
  const head = mesh(headGeometry, material);
  head.rotation.y = profile.knightTurn;
  group.add(head);
  const eye = mesh(new THREE.SphereGeometry(0.024 * scale, 12, 8), accent, 1.22 * scale);
  eye.position.set(0.12 * scale, 1.22 * scale, 0.125 * scale);
  group.add(eye);
  const mane = mesh(new THREE.BoxGeometry(0.045 * scale, 0.55 * scale, 0.08 * scale), accent, 1.03 * scale);
  mane.position.set(-0.115 * scale, 1.03 * scale, -0.13 * scale);
  mane.rotation.z = 0.23;
  group.add(mane);
  return group;
}

function createBishop(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.majorScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.25 * scale, 0.3 * scale], [0.18 * scale, 0.52 * scale], [0.14 * scale, 0.72 * scale], [0.18 * scale, 0.84 * scale], [0.1 * scale, 0.94 * scale],
  ], material));
  group.add(ring(accent, 0.175 * scale, 0.02 * scale, 0.84 * scale));
  const mitre = mesh(new THREE.SphereGeometry(0.2 * scale, 28, 22), material, 1.08 * scale);
  mitre.scale.y = 1.35;
  group.add(mitre);
  // Inlaid diagonal slit on both visible sides of the mitre.
  for (const z of [-0.185, 0.185]) {
    const slit = mesh(new THREE.BoxGeometry(0.045 * scale, 0.25 * scale, 0.014 * scale), accent, 1.1 * scale);
    slit.position.set(0, 1.1 * scale, z * scale);
    slit.rotation.z = -0.56;
    group.add(slit);
  }
  return group;
}

function createQueen(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.majorScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.27 * scale, 0.3 * scale], [0.18 * scale, 0.54 * scale], [0.16 * scale, 0.76 * scale], [0.25 * scale, 0.89 * scale], [0.22 * scale, 0.98 * scale],
  ], material));
  group.add(ring(accent, 0.23 * scale, 0.023 * scale, 0.91 * scale));
  const crown = mesh(new THREE.CylinderGeometry(0.21 * scale, 0.16 * scale, 0.13 * scale, 32), material, 1.05 * scale);
  group.add(crown);
  for (let index = 0; index < 5; index += 1) {
    const angle = index * Math.PI * 2 / 5 + Math.PI / 2;
    const orb = mesh(new THREE.SphereGeometry(0.065 * scale, 16, 12), accent, 1.17 * scale);
    orb.position.set(Math.cos(angle) * 0.18 * scale, 1.17 * scale, Math.sin(angle) * 0.18 * scale);
    group.add(orb);
  }
  group.add(mesh(new THREE.SphereGeometry(0.075 * scale, 16, 12), material, 1.25 * scale));
  return group;
}

function createKing(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.kingScale;
  baseAndStem(group, material, accent, scale, profile.ornate);
  group.add(lathe([
    [0.28 * scale, 0.3 * scale], [0.18 * scale, 0.58 * scale], [0.15 * scale, 0.84 * scale], [0.23 * scale, 0.99 * scale], [0.16 * scale, 1.1 * scale],
  ], material));
  group.add(ring(accent, 0.215 * scale, 0.024 * scale, 1.0 * scale));
  const crown = mesh(new THREE.SphereGeometry(0.15 * scale, 22, 16), material, 1.18 * scale);
  crown.scale.y = 0.7;
  group.add(crown);
  const vertical = mesh(new THREE.BoxGeometry(0.075 * scale, 0.34 * scale, 0.075 * scale), accent, 1.38 * scale);
  const horizontal = mesh(new THREE.BoxGeometry(0.28 * scale, 0.075 * scale, 0.075 * scale), accent, 1.46 * scale);
  group.add(vertical, horizontal);
  return group;
}

const FAMILY_PROFILES = {
  'wood-staunton': { pawnScale: 1, majorScale: 1, kingScale: 1.08, ornate: 1, knightTurn: 0.05 },
  'marble-classical': { pawnScale: 1.03, majorScale: 1.08, kingScale: 1.13, ornate: 1.15, knightTurn: -0.04 },
  'ebony-ivory-tournament': { pawnScale: 0.96, majorScale: 0.98, kingScale: 1.04, ornate: 1, knightTurn: 0.1 },
  'brass-minimal': { pawnScale: 0.88, majorScale: 0.88, kingScale: 0.95, ornate: 0, knightTurn: 0.14 },
  'ornate-dark-wood': { pawnScale: 1.1, majorScale: 1.14, kingScale: 1.22, ornate: 2, knightTurn: -0.12 },
};

export const CHESS_SET_FAMILIES = Object.freeze(Object.keys(FAMILY_PROFILES));

/**
 * Build original, procedural chess-piece meshes for one of the five families.
 * They are intentionally not advertised as scanned real-world assets.
 */
export function createPieceFactory(style) {
  const profile = FAMILY_PROFILES[style];
  if (!profile) throw new Error(`Unknown chess-set family: ${style}`);
  const materials = buildMaterials(style);
  const constructors = { p: createPawn, r: createRook, n: createKnight, b: createBishop, q: createQueen, k: createKing };

  return {
    style,
    create(piece) {
      const type = piece.toLowerCase();
      const color = piece === type ? BLACK : WHITE;
      const constructor = constructors[type];
      if (!constructor) throw new Error(`Unsupported FEN piece: ${piece}`);
      const result = constructor(materials[color], materials.accent, profile);
      result.userData = { piece, color, type, style };
      return result;
    },
  };
}
