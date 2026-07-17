#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { CHESS_SET_FAMILIES } from '../scene/piece-factories.mjs';
import { hashSeed } from '../scene/random.mjs';
import { startStaticServer } from './static-server.mjs';

const TRAINING_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG_PREFIX = 'data:image/png;base64,';

function option(argumentsList, name, fallback) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : fallback;
}

function required(value, name) {
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

export function parseArguments(argumentsList) {
  const manifest = required(option(argumentsList, '--manifest', 'output/puzzle-sources.json'), '--manifest');
  const output = required(option(argumentsList, '--output', 'output/rendered-v1'), '--output');
  const variants = Number(option(argumentsList, '--variants', '5'));
  const width = Number(option(argumentsList, '--width', '1024'));
  const height = Number(option(argumentsList, '--height', '1024'));
  if (!Number.isInteger(variants) || variants < 1 || variants > CHESS_SET_FAMILIES.length) throw new Error(`--variants must be 1–${CHESS_SET_FAMILIES.length}`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320) throw new Error('Image dimensions must be integers of at least 320');
  return { manifest: path.resolve(manifest), output: path.resolve(output), variants, width, height };
}

export function createJobs(sourceManifest, options) {
  if (sourceManifest?.schema_version !== 'chess-vision.puzzle-source/v1') throw new Error('Expected a chess-vision.puzzle-source/v1 source manifest');
  if (!Array.isArray(sourceManifest.positions) || sourceManifest.positions.length === 0) throw new Error('Source manifest has no positions');
  const seenFens = new Set();
  const jobs = [];
  for (const [positionIndex, position] of sourceManifest.positions.entries()) {
    if (typeof position.rendered_fen !== 'string') throw new Error(`Position ${positionIndex} has no rendered_fen`);
    if (seenFens.has(position.rendered_fen)) throw new Error(`Duplicate rendered FEN in source manifest: ${position.rendered_fen}`);
    seenFens.add(position.rendered_fen);
    for (let variant = 0; variant < options.variants; variant += 1) {
      const style = CHESS_SET_FAMILIES[variant % CHESS_SET_FAMILIES.length];
      const artifactId = `${String(positionIndex + 1).padStart(4, '0')}-${style}`;
      jobs.push({
        artifactId,
        fen: position.rendered_fen,
        source: {
          puzzle_id: position.puzzle_id,
          source_fen: position.source_fen,
          first_uci: position.first_uci,
          moves: position.moves,
          themes: position.themes,
          source_version: sourceManifest.source?.version ?? null,
          config_version: sourceManifest.schema_version,
        },
      style,
        seed: hashSeed(`${position.puzzle_id}:${style}:${variant}`),
        width: options.width,
        height: options.height,
        rgbPath: `images/${artifactId}.png`,
        maskPath: `instance-masks/${artifactId}.png`,
        labelPath: `labels/${artifactId}.json`,
      });
    }
  }
  return jobs;
}

async function firstExisting(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch { /* try the next installed browser */ }
  }
  return null;
}

export async function resolveBrowserExecutable() {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA;
  const executable = await firstExisting([
    process.env.CHESS_VISION_BROWSER,
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]);
  if (!executable) throw new Error('No Chrome or Edge executable found. Set CHESS_VISION_BROWSER to a local browser executable.');
  return executable;
}

function decodePng(base64) {
  if (typeof base64 !== 'string' || !base64.length) throw new Error('Renderer returned an empty PNG');
  return Buffer.from(base64.startsWith(PNG_PREFIX) ? base64.slice(PNG_PREFIX.length) : base64, 'base64');
}

async function writeArtifact(output, job, result) {
  await Promise.all([
    writeFile(path.join(output, job.rgbPath), decodePng(result.rgbBase64)),
    writeFile(path.join(output, job.maskPath), decodePng(result.maskBase64)),
    writeFile(path.join(output, job.labelPath), `${JSON.stringify(result.label, null, 2)}\n`, 'utf8'),
  ]);
}

export async function renderManifest(options) {
  const sourceManifest = JSON.parse(await readFile(options.manifest, 'utf8'));
  const jobs = createJobs(sourceManifest, options);
  await Promise.all([
    mkdir(path.join(options.output, 'images'), { recursive: true }),
    mkdir(path.join(options.output, 'instance-masks'), { recursive: true }),
    mkdir(path.join(options.output, 'labels'), { recursive: true }),
  ]);
  const executablePath = await resolveBrowserExecutable();
  const server = await startStaticServer(TRAINING_ROOT);
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      // Do not disable the GPU. The page independently rejects non-WebGL2
      // contexts, and records the actual browser/renderer identity it receives.
      args: ['--enable-webgl', '--use-gl=angle'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 });
    await page.goto(server.url, { waitUntil: 'networkidle0' });
    const outputs = [];
    for (const job of jobs) {
      const result = await page.evaluate(async (renderJob) => window.renderChessDatasetJob(renderJob), job);
      await writeArtifact(options.output, job, result);
      outputs.push({ id: job.artifactId, rgb_path: job.rgbPath, instance_mask_path: job.maskPath, label_path: job.labelPath, fen: job.fen, style: job.style, renderer: result.renderer });
      process.stdout.write(`rendered ${job.artifactId}\n`);
    }
    await writeFile(path.join(options.output, 'manifest.json'), `${JSON.stringify({
      schema_version: 'chess-vision.render-manifest/v1',
      source_manifest: path.basename(options.manifest),
      expected_positions: sourceManifest.selection?.accepted_count ?? sourceManifest.positions.length,
      variants_per_position: options.variants,
      artifact_count: outputs.length,
      artifacts: outputs,
    }, null, 2)}\n`, 'utf8');
    return outputs;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function main() {
  try {
    const outputs = await renderManifest(parseArguments(process.argv.slice(2)));
    process.stdout.write(`wrote ${outputs.length} rendered training artifacts\n`);
  } catch (error) {
    process.stderr.write(`dataset render failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
