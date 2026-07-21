#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { rgbToId } from '../scene/labels.mjs';

export const DARK_PIECE_READABILITY = Object.freeze({
  minimum_visible_pixels: 100,
  // In a physically lit PBR render, a dark satin piece can remain legibly
  // black at roughly 4.5% linear light; exterior contrast is enforced too.
  minimum_p95_linear_luminance: 0.045,
  minimum_exterior_luminance_difference: 0.06,
});

function isPngData(value) {
  return Number.isInteger(value?.width) && Number.isInteger(value?.height) && value.width > 0 && value.height > 0 && value.data?.length === value.width * value.height * 4;
}

function srgbToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(data, offset) {
  return 0.2126 * srgbToLinear(data[offset])
    + 0.7152 * srgbToLinear(data[offset + 1])
    + 0.0722 * srgbToLinear(data[offset + 2]);
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * percentileValue))];
}

function instanceIdAt(png, pixelIndex) {
  const offset = pixelIndex * 4;
  return rgbToId(png.data[offset], png.data[offset + 1], png.data[offset + 2]);
}

function darkFenPiece(piece) {
  return typeof piece?.fen_piece === 'string' && /^[prnbqk]$/.test(piece.fen_piece);
}

/** Measure dark pieces against their true instance mask rather than a heuristic crop. */
export function assessDarkPieceReadability({ rgb, mask, label, thresholds = DARK_PIECE_READABILITY }) {
  if (!isPngData(rgb) || !isPngData(mask)) throw new Error('RGB and instance-mask PNGs are required');
  if (rgb.width !== mask.width || rgb.height !== mask.height) throw new Error('RGB and instance-mask dimensions must match');
  if (!Array.isArray(label?.pieces)) throw new Error('Label pieces are required');
  const width = rgb.width;
  const height = rgb.height;
  const metricsById = new Map(label.pieces.filter(darkFenPiece).map((piece) => [piece.instance_id, { piece, luma: [], maxExteriorLuminanceDifference: 0 }]));
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const metric = metricsById.get(instanceIdAt(mask, pixel));
    if (!metric) continue;
    const pixelLuma = luminance(rgb.data, pixel * 4);
    metric.luma.push(pixelLuma);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (neighborX < 0 || neighborX >= width || neighborY < 0 || neighborY >= height) continue;
      const neighbor = neighborY * width + neighborX;
      if (instanceIdAt(mask, neighbor) === metric.piece.instance_id) continue;
      metric.maxExteriorLuminanceDifference = Math.max(metric.maxExteriorLuminanceDifference, Math.abs(pixelLuma - luminance(rgb.data, neighbor * 4)));
    }
  }
  const results = [];
  for (const { piece, luma, maxExteriorLuminanceDifference } of metricsById.values()) {
    if (luma.length < thresholds.minimum_visible_pixels) continue;
    results.push({
      instance_id: piece.instance_id,
      square: piece.square,
      visible_pixels: luma.length,
      p95_linear_luminance: percentile(luma, 0.95),
      max_exterior_luminance_difference: maxExteriorLuminanceDifference,
    });
  }
  return results;
}

export function validateDarkPieceReadability({ thresholds = DARK_PIECE_READABILITY, ...input }) {
  const metrics = assessDarkPieceReadability({ ...input, thresholds });
  const errors = [];
  for (const metric of metrics) {
    if (metric.p95_linear_luminance < thresholds.minimum_p95_linear_luminance) {
      errors.push(`${metric.square} p95 linear luminance ${metric.p95_linear_luminance.toFixed(4)} is below ${thresholds.minimum_p95_linear_luminance}`);
    }
    if (metric.max_exterior_luminance_difference < thresholds.minimum_exterior_luminance_difference) {
      errors.push(`${metric.square} exterior contrast ${metric.max_exterior_luminance_difference.toFixed(4)} is below ${thresholds.minimum_exterior_luminance_difference}`);
    }
  }
  if (errors.length) throw new Error(`Dark-piece readability validation failed:\n- ${errors.join('\n- ')}`);
  return metrics;
}

async function pngAt(filePath) {
  return PNG.sync.read(await readFile(filePath));
}

export async function validateRenderQuality({ renderManifestPath, outputRoot }) {
  const manifest = JSON.parse(await readFile(renderManifestPath, 'utf8'));
  if (!Array.isArray(manifest.artifacts)) throw new Error('Render manifest has no artifacts');
  const allMetrics = [];
  for (const artifact of manifest.artifacts) {
    const labelPath = path.join(outputRoot, artifact.label_path);
    const label = JSON.parse(await readFile(labelPath, 'utf8'));
    let metrics;
    try {
      metrics = validateDarkPieceReadability({
        rgb: await pngAt(path.join(outputRoot, artifact.rgb_path)),
        mask: await pngAt(path.join(outputRoot, artifact.instance_mask_path)),
        label,
      });
    } catch (error) {
      throw new Error(`${artifact.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    allMetrics.push({ artifact_id: artifact.id, dark_pieces: metrics });
  }
  return allMetrics;
}

function argument(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

async function main() {
  const render = argument(process.argv.slice(2), '--render');
  const output = argument(process.argv.slice(2), '--output');
  if (!render || !output) throw new Error('Usage: node renderer/render-quality.mjs --render <manifest.json> --output <dataset directory>');
  const metrics = await validateRenderQuality({ renderManifestPath: path.resolve(render), outputRoot: path.resolve(output) });
  process.stdout.write(`verified dark-piece readability for ${metrics.length} rendered artifacts\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`render quality validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
