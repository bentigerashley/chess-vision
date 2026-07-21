#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { assertCachedAsset } from '../assets/fetch-assets.mjs';
import { FEN_ASSET_NODE_NAMES, FIDE_GEOMETRY_PROFILE } from '../scene/gltf-piece-factory.mjs';
import { resolveBrowserExecutable } from './run-render.mjs';
import { startStaticServer } from './static-server.mjs';

const TRAINING_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function assertFideAssetProfile(profile) {
  const expectedPieces = Object.keys(FEN_ASSET_NODE_NAMES).sort();
  if (!profile || typeof profile !== 'object') throw new Error('Asset profile must be an object');
  if (JSON.stringify(Object.keys(profile).sort()) !== JSON.stringify(expectedPieces)) throw new Error('Asset profile must include every locked FEN node');
  for (const piece of expectedPieces) {
    const measurement = profile[piece];
    const type = piece.toLowerCase();
    const expectedHeight = FIDE_GEOMETRY_PROFILE.height_by_type[type];
    if (!measurement || measurement.node_name !== FEN_ASSET_NODE_NAMES[piece]) throw new Error(`Asset profile node mismatch for ${piece}`);
    if (Math.abs(measurement.height - expectedHeight) > 0.00001) throw new Error(`Asset profile height mismatch for ${piece}`);
    if (!Number.isFinite(measurement.base_diameter) || measurement.base_diameter <= 0 || measurement.base_diameter > FIDE_GEOMETRY_PROFILE.square_size_world) throw new Error(`Asset profile base is invalid for ${piece}`);
    if (measurement.base_ratio < FIDE_GEOMETRY_PROFILE.base_diameter_ratio.min || measurement.base_ratio > FIDE_GEOMETRY_PROFILE.base_diameter_ratio.max) throw new Error(`Asset profile base ratio is outside FIDE range for ${piece}`);
  }
  return profile;
}

export async function inspectCachedAssetProfile() {
  await assertCachedAsset();
  const [executablePath, server] = await Promise.all([resolveBrowserExecutable(), startStaticServer(TRAINING_ROOT)]);
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: ['--enable-webgl', '--use-gl=angle'] });
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => typeof window.inspectChessAssetProfile === 'function', { timeout: 10_000 });
    return assertFideAssetProfile(await page.evaluate(() => window.inspectChessAssetProfile()));
  } finally {
    await browser?.close();
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  inspectCachedAssetProfile().then((profile) => {
    process.stdout.write(`verified FIDE profile for ${Object.keys(profile).length} locked FEN meshes\n`);
  }).catch((error) => {
    process.stderr.write(`asset profile preflight failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
