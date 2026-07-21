import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSET_LABEL_PROVENANCE, LOCKED_CHESS_ASSET } from '../assets/asset-contract.mjs';
import { loadAssetLock, sha256 } from '../assets/fetch-assets.mjs';
import { ASSET_PIECE_PROVENANCE, FEN_ASSET_NODE_NAMES } from '../scene/gltf-piece-factory.mjs';

test('the approved chess GLB is locked to an attributable checksum', async () => {
  const asset = await loadAssetLock();
  assert.deepEqual(asset, LOCKED_CHESS_ASSET);
  assert.equal(asset.id, ASSET_PIECE_PROVENANCE.asset_id);
  assert.equal(asset.sha256, ASSET_PIECE_PROVENANCE.asset_sha256);
  assert.equal(asset.license, ASSET_PIECE_PROVENANCE.asset_license);
  assert.equal(asset.filename, LOCKED_CHESS_ASSET.filename);
  assert.equal(asset.revision, ASSET_PIECE_PROVENANCE.asset_revision);
  assert.equal(asset.attribution, ASSET_PIECE_PROVENANCE.asset_attribution);
  assert.deepEqual(ASSET_PIECE_PROVENANCE, ASSET_LABEL_PROVENANCE);
  assert.equal(sha256(Buffer.from('chess-vision')), '4ce41aed1c71096182fc67cbdee13f99307627af575c99a0174e85dbda5701b7');
});

test('every FEN class maps to a named node in the locked chess asset', () => {
  const pieces = 'KQRBNPkqrbnp'.split('');
  assert.deepEqual(Object.keys(FEN_ASSET_NODE_NAMES).sort(), pieces.sort());
  assert.equal(new Set(Object.values(FEN_ASSET_NODE_NAMES)).size, 12);
  assert.equal(FEN_ASSET_NODE_NAMES.N, 'Knight_W1');
  assert.equal(FEN_ASSET_NODE_NAMES.n, 'Knight_B1');
});
