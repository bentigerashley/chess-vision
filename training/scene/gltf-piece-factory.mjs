import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_LABEL_PROVENANCE, LOCKED_CHESS_ASSET } from '../assets/asset-contract.mjs';
import { getChessSetSpec } from './piece-factories.mjs';

export const ASSET_PIECE_PROVENANCE = ASSET_LABEL_PROVENANCE;

// Names are deliberately tied to the locked GLB rather than inferred by
// traversal order. A source update must change both the asset lock and this
// visible contract before a new dataset can be produced.
export const FEN_ASSET_NODE_NAMES = Object.freeze({
  K: 'King_W', Q: 'Queen_W', R: 'Castle_W1', B: 'Bishop_W1', N: 'Knight_W1', P: 'Pawn_Body_W1',
  k: 'King_B', q: 'Queen_B', r: 'Castle_B1', b: 'Bishop_B1', n: 'Knight_B1', p: 'Pawn_Body_B1',
});

const FIDE_REFERENCE_SQUARE_MM = 57.5;
const FIDE_HEIGHT_MM_BY_TYPE = Object.freeze({ p: 50, r: 55, n: 60, b: 70, q: 85, k: 95 });

/**
 * The world-space profile for a tournament-style set on this renderer's
 * one-unit squares. Heights are the FIDE reference dimensions divided by a
 * 57.5 mm square, the midpoint of the recommended 50–60 mm square range.
 */
export const FIDE_GEOMETRY_PROFILE = Object.freeze({
  reference_square_mm: FIDE_REFERENCE_SQUARE_MM,
  square_size_world: 1,
  bottom_vertex_fraction: 0.18,
  base_transition_fraction: 0.06,
  base_diameter_ratio: Object.freeze({ min: 0.4, target: 0.45, max: 0.5 }),
  max_base_correction: 1.45,
  height_by_type: Object.freeze(Object.fromEntries(
    Object.entries(FIDE_HEIGHT_MM_BY_TYPE).map(([type, millimetres]) => [type, millimetres / FIDE_REFERENCE_SQUARE_MM]),
  )),
});

const ASSET_URL = new URL(`../assets/cache/${LOCKED_CHESS_ASSET.filename}`, import.meta.url).href;
let loadedAsset;
const styledTemplates = new Map();

function pieceType(piece) {
  const type = String(piece).toLowerCase();
  if (!Object.hasOwn(FIDE_GEOMETRY_PROFILE.height_by_type, type)) throw new Error(`Unsupported FIDE piece type: ${piece}`);
  return type;
}

function worldBounds(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Piece geometry has no measurable height');
  return { bounds, size };
}

/**
 * Measure the widest horizontal extent of vertices in the lowest portion of a
 * piece. Sampling vertices rather than an overall Box3 keeps a knight's head
 * or a queen's crown from being mistaken for its base.
 */
export function measureBottomBaseDiameter(root, bottomFraction = FIDE_GEOMETRY_PROFILE.bottom_vertex_fraction) {
  if (!root?.traverse || !Number.isFinite(bottomFraction) || bottomFraction <= 0 || bottomFraction > 1) {
    throw new Error('Base measurement requires an Object3D and a bottom fraction in (0, 1]');
  }
  const { bounds, size } = worldBounds(root);
  const cutoff = bounds.min.y + size.y * bottomFraction;
  const point = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let vertexCount = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry?.getAttribute?.('position');
    if (!positions) throw new Error(`Piece mesh ${object.name || '(unnamed)'} has no position vertices`);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
      if (point.y > cutoff) continue;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
      vertexCount += 1;
    }
  });
  if (vertexCount === 0) throw new Error('Piece geometry has no vertices in the requested bottom footprint');

  const xSpan = maxX - minX;
  const zSpan = maxZ - minZ;
  const diameter = Math.max(xSpan, zSpan);
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Piece base footprint has no measurable diameter');
  return {
    bottom_fraction: bottomFraction,
    cutoff_y: cutoff,
    vertex_count: vertexCount,
    x_span: xSpan,
    z_span: zSpan,
    diameter,
  };
}

/**
 * Correct only the lower base vertices. This leaves the shaft, crown, and
 * knight head at their authored proportions while bringing a near-compliant
 * asset into the FIDE base-diameter range.
 */
export function correctBottomBaseDiameter(root, targetDiameter, { baseMeasurement, boundsMeasurement } = {}) {
  if (!Number.isFinite(targetDiameter) || targetDiameter <= 0) throw new Error('Base correction requires a positive target diameter');
  const before = baseMeasurement ?? measureBottomBaseDiameter(root);
  const correction = targetDiameter / before.diameter;
  if (correction > FIDE_GEOMETRY_PROFILE.max_base_correction || correction < 1 / FIDE_GEOMETRY_PROFILE.max_base_correction) {
    throw new Error(`Base correction of ${correction.toFixed(3)} would materially distort the locked asset`);
  }
  const { bounds, size } = boundsMeasurement ?? worldBounds(root);
  const baseCenterX = (bounds.min.x + bounds.max.x) / 2;
  const baseCenterZ = (bounds.min.z + bounds.max.z) / 2;
  const baseHeight = size.y * FIDE_GEOMETRY_PROFILE.bottom_vertex_fraction;
  const baseCutoff = bounds.min.y + baseHeight;
  const transitionHeight = size.y * FIDE_GEOMETRY_PROFILE.base_transition_fraction;
  const transitionCutoff = baseCutoff + transitionHeight;
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const inverse = new THREE.Matrix4();
  root.traverse((object) => {
    if (!object.isMesh) return;
    let positions = object.geometry.getAttribute('position');
    if (!positions) throw new Error(`Piece mesh ${object.name || '(unnamed)'} has no position vertices`);
    inverse.copy(object.matrixWorld).invert();
    let changed = false;
    for (let index = 0; index < positions.count; index += 1) {
      local.fromBufferAttribute(positions, index);
      world.copy(local).applyMatrix4(object.matrixWorld);
      if (world.y > transitionCutoff) continue;
      const transitionProgress = THREE.MathUtils.clamp((world.y - baseCutoff) / transitionHeight, 0, 1);
      const eased = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
      const factor = world.y <= baseCutoff ? correction : correction + (1 - correction) * eased;
      if (!changed) {
        object.geometry = object.geometry.clone();
        positions = object.geometry.getAttribute('position');
      }
      world.x = baseCenterX + (world.x - baseCenterX) * factor;
      world.z = baseCenterZ + (world.z - baseCenterZ) * factor;
      local.copy(world).applyMatrix4(inverse);
      positions.setXYZ(index, local.x, local.y, local.z);
      changed = true;
    }
    if (changed) {
      positions.needsUpdate = true;
      object.geometry.computeVertexNormals();
    }
  });
  root.updateMatrixWorld(true);
  const after = measureBottomBaseDiameter(root);
  return { before, after, correction };
}

/** Normalize a cloned asset node to the renderer's FIDE-derived size profile. */
export function normalizeFidePieceTemplate(source, piece) {
  const type = pieceType(piece);
  const targetHeight = FIDE_GEOMETRY_PROFILE.height_by_type[type];

  const root = new THREE.Group();
  const mesh = source.clone(true);
  root.add(mesh);
  const { bounds, size } = worldBounds(root);
  mesh.position.x -= (bounds.min.x + bounds.max.x) / 2;
  mesh.position.y -= bounds.min.y;
  mesh.position.z -= (bounds.min.z + bounds.max.z) / 2;
  root.scale.setScalar(targetHeight / size.y);

  let normalizedBase = measureBottomBaseDiameter(root);
  const normalizedBounds = worldBounds(root);
  let baseRatio = normalizedBase.diameter / normalizedBounds.size.y;
  let baseCorrection = 1;
  if (baseRatio < FIDE_GEOMETRY_PROFILE.base_diameter_ratio.min || baseRatio > FIDE_GEOMETRY_PROFILE.base_diameter_ratio.max) {
    let correction;
    try {
      correction = correctBottomBaseDiameter(root, targetHeight * FIDE_GEOMETRY_PROFILE.base_diameter_ratio.target, {
        baseMeasurement: normalizedBase,
        boundsMeasurement: normalizedBounds,
      });
    } catch (error) {
      throw new Error(`Asset node ${source.name} cannot meet the FIDE base profile: ${error instanceof Error ? error.message : String(error)}`);
    }
    normalizedBase = correction.after;
    baseCorrection = correction.correction;
    baseRatio = normalizedBase.diameter / normalizedBounds.size.y;
  }
  if (baseRatio < FIDE_GEOMETRY_PROFILE.base_diameter_ratio.min || baseRatio > FIDE_GEOMETRY_PROFILE.base_diameter_ratio.max) throw new Error(`Asset node ${source.name} has a base ratio of ${baseRatio.toFixed(3)}, outside the FIDE 40–50% range`);
  if (normalizedBase.diameter > FIDE_GEOMETRY_PROFILE.square_size_world) {
    throw new Error(`Asset node ${source.name} has a base that exceeds one board square`);
  }
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // Geometries, materials, and textures are shared by all cloned positions.
    // The scene disposer must retain them until the private page closes.
    object.userData.assetShared = true;
  });
  root.userData.fide_geometry = Object.freeze({
    piece_type: type,
    height: normalizedBounds.size.y,
    base_diameter: normalizedBase.diameter,
    base_ratio: baseRatio,
    base_vertex_count: normalizedBase.vertex_count,
    base_correction: baseCorrection,
  });
  return root;
}

async function loadTemplates() {
  if (!loadedAsset) {
    loadedAsset = new GLTFLoader().loadAsync(ASSET_URL).then((gltf) => {
      const templates = new Map();
      for (const [piece, nodeName] of Object.entries(FEN_ASSET_NODE_NAMES)) {
        const node = gltf.scene.getObjectByName(nodeName);
        if (!node) throw new Error(`Locked chess asset is missing ${nodeName} for ${piece}`);
        templates.set(piece, normalizeFidePieceTemplate(node, piece));
      }
      return templates;
    });
  }
  return loadedAsset;
}

/** Load and measure the cache-locked source before a corpus render begins. */
export async function inspectLockedGltfAssetProfile() {
  const templates = await loadTemplates();
  return Object.fromEntries([...templates.entries()].map(([piece, template]) => [piece, {
    node_name: FEN_ASSET_NODE_NAMES[piece],
    ...template.userData.fide_geometry,
  }]));
}

function applySetFinish(template, materialSpec) {
  const styled = template.clone(true);
  styled.traverse((object) => {
    if (!object.isMesh) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((source) => {
      const material = source.clone();
      material.color.set(materialSpec.color);
      material.roughness = materialSpec.roughness;
      material.metalness = materialSpec.metalness ?? 0;
      material.clearcoat = materialSpec.clearcoat ?? 0;
      material.clearcoatRoughness = Math.min((materialSpec.roughness ?? 0.35) + 0.1, 1);
      material.specularIntensity = materialSpec.specular_intensity ?? 1;
      // Asset-base-color and roughness maps encode a showcase palette (green
      // pawn tops, mixed metals) that fights the requested real-world set
      // finish. Retain authored geometry and normal detail, but make the PBR
      // albedo and reflectance come exclusively from the selected set.
      material.map = null;
      material.emissiveMap = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      // The source asset includes translucent jewel-like pawn tops. They are
      // attractive in a showcase scene but are not representative of common
      // physical chess sets, so each style finishes them in the same material
      // as the body while retaining the authored geometry and texture detail.
      material.transmission = 0;
      material.thickness = 0;
      object.userData.assetShared = true;
      return material;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
  return styled;
}

async function templatesForStyle(style) {
  if (!styledTemplates.has(style)) {
    const spec = getChessSetSpec(style);
    styledTemplates.set(style, loadTemplates().then((templates) => new Map([...templates.entries()].map(([piece, template]) => {
      const materialSpec = piece === piece.toLowerCase() ? spec.materials.black : spec.materials.white;
      return [piece, applySetFinish(template, materialSpec)];
    }))));
  }
  return styledTemplates.get(style);
}

/**
 * Creates only provenance-locked, pre-authored meshes. It never falls back to
 * the procedural factory: a missing cache or malformed GLB makes the render
 * fail so ambiguous training data cannot be emitted.
 */
export async function createGltfPieceFactory(style) {
  const templates = await templatesForStyle(style);
  return {
    provenance: ASSET_PIECE_PROVENANCE,
    create(piece) {
      const template = templates.get(piece);
      if (!template) throw new Error(`Unsupported FEN piece: ${piece}`);
      const result = template.clone(true);
      result.userData = {
        ...result.userData,
        piece,
        color: piece === piece.toLowerCase() ? 'b' : 'w',
        type: piece.toLowerCase(),
        ...ASSET_PIECE_PROVENANCE,
      };
      return result;
    },
  };
}
