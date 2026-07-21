/**
 * Browser-safe source of truth for the approved private training asset.
 * The fetcher verifies that asset-lock.json matches this contract before it
 * writes a cache entry, so browser loading, labels, and archival validation
 * cannot silently drift apart.
 */
export const LOCKED_CHESS_ASSET = Object.freeze({
  id: 'a-beautiful-game-v1',
  filename: 'a-beautiful-game.glb',
  url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb',
  sha256: 'bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007',
  license: 'CC-BY-4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  revision: 'glTF-Sample-Assets/main; checksum-pinned',
  attribution: '© 2020 ASWF, MaterialX Project (original model); © 2022 Ed Mackey (glTF conversion)',
});

export const ASSET_LABEL_PROVENANCE = Object.freeze({
  source_kind: 'gltf-asset',
  asset_id: LOCKED_CHESS_ASSET.id,
  asset_sha256: LOCKED_CHESS_ASSET.sha256,
  asset_license: LOCKED_CHESS_ASSET.license,
  asset_revision: LOCKED_CHESS_ASSET.revision,
  asset_attribution: LOCKED_CHESS_ASSET.attribution,
  fallback: false,
});

export function assertAssetMatchesContract(asset) {
  for (const [field, expected] of Object.entries(LOCKED_CHESS_ASSET)) {
    if (asset?.[field] !== expected) throw new Error(`Asset lock ${field} does not match the approved asset contract`);
  }
  return LOCKED_CHESS_ASSET;
}
