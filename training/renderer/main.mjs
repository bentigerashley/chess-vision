import * as THREE from '../node_modules/three/build/three.module.js';
import { buildChessScene, projectBoardCorners, validateBoardInFrame } from '../scene/board-scene.mjs';
import { boxesFromMask, buildLabel, idToRgb } from '../scene/labels.mjs';

const canvas = document.querySelector('#dataset-canvas');

function dataUrlToBase64(dataUrl) {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error('Canvas did not return a PNG data URL');
  return dataUrl.slice(separator + 1);
}

function browserIdentity(renderer) {
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext) || !renderer.capabilities.isWebGL2) {
    throw new Error('WebGL2 preflight failed: this renderer requires real WebGL2 readback support');
  }
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl_version: gl.getParameter(gl.VERSION),
    gl_renderer: gl.getParameter(gl.RENDERER),
    unmasked_renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    unmasked_vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    three_revision: THREE.REVISION,
    webgl2: true,
  };
}

function createRenderer(width, height) {
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function toMaskPng(pixels, width, height) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const context = maskCanvas.getContext('2d', { willReadFrequently: false });
  const imageData = context.createImageData(width, height);
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    const targetY = height - 1 - sourceY;
    const sourceStart = sourceY * width * 4;
    const targetStart = targetY * width * 4;
    imageData.data.set(pixels.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
  context.putImageData(imageData, 0, 0);
  return dataUrlToBase64(maskCanvas.toDataURL('image/png'));
}

function renderInstanceMask({ renderer, scene, camera, pieces, width, height }) {
  const previousBackground = scene.background;
  const previousToneMapping = renderer.toneMapping;
  const previousOutputColorSpace = renderer.outputColorSpace;
  const replacements = [];
  const visibility = [];
  const idMaterials = new Map();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    visibility.push([object, object.visible]);
    object.visible = false;
  });
  for (const piece of pieces) {
    const [red, green, blue] = idToRgb(piece.instanceId);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(red / 255, green / 255, blue / 255),
      toneMapped: false,
      fog: false,
    });
    idMaterials.set(piece.instanceId, material);
    piece.root.traverse((object) => {
      if (!object.isMesh) return;
      replacements.push([object, object.material]);
      object.visible = true;
      object.material = material;
    });
  }
  const target = new THREE.WebGLRenderTarget(width, height, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
  target.texture.colorSpace = THREE.NoColorSpace;
  const pixels = new Uint8Array(width * height * 4);
  try {
    scene.background = new THREE.Color(0x000000);
    renderer.toneMapping = THREE.NoToneMapping;
    // WebGLRenderer expects an output color-space configuration. Linear sRGB
    // preserves the byte-coded instance IDs without applying display sRGB.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(null);
    scene.background = previousBackground;
    renderer.toneMapping = previousToneMapping;
    renderer.outputColorSpace = previousOutputColorSpace;
    for (const [object, material] of replacements) object.material = material;
    for (const [object, visible] of visibility) object.visible = visible;
    for (const material of idMaterials.values()) material.dispose();
    target.dispose();
  }
  return { pixels, pngBase64: toMaskPng(pixels, width, height) };
}

function validateJob(job) {
  if (!job || typeof job.fen !== 'string' || !job.fen.includes('/')) throw new Error('A complete FEN is required');
  if (!Number.isInteger(job.width) || !Number.isInteger(job.height) || job.width < 320 || job.height < 320) throw new Error('Image width and height must be integers of at least 320 pixels');
  if (!Number.isInteger(job.seed)) throw new Error('Renderer job requires an integer seed');
}

function disposeSceneResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

/** Called from Puppeteer only; it never becomes part of the PWA bundle. */
export async function renderDatasetJob(job) {
  validateJob(job);
  const renderer = createRenderer(job.width, job.height);
  let sceneData;
  try {
    const identity = browserIdentity(renderer);
    sceneData = buildChessScene(job);
    if (!validateBoardInFrame(sceneData.camera, job.width, job.height, sceneData.cameraMetadata.board_margin_px)) {
      throw new Error('Frame rejected: the full physical outer board frame is not inside the safe output margin');
    }
    renderer.render(sceneData.scene, sceneData.camera);
    const rgbBase64 = dataUrlToBase64(canvas.toDataURL('image/png'));
    const projectedBoardCorners = projectBoardCorners(sceneData.camera, job.width, job.height);
    const mask = renderInstanceMask({ renderer, ...sceneData, width: job.width, height: job.height });
    const maskBoxes = boxesFromMask({
      pixels: mask.pixels,
      width: job.width,
      height: job.height,
      instanceIds: sceneData.pieces.map(({ instanceId }) => instanceId),
    });
    const pieces = sceneData.pieces.map((piece) => ({ ...piece, mask: maskBoxes.get(piece.instanceId) }));
    const label = buildLabel({
      fen: job.fen,
      artifact: { id: job.artifactId, rgb_path: job.rgbPath, instance_mask_path: job.maskPath },
      source: job.source,
      style: { family: job.style, seed: job.seed, model_version: 'procedural-piece-families/v1' },
      seed: job.seed,
      width: job.width,
      height: job.height,
      squares: sceneData.squares,
      pieces,
      camera: { ...sceneData.cameraMetadata, frame_accepted: true, projected_board_corners: projectedBoardCorners },
      lighting: sceneData.lighting,
      renderer: identity,
    });
    return { rgbBase64, maskBase64: mask.pngBase64, label, renderer: identity };
  } finally {
    if (sceneData) disposeSceneResources(sceneData.scene);
    // Each job owns a renderer; dispose its resources before returning to Puppeteer.
    renderer.dispose();
  }
}

window.renderChessDatasetJob = renderDatasetJob;
