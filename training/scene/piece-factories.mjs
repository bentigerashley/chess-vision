import * as THREE from '../node_modules/three/build/three.module.js';
import { canvasTexture, hexToRgb, seededUnit, TEXTURE_SIZE } from './material-textures.mjs';

const WHITE = 'w';
const BLACK = 'b';

export const CHESS_SET_SPECS = Object.freeze({
  'wood-staunton': {
    id: 'wood-staunton',
    silhouette: 'club-staunton',
    profile: { pawn_scale: 1, major_scale: 1.03, king_scale: 1.12, detail: 1.18, base: 1, knight_turn: 0.08, crown_points: 6 },
    board: { id: 'walnut-maple', light_square: '#e6c999', dark_square: '#795435', frame: '#3d2010', inlay: '#c29557', table: '#725337', table_surface: 'walnut', inlay_surface: 'walnut', inlay_metalness: 0.12, lighting: ['north-window', 'warm-study', 'neutral-studio'] },
    materials: {
      white: { surface: 'boxwood', color: '#d8a45e', roughness: 0.31, clearcoat: 0.34 },
      black: { surface: 'walnut', color: '#7b5138', roughness: 0.34, clearcoat: 0.24 },
      accent: { surface: 'brass', color: '#9a6424', roughness: 0.25, metalness: 0.62, clearcoat: 0.2 },
    },
  },
  'marble-classical': {
    id: 'marble-classical',
    silhouette: 'neoclassical-column',
    profile: { pawn_scale: 1.04, major_scale: 1.1, king_scale: 1.16, detail: 1.44, base: 1.08, knight_turn: -0.04, crown_points: 8 },
    board: { id: 'carrara-serpentine', light_square: '#e4e0d6', dark_square: '#52736f', frame: '#6b716e', inlay: '#d1c7af', table: '#454c4c', table_surface: 'stone', inlay_surface: 'stone', inlay_metalness: 0.12, lighting: ['north-window'] },
    materials: {
      white: { surface: 'carrara', color: '#e9e4d8', roughness: 0.19, clearcoat: 0.16 },
      black: { surface: 'serpentine', color: '#3e6561', roughness: 0.3, clearcoat: 0.14 },
      accent: { surface: 'aged-brass', color: '#b6a88a', roughness: 0.34, metalness: 0.38, clearcoat: 0.12 },
    },
  },
  'ebony-ivory-tournament': {
    id: 'ebony-ivory-tournament',
    silhouette: 'slender-tournament',
    profile: { pawn_scale: 0.96, major_scale: 0.99, king_scale: 1.08, detail: 0.9, base: 0.9, knight_turn: 0.12, crown_points: 6 },
    board: { id: 'ebony-ivory-inlay', light_square: '#eadcc4', dark_square: '#49362b', frame: '#1f1511', inlay: '#b98d4e', table: '#2b2927', table_surface: 'ebony', inlay_surface: 'ebony', inlay_metalness: 0.12, lighting: ['north-window', 'warm-study', 'neutral-studio'] },
    materials: {
      white: { surface: 'ivory', color: '#eee2ca', roughness: 0.28, clearcoat: 0.19 },
      black: { surface: 'ebony', color: '#625b52', roughness: 0.28, clearcoat: 0.28 },
      accent: { surface: 'gold', color: '#bf9145', roughness: 0.22, metalness: 0.72, clearcoat: 0.22 },
    },
  },
  'brass-minimal': {
    id: 'brass-minimal',
    silhouette: 'architectural-minimal',
    profile: { pawn_scale: 0.91, major_scale: 0.91, king_scale: 0.99, detail: 0.52, base: 0.86, knight_turn: 0.17, crown_points: 5 },
    board: { id: 'brushed-brass-slate', light_square: '#c8c0b1', dark_square: '#4f6267', frame: '#89724e', inlay: '#d5b763', table: '#313b3e', table_surface: 'slate', inlay_surface: 'brass', inlay_metalness: 0.68, lighting: ['north-window', 'warm-study', 'neutral-studio'] },
    materials: {
      white: { surface: 'brushed-brass', color: '#d6b267', roughness: 0.29, metalness: 0.94, clearcoat: 0.18 },
      // The dark side is patinated brass rather than a mirror-black coating.
      // Its low metalness keeps a diffuse room-light component, as on a satin
      // blackened alloy, so a phone camera can recover the silhouette.
      black: { surface: 'blackened-brass', color: '#627880', roughness: 0.5, metalness: 0.22, clearcoat: 0.12, specular_intensity: 1.75 },
      accent: { surface: 'brushed-brass', color: '#edcd79', roughness: 0.2, metalness: 0.96, clearcoat: 0.22 },
    },
  },
  'ornate-dark-wood': {
    id: 'ornate-dark-wood',
    silhouette: 'baroque-ornate',
    profile: { pawn_scale: 1.1, major_scale: 1.16, king_scale: 1.27, detail: 2, base: 1.18, knight_turn: -0.13, crown_points: 9 },
    board: { id: 'mahogany-boxwood', light_square: '#d8aa67', dark_square: '#6e3421', frame: '#35130c', inlay: '#bd8235', table: '#5a2c1d', table_surface: 'mahogany', inlay_surface: 'mahogany', inlay_metalness: 0.12, lighting: ['warm-study'] },
    materials: {
      white: { surface: 'boxwood', color: '#c98243', roughness: 0.28, clearcoat: 0.42 },
      black: { surface: 'mahogany', color: '#7c442f', roughness: 0.32, clearcoat: 0.3 },
      accent: { surface: 'aged-gold', color: '#b98535', roughness: 0.24, metalness: 0.76, clearcoat: 0.2 },
    },
  },
});

export const CHESS_SET_FAMILIES = Object.freeze(Object.keys(CHESS_SET_SPECS));

export function getChessSetSpec(style) {
  const spec = CHESS_SET_SPECS[style];
  if (!spec) throw new Error(`Unknown chess-set family: ${style}`);
  return spec;
}

function surfaceSignal(kind, x, y, random) {
  const noise = random(x, y) - 0.5;
  if (kind.includes('wood') || kind === 'boxwood' || kind === 'ebony' || kind === 'mahogany' || kind === 'walnut') {
    return Math.sin((y + noise * 18) * 0.18 + Math.sin(x * 0.045) * 3.2) * 0.14 + noise * 0.11;
  }
  if (kind.includes('marble') || kind === 'carrara' || kind === 'serpentine' || kind === 'stone' || kind === 'slate') {
    return Math.sin(x * 0.045 + y * 0.066 + Math.sin(y * 0.032) * 4) * 0.1 + noise * 0.06;
  }
  if (kind.includes('brass') || kind.includes('gold')) return Math.sin(y * 1.5) * 0.04 + noise * 0.045;
  return noise * 0.055;
}

function buildSurfaceMaps({ surface, color, seed }) {
  const albedo = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const height = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const roughness = new Uint8ClampedArray(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const base = hexToRgb(color);
  const random = seededUnit(`${surface}:${seed}`);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const offset = (y * TEXTURE_SIZE + x) * 4;
      const signal = surfaceSignal(surface, x, y, random);
      const vein = surface === 'carrara' || surface === 'serpentine'
        ? Math.max(0, Math.sin(x * 0.028 - y * 0.04 + Math.sin(y * 0.09) * 1.5) - 0.8) * 1.9
        : 0;
      for (let channel = 0; channel < 3; channel += 1) {
        albedo[offset + channel] = THREE.MathUtils.clamp(base[channel] * (1 + signal - vein * 0.38), 0, 255);
      }
      const detail = THREE.MathUtils.clamp(132 + signal * 360 - vein * 65, 0, 255);
      height[offset] = height[offset + 1] = height[offset + 2] = detail;
      const matte = surface.includes('brass') || surface.includes('gold') ? 118 : surface === 'ivory' ? 156 : 178;
      const rough = THREE.MathUtils.clamp(matte + signal * 70 + vein * 30, 0, 255);
      roughness[offset] = roughness[offset + 1] = roughness[offset + 2] = rough;
      albedo[offset + 3] = height[offset + 3] = roughness[offset + 3] = 255;
    }
  }
  return {
    map: canvasTexture(albedo, THREE.SRGBColorSpace),
    bumpMap: canvasTexture(height, THREE.NoColorSpace),
    roughnessMap: canvasTexture(roughness, THREE.NoColorSpace),
  };
}

function pbrMaterial(materialSpec, seed) {
  const maps = buildSurfaceMaps({ surface: materialSpec.surface, color: materialSpec.color, seed });
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: materialSpec.roughness,
    metalness: materialSpec.metalness ?? 0,
    clearcoat: materialSpec.clearcoat ?? 0,
    clearcoatRoughness: Math.min((materialSpec.roughness ?? 0.35) + 0.1, 1),
    specularIntensity: materialSpec.specular_intensity ?? 1,
    map: maps.map,
    bumpMap: maps.bumpMap,
    bumpScale: materialSpec.metalness ? 0.025 : 0.045,
    roughnessMap: maps.roughnessMap,
    envMapIntensity: materialSpec.metalness ? 1.3 : 0.9,
  });
}

function buildMaterials(spec) {
  return {
    [WHITE]: pbrMaterial(spec.materials.white, `${spec.id}:white`),
    [BLACK]: pbrMaterial(spec.materials.black, `${spec.id}:black`),
    accent: pbrMaterial(spec.materials.accent, `${spec.id}:accent`),
  };
}

function mesh(geometry, material, y = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.y = y;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function lathe(profile, material, y = 0, segments = 72) {
  return mesh(new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), segments), material, y);
}

function ring(material, radius, tube, y) {
  const part = mesh(new THREE.TorusGeometry(radius, tube, 16, 72), material, y);
  part.rotation.x = Math.PI / 2;
  return part;
}

function baseAndStem(group, material, accent, scale, profile) {
  const detail = profile.detail;
  const base = profile.base;
  group.add(lathe([
    [0, 0], [0.33 * base * scale, 0], [0.43 * base * scale, 0.035 * scale], [0.46 * base * scale, 0.09 * scale],
    [0.43 * base * scale, 0.15 * scale], [0.31 * base * scale, 0.22 * scale], [0.27 * base * scale, 0.3 * scale],
  ], material));
  group.add(ring(accent, 0.31 * base * scale, 0.022 * scale, 0.145 * scale));
  group.add(ring(material, 0.25 * base * scale, 0.014 * scale, 0.255 * scale));
  if (detail > 1.15) {
    group.add(ring(accent, 0.215 * base * scale, 0.012 * scale, 0.315 * scale));
    group.add(lathe([[0.21 * scale, 0.3 * scale], [0.19 * scale, 0.36 * scale], [0.16 * scale, 0.41 * scale]], material));
  }
}

function createPawn(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.pawn_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([
    [0.24 * scale, 0.3 * scale], [0.19 * scale, 0.43 * scale], [0.135 * scale, 0.55 * scale], [0.125 * scale, 0.64 * scale],
  ], material));
  group.add(ring(accent, 0.145 * scale, 0.017 * scale, 0.61 * scale));
  const head = mesh(new THREE.SphereGeometry(0.19 * scale, 48, 32), material, 0.8 * scale);
  head.scale.set(1, 1.04, 1);
  group.add(head);
  return group;
}

function createRook(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.major_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([
    [0.25 * scale, 0.3 * scale], [0.205 * scale, 0.5 * scale], [0.19 * scale, 0.77 * scale], [0.255 * scale, 0.88 * scale], [0.29 * scale, 0.98 * scale],
  ], material));
  group.add(ring(accent, 0.275 * scale, 0.02 * scale, 0.86 * scale));
  group.add(mesh(new THREE.CylinderGeometry(0.285 * scale, 0.3 * scale, 0.16 * scale, 64), material, 1.04 * scale));
  const crenels = profile.detail > 1.5 ? 8 : 6;
  for (let index = 0; index < crenels; index += 1) {
    const angle = index * Math.PI * 2 / crenels;
    const crenel = mesh(new THREE.BoxGeometry(0.125 * scale, 0.11 * scale, 0.14 * scale), material, 1.16 * scale);
    crenel.position.x = Math.cos(angle) * 0.245 * scale;
    crenel.position.z = Math.sin(angle) * 0.245 * scale;
    crenel.rotation.y = -angle;
    group.add(crenel);
  }
  return group;
}

function createKnight(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.major_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([[0.25 * scale, 0.3 * scale], [0.18 * scale, 0.5 * scale], [0.17 * scale, 0.64 * scale], [0.22 * scale, 0.7 * scale]], material));
  const shape = new THREE.Shape();
  shape.moveTo(-0.21 * scale, 0.58 * scale);
  shape.bezierCurveTo(-0.17 * scale, 0.88 * scale, -0.25 * scale, 1.13 * scale, -0.09 * scale, 1.37 * scale);
  shape.lineTo(0.015 * scale, 1.58 * scale);
  shape.quadraticCurveTo(0.1 * scale, 1.45 * scale, 0.17 * scale, 1.34 * scale);
  shape.quadraticCurveTo(0.3 * scale, 1.14 * scale, 0.16 * scale, 0.97 * scale);
  shape.lineTo(0.22 * scale, 0.76 * scale);
  shape.lineTo(0.08 * scale, 0.58 * scale);
  shape.closePath();
  const neck = new THREE.ExtrudeGeometry(shape, { depth: 0.3 * scale, bevelEnabled: true, bevelSegments: 5, bevelSize: 0.03 * scale, bevelThickness: 0.035 * scale, curveSegments: 28 });
  neck.translate(0, 0, -0.15 * scale);
  const head = mesh(neck, material);
  head.rotation.y = profile.knight_turn;
  group.add(head);
  const muzzle = mesh(new THREE.SphereGeometry(0.1 * scale, 32, 20), material, 1.27 * scale);
  muzzle.scale.set(1.25, 0.7, 0.85);
  muzzle.position.set(0.12 * scale, 1.27 * scale, 0.14 * scale);
  group.add(muzzle);
  for (const x of [-0.045, 0.07]) {
    const ear = mesh(new THREE.ConeGeometry(0.055 * scale, 0.19 * scale, 32), material, 1.53 * scale);
    ear.position.set(x * scale, 1.53 * scale, 0.02 * scale);
    ear.rotation.z = x < 0 ? 0.16 : -0.14;
    group.add(ear);
  }
  const mane = mesh(new THREE.BoxGeometry(0.05 * scale, 0.68 * scale, 0.095 * scale), accent, 1.08 * scale);
  mane.position.set(-0.125 * scale, 1.08 * scale, -0.16 * scale);
  mane.rotation.z = 0.24;
  group.add(mane);
  for (const z of [-0.16, 0.16]) {
    const eye = mesh(new THREE.SphereGeometry(0.025 * scale, 18, 12), accent, 1.29 * scale);
    eye.position.set(0.105 * scale, 1.31 * scale, z * scale);
    group.add(eye);
  }
  return group;
}

function createBishop(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.major_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([[0.25 * scale, 0.3 * scale], [0.18 * scale, 0.54 * scale], [0.135 * scale, 0.75 * scale], [0.18 * scale, 0.88 * scale], [0.1 * scale, 0.97 * scale]], material));
  group.add(ring(accent, 0.18 * scale, 0.018 * scale, 0.87 * scale));
  const mitre = mesh(new THREE.SphereGeometry(0.205 * scale, 48, 32), material, 1.11 * scale);
  mitre.scale.set(0.92, 1.48, 0.92);
  group.add(mitre);
  for (const z of [-0.19, 0.19]) {
    const slit = mesh(new THREE.BoxGeometry(0.038 * scale, 0.28 * scale, 0.018 * scale), accent, 1.12 * scale);
    slit.position.set(0, 1.12 * scale, z * scale);
    slit.rotation.z = -0.58;
    group.add(slit);
  }
  return group;
}

function createQueen(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.major_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([[0.27 * scale, 0.3 * scale], [0.18 * scale, 0.56 * scale], [0.15 * scale, 0.79 * scale], [0.24 * scale, 0.92 * scale], [0.22 * scale, 1.03 * scale]], material));
  group.add(ring(accent, 0.23 * scale, 0.02 * scale, 0.94 * scale));
  group.add(mesh(new THREE.CylinderGeometry(0.205 * scale, 0.16 * scale, 0.13 * scale, 64), material, 1.08 * scale));
  for (let index = 0; index < profile.crown_points; index += 1) {
    const angle = index * Math.PI * 2 / profile.crown_points + Math.PI / 2;
    const finial = mesh(new THREE.SphereGeometry(0.058 * scale, 24, 16), accent, 1.19 * scale);
    finial.position.set(Math.cos(angle) * 0.19 * scale, 1.19 * scale, Math.sin(angle) * 0.19 * scale);
    group.add(finial);
  }
  group.add(mesh(new THREE.SphereGeometry(0.075 * scale, 28, 18), material, 1.29 * scale));
  return group;
}

function createKing(material, accent, profile) {
  const group = new THREE.Group();
  const scale = profile.king_scale;
  baseAndStem(group, material, accent, scale, profile);
  group.add(lathe([[0.28 * scale, 0.3 * scale], [0.18 * scale, 0.6 * scale], [0.145 * scale, 0.88 * scale], [0.24 * scale, 1.04 * scale], [0.16 * scale, 1.16 * scale]], material));
  group.add(ring(accent, 0.22 * scale, 0.022 * scale, 1.05 * scale));
  const crown = mesh(new THREE.SphereGeometry(0.15 * scale, 36, 24), material, 1.24 * scale);
  crown.scale.y = 0.68;
  group.add(crown);
  const vertical = mesh(new THREE.CylinderGeometry(0.042 * scale, 0.042 * scale, 0.34 * scale, 24), accent, 1.46 * scale);
  const horizontal = mesh(new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, 0.28 * scale, 24), accent, 1.54 * scale);
  horizontal.rotation.z = Math.PI / 2;
  group.add(vertical, horizontal);
  return group;
}

/** Build original high-detail procedural chess meshes. They are not scans or copies of third-party assets. */
export function createPieceFactory(style) {
  const spec = getChessSetSpec(style);
  const profile = spec.profile;
  const materials = buildMaterials(spec);
  const constructors = { p: createPawn, r: createRook, n: createKnight, b: createBishop, q: createQueen, k: createKing };
  return {
    style,
    spec,
    create(piece) {
      const type = piece.toLowerCase();
      const color = piece === type ? BLACK : WHITE;
      const constructor = constructors[type];
      if (!constructor) throw new Error(`Unsupported FEN piece: ${piece}`);
      const result = constructor(materials[color], materials.accent, profile);
      result.userData = { piece, color, type, style, silhouette: spec.silhouette };
      return result;
    },
  };
}
