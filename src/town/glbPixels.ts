import type * as THREE from 'three';
import type { Sampler } from './glbFigure';

/** Reads colours from a loaded picture. It needs a browser canvas, so the Playwright suite covers it. */
export function samplerOf(texture: THREE.Texture | null): Sampler | undefined {
  const image = texture?.image as CanvasImageSource & { width: number; height: number } | undefined;
  if (!image) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return (u, v) => {
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(u * canvas.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(v * canvas.height)));
    const i = (y * canvas.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
}
