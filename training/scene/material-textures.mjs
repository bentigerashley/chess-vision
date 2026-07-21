import * as THREE from '../node_modules/three/build/three.module.js';

export const TEXTURE_SIZE = 256;

export function seededUnit(seed) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return (x, y) => {
    let value = state ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
}

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

export function canvasTexture(data, colorSpace, { repeat = 2.4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}
