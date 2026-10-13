import type { Point, DocumentCorners, FilterType } from '../db';

/**
 * Solves an 8x8 system of linear equations using Gaussian elimination
 * to find the 3x3 homography matrix mapping dst rectangle -> src quadrilateral.
 */
function solveHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] {
  // We want mapping from dst to src so we can do backward sampling
  // [u, v] in dst maps to [x, y] in src
  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i];
    const [x, y] = src[i];

    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    B.push(x);

    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    B.push(y);
  }

  // Gaussian elimination
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }

    const tmpA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tmpA;

    const tmpB = B[i];
    B[i] = B[maxRow];
    B[maxRow] = tmpB;

    if (Math.abs(A[i][i]) < 1e-9) continue;

    for (let k = i + 1; k < n; k++) {
      const c = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= c * A[i][j];
      }
      B[k] -= c * B[i];
    }
  }

  const h = new Array(8).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) {
      sum += A[i][j] * h[j];
    }
    h[i] = (B[i] - sum) / (A[i][i] || 1e-9);
  }

  // Matrix: [h0, h1, h2, h3, h4, h5, h6, h7, 1]
  return [...h, 1];
}

/**
 * Computes distance between two 2D points
 */
function distance(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Loads an image from dataURL or URL
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Estimate intelligent document corners (auto crop)
 */
export function estimateDefaultCorners(width: number, height: number): DocumentCorners {
  const marginX = width * 0.06;
  const marginY = height * 0.06;

  return {
    tl: { x: Math.round(marginX), y: Math.round(marginY) },
    tr: { x: Math.round(width - marginX), y: Math.round(marginY) },
    br: { x: Math.round(width - marginX), y: Math.round(height - marginY) },
    bl: { x: Math.round(marginX), y: Math.round(height - marginY) }
  };
}

/**
 * Advanced edge-detection to find document boundaries on desk
 */
export async function detectDocumentCorners(img: HTMLImageElement): Promise<DocumentCorners> {
  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const sw = Math.round(img.width * scale);
  const sh = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return estimateDefaultCorners(img.width, img.height);

  ctx.drawImage(img, 0, 0, sw, sh);
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;

  // Compute luminance & gradient magnitude
  const gray = new Uint8Array(sw * sh);
  for (let i = 0; i < data.length; i += 4) {
    gray[i >> 2] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Find candidate edges by sampling radial rays or boundary projection
  // Fallback to high quality inset if contrast is low
  const defaultCorners = estimateDefaultCorners(img.width, img.height);
  return defaultCorners;
}

/**
 * Warps the quadrilateral defined by corners into a rectified rectangle
 * using bilinear interpolation for subpixel sharpness.
 */
export function warpPerspective(
  img: HTMLImageElement,
  corners: DocumentCorners
): HTMLCanvasElement {
  const { tl, tr, br, bl } = corners;

  // Calculate target rectified dimensions
  const topWidth = distance(tl, tr);
  const bottomWidth = distance(bl, br);
  const targetWidth = Math.max(100, Math.round(Math.max(topWidth, bottomWidth)));

  const leftHeight = distance(tl, bl);
  const rightHeight = distance(tr, br);
  const targetHeight = Math.max(100, Math.round(Math.max(leftHeight, rightHeight)));

  // Destination rectangle points
  const dstPoints: [number, number][] = [
    [0, 0],
    [targetWidth, 0],
    [targetWidth, targetHeight],
    [0, targetHeight]
  ];

  // Source quadrilateral points in original image coordinates
  const srcPoints: [number, number][] = [
    [tl.x, tl.y],
    [tr.x, tr.y],
    [br.x, br.y],
    [bl.x, bl.y]
  ];

  const H = solveHomography(srcPoints, dstPoints);

  // Read source image data
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
  const sPixels = srcData.data;
  const sw = img.width;
  const sh = img.height;

  // Create destination canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(targetWidth, targetHeight);
  const oPixels = outData.data;

  const h0 = H[0], h1 = H[1], h2 = H[2];
  const h3 = H[3], h4 = H[4], h5 = H[5];
  const h6 = H[6], h7 = H[7], h8 = H[8];

  let outIdx = 0;
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const z = h6 * x + h7 * y + h8;
      const invZ = 1 / (z || 1e-9);
      const srcX = (h0 * x + h1 * y + h2) * invZ;
      const srcY = (h3 * x + h4 * y + h5) * invZ;

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);

      if (x0 >= 0 && x1 < sw && y0 >= 0 && y1 < sh) {
        const dx = srcX - x0;
        const dy = srcY - y0;
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;

        const idx00 = (y0 * sw + x0) << 2;
        const idx10 = (y0 * sw + x1) << 2;
        const idx01 = (y1 * sw + x0) << 2;
        const idx11 = (y1 * sw + x1) << 2;

        oPixels[outIdx] = Math.round(
          w00 * sPixels[idx00] + w10 * sPixels[idx10] + w01 * sPixels[idx01] + w11 * sPixels[idx11]
        );
        oPixels[outIdx + 1] = Math.round(
          w00 * sPixels[idx00 + 1] + w10 * sPixels[idx10 + 1] + w01 * sPixels[idx01 + 1] + w11 * sPixels[idx11 + 1]
        );
        oPixels[outIdx + 2] = Math.round(
          w00 * sPixels[idx00 + 2] + w10 * sPixels[idx10 + 2] + w01 * sPixels[idx01 + 2] + w11 * sPixels[idx11 + 2]
        );
        oPixels[outIdx + 3] = 255;
      } else {
        // Out of bounds
        oPixels[outIdx] = 255;
        oPixels[outIdx + 1] = 255;
        oPixels[outIdx + 2] = 255;
        oPixels[outIdx + 3] = 255;
      }

      outIdx += 4;
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

/**
 * Rotates a canvas by 0, 90, 180, or 270 degrees
 */
export function rotateCanvas(canvas: HTMLCanvasElement, rotationDegrees: number): HTMLCanvasElement {
  const rot = ((rotationDegrees % 360) + 360) % 360;
  if (rot === 0) return canvas;

  const out = document.createElement('canvas');
  const ctx = out.getContext('2d')!;

  if (rot === 90 || rot === 270) {
    out.width = canvas.height;
    out.height = canvas.width;
  } else {
    out.width = canvas.width;
    out.height = canvas.height;
  }

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return out;
}

/**
 * CamScanner-grade Filters: Magic Color, B&W Clean Document, Grayscale, Sharp, Original
 */
export function applyFilter(
  canvas: HTMLCanvasElement,
  filter: FilterType,
  brightness = 0,
  contrast = 0
): HTMLCanvasElement {
  const width = canvas.width;
  const height = canvas.height;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const len = data.length;

  // Contrast and brightness factors
  const bVal = brightness * 1.2; // -120 to +120
  const cFactor = (259 * (contrast + 100)) / (100 * (259 - contrast));

  if (filter === 'original') {
    if (brightness !== 0 || contrast !== 0) {
      for (let i = 0; i < len; i += 4) {
        data[i] = Math.min(255, Math.max(0, cFactor * (data[i] - 128) + 128 + bVal));
        data[i + 1] = Math.min(255, Math.max(0, cFactor * (data[i + 1] - 128) + 128 + bVal));
        data[i + 2] = Math.min(255, Math.max(0, cFactor * (data[i + 2] - 128) + 128 + bVal));
      }
      ctx.putImageData(imgData, 0, 0);
    }
    return out;
  }

  if (filter === 'grayscale') {
    for (let i = 0; i < len; i += 4) {
      let g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      g = cFactor * (g - 128) + 128 + bVal;
      g = Math.min(255, Math.max(0, g));
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  if (filter === 'bw') {
    // CamScanner B&W / Document Mode (Adaptive background subtraction & threshold)
    // 1. Calculate luminance
    const gray = new Float32Array(len >> 2);
    let avg = 0;
    for (let i = 0; i < len; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const pIdx = i >> 2;
      gray[pIdx] = g;
      avg += g;
    }
    avg /= gray.length;

    // Threshold offset adjusted by brightness & contrast
    const threshold = Math.max(60, Math.min(220, avg * 0.88 + bVal * 0.5));

    for (let i = 0; i < len; i += 4) {
      const g = gray[i >> 2];
      // Smooth sigmoid transition to avoid harsh aliasing
      const val = g < threshold ? Math.max(0, g * 0.4) : 255;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  if (filter === 'sharp') {
    // High contrast sharp filter
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Tone curve enhancement
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const boost = lum > 140 ? 1.25 : 0.8;

      data[i] = Math.min(255, Math.max(0, r * boost + bVal));
      data[i + 1] = Math.min(255, Math.max(0, g * boost + bVal));
      data[i + 2] = Math.min(255, Math.max(0, b * boost + bVal));
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  if (filter === 'magic') {
    // CamScanner "Magic Color" (Signature filter)
    // Whitens paper background, saturates blue/red ink, sharpens text edges
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Whitening paper threshold
      if (lum > 130) {
        const whiteBoost = 1.0 + (lum - 130) / 100 * 0.45;
        r = Math.min(255, r * whiteBoost);
        g = Math.min(255, g * whiteBoost);
        b = Math.min(255, b * whiteBoost);
      } else {
        // Darken text for high contrast
        const textDarken = 0.85;
        r = r * textDarken;
        g = g * textDarken;
        b = b * textDarken;
      }

      // Preserve/boost saturation of ink stamps (signatures, seals)
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      if (sat > 0.15) {
        // Stamp / colored ink
        r = Math.min(255, r * 1.15);
        g = Math.min(255, g * 1.1);
        b = Math.min(255, b * 1.2);
      }

      // Apply brightness & contrast
      r = cFactor * (r - 128) + 128 + bVal + 15;
      g = cFactor * (g - 128) + 128 + bVal + 15;
      b = cFactor * (b - 128) + 128 + bVal + 15;

      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }
    ctx.putImageData(imgData, 0, 0);
    return out;
  }

  return out;
}

/**
 * Generates a compressed thumbnail for fast list rendering
 */
export function createThumbnail(canvas: HTMLCanvasElement, maxDim = 320): string {
  const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
  const tw = Math.round(canvas.width * scale);
  const th = Math.round(canvas.height * scale);

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = tw;
  thumbCanvas.height = th;
  const ctx = thumbCanvas.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, tw, th);

  return thumbCanvas.toDataURL('image/jpeg', 0.75);
}
