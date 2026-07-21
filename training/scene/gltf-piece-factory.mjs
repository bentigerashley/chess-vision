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

const TARGET_HEIGHT_BY_TYPE = Object.freeze({ p: 0.78, r: 1.02, n: 1.04, b: 1.12, q: 1.22, k: 1.34 });
const ASSET_URL = new URL(`../assets/cache/${LOCKED_CHESS_ASSET.filename}`, import.meta.url).href;
let loadedAsset;
const styledTemplates = new Map();

function centreOnBoard(source, targetHeight) {
  const root = new THREE.Group();
  const mesh = source.clone(true);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error(`Asset node ${source.name} has no measurable height`);
  mesh.position.x -= (box.min.x + box.max.x) / 2;
  mesh.position.y -= box.min.y;
  mesh.position.z -= (box.min.z + box.max.z) / 2;
  root.scale.setScalar(targetHeight / size.y);
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // Geometries, materials, and textures are shared by all cloned positions.
    // The scene disposer must retain them until the private page closes.
    object.userData.assetShared = true;
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
        templates.set(piece, centreOnBoard(node, TARGET_HEIGHT_BY_TYPE[piece.toLowerCase()]));
      }
      return templates;
    });
  }
  return loadedAsset;
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
        piece,
        color: piece === piece.toLowerCase() ? 'b' : 'w',
        type: piece.toLowerCase(),
        ...ASSET_PIECE_PROVENANCE,
      };
      return result;
    },
  };
}
