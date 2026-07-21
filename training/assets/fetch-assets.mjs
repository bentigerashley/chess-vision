#!/usr/bin/env node
/** Fetch the sole approved training mesh into its ignored, checksum-locked cache. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertAssetMatchesContract } from './asset-contract.mjs';

const ASSET_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
export const ASSET_LOCK_PATH = path.join(ASSET_DIRECTORY, 'asset-lock.json');
export const ASSET_CACHE_DIRECTORY = path.join(ASSET_DIRECTORY, 'cache');

export async function loadAssetLock(lockPath = ASSET_LOCK_PATH) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock?.schema_version !== 'chess-vision.asset-lock/v1' || !Array.isArray(lock.assets) || lock.assets.length !== 1) {
    throw new Error(`Invalid training asset lock: ${lockPath}`);
  }
  const [asset] = lock.assets;
  for (const field of ['id', 'filename', 'url', 'sha256', 'license', 'license_url', 'revision', 'attribution']) {
    if (typeof asset[field] !== 'string' || asset[field].trim().length === 0) throw new Error(`Asset lock field ${field} must be a non-empty string`);
  }
  if (!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Asset lock sha256 must be a lowercase 64-character checksum');
  if (path.basename(asset.filename) !== asset.filename) throw new Error('Asset lock filename must not contain a path');
  assertAssetMatchesContract(asset);
  return Object.freeze(asset);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function cachedAssetPath(asset) {
  return path.join(ASSET_CACHE_DIRECTORY, asset.filename);
}

export async function assertCachedAsset(asset = undefined) {
  const lockedAsset = asset ?? await loadAssetLock();
  const filename = await cachedAssetPath(lockedAsset);
  let bytes;
  try {
    bytes = await readFile(filename);
  } catch {
    throw new Error(`Approved training asset is missing: ${filename}. Run npm run fetch-assets from training/.`);
  }
  const actual = sha256(bytes);
  if (actual !== lockedAsset.sha256) throw new Error(`Training asset checksum mismatch for ${filename}: expected ${lockedAsset.sha256}, received ${actual}`);
  return { asset: lockedAsset, filename, bytes: bytes.length };
}

export async function fetchLockedAsset(asset = undefined) {
  const lockedAsset = asset ?? await loadAssetLock();
  try {
    return { ...(await assertCachedAsset(lockedAsset)), fetched: false };
  } catch (error) {
    if (!String(error.message).includes('missing') && !String(error.message).includes('checksum mismatch')) throw error;
  }
  const response = await fetch(lockedAsset.url);
  if (!response.ok) throw new Error(`Asset download failed with HTTP ${response.status}: ${lockedAsset.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== lockedAsset.sha256) throw new Error(`Downloaded asset checksum mismatch: expected ${lockedAsset.sha256}, received ${actual}`);
  await mkdir(ASSET_CACHE_DIRECTORY, { recursive: true });
  const filename = await cachedAssetPath(lockedAsset);
  const temporary = `${filename}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, filename);
  return { asset: lockedAsset, filename, bytes: bytes.length, fetched: true };
}

async function main() {
  const result = await fetchLockedAsset();
  process.stdout.write(`${result.fetched ? 'fetched' : 'verified'} ${result.asset.id} (${result.bytes} bytes)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (error) => {
    try { await rm(path.join(ASSET_CACHE_DIRECTORY, 'a-beautiful-game.glb.partial'), { force: true }); } catch { /* best-effort cleanup */ }
    process.stderr.write(`asset fetch failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
