import type { Point, DocumentCorners, FilterType } from '../db';

export interface DetectionResult {
  corners: DocumentCorners;
  confidence: number; // 0..1
  detected: boolean;
}

/**
 * Solves an 8x8 system of linear equations using Gaussian elimination
 * to find the 3x3 homography matrix mapping dst rectangle -> src quadrilateral.
 */
function solveHomography(
  src: [number, number][],
  dst: [number, number][]
): number[] {
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
 * Default fallback corners (clean inset)
 */
export function estimateDefaultCorners(width: number, height: number): DocumentCorners {
  const marginX = width * 0.05;
  const marginY = height * 0.05;

  return {
    tl: { x: Math.round(marginX), y: Math.round(marginY) },
    tr: { x: Math.round(width - marginX), y: Math.round(marginY) },
    br: { x: Math.round(width - marginX), y: Math.round(height - marginY) },
    bl: { x: Math.round(marginX), y: Math.round(height - marginY) }
  };
}

/**
 * Cross product of OA and OB vectors (2D)
 */
function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Monotone Chain Convex Hull algorithm
 */
function computeConvexHull(points: Point[]): Point[] {
  if (points.length <= 3) return points.slice();
  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Orders 4 arbitrary corner points into strict { tl, tr, br, bl } order
 */
export function orderCorners(pts: Point[]): DocumentCorners {
  // Sort by y first, or use sum/diff
  // Center of the 4 points
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;

  // Sort clockwise by angle around centroid
  const sorted = pts.slice().sort((a, b) => {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });

  // Find top-left (smallest x + y)
  let tlIdx = 0;
  let minSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const sum = sorted[i].x + sorted[i].y;
    if (sum < minSum) {
      minSum = sum;
      tlIdx = i;
    }
  }

  const tl = sorted[tlIdx];
  const tr = sorted[(tlIdx + 1) % 4];
  const br = sorted[(tlIdx + 2) % 4];
  const bl = sorted[(tlIdx + 3) % 4];

  return { tl, tr, br, bl };
}

/**
 * Computes area of a quadrilateral
 */
function quadArea(c: DocumentCorners): number {
  const { tl, tr, br, bl } = c;
  return (
    0.5 *
    Math.abs(
      tl.x * tr.y -
        tr.x * tl.y +
        tr.x * br.y -
        br.x * tr.y +
        br.x * bl.y -
        bl.x * br.y +
        bl.x * tl.y -
        tl.x * bl.y
    )
  );
}

/**
 * Fits the best 4 corners to a convex hull of document boundary points
 */
function findQuadFromHull(hull: Point[], sw: number, sh: number, gradMag: Float32Array): DocumentCorners {
  if (hull.length < 4) {
    return estimateDefaultCorners(sw, sh);
  }

  // Method 1: Extremal corner scoring in rotated coordinate frames
  // We test multiple angle orientations to handle tilted/rotated sheets on desk
  let bestCorners: Point[] = [];
  let bestScore = -Infinity;

  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;

  const angles = [-0.45, -0.3, -0.15, -0.05, 0, 0.05, 0.15, 0.3, 0.45];

  for (const theta of angles) {
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    let pTL = hull[0],
      pTR = hull[0],
      pBR = hull[0],
      pBL = hull[0];
    let minSum = Infinity,
      maxSum = -Infinity,
      minDiff = Infinity,
      maxDiff = -Infinity;

    for (const p of hull) {
      const rx = (p.x - cx) * cosT - (p.y - cy) * sinT;
      const ry = (p.x - cx) * sinT + (p.y - cy) * cosT;

      const sum = rx + ry;
      const diff = rx - ry;

      if (sum < minSum) {
        minSum = sum;
        pTL = p;
      }
      if (sum > maxSum) {
        maxSum = sum;
        pBR = p;
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        pTR = p;
      }
      if (diff < minDiff) {
        minDiff = diff;
        pBL = p;
      }
    }

    const candidate = orderCorners([pTL, pTR, pBR, pBL]);
    const area = quadArea(candidate);

    // Score edge support along the 4 segments in gradMag
    const edges: [Point, Point][] = [
      [candidate.tl, candidate.tr],
      [candidate.tr, candidate.br],
      [candidate.br, candidate.bl],
      [candidate.bl, candidate.tl]
    ];

    let edgeEnergy = 0;
    for (const [a, b] of edges) {
      const steps = 24;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const px = Math.round(a.x + (b.x - a.x) * t);
        const py = Math.round(a.y + (b.y - a.y) * t);
        if (px >= 1 && px < sw - 1 && py >= 1 && py < sh - 1) {
          // Max gradient in 3x3 neighborhood of the line
          let localMax = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const g = gradMag[(py + dy) * sw + (px + dx)];
              if (g > localMax) localMax = g;
            }
          }
          edgeEnergy += localMax;
        }
      }
    }

    const totalScore = area + edgeEnergy * 12;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestCorners = [candidate.tl, candidate.tr, candidate.br, candidate.bl];
    }
  }

  return orderCorners(bestCorners);
}

/**
 * Synchronous Computer-Vision Document Boundary Detector
 * Works on HTMLImageElement, HTMLVideoElement, or HTMLCanvasElement.
 * Combines:
 * 1. Background vs Paper color/luminance segmentation + Otsu thresholding
 * 2. Morphological closing + Largest Connected Component analysis
 * 3. Sobel Edge Gradient radial ray-casting fallback for white-on-white surfaces
 * 4. Multi-angle Convex Hull quadrilateral fitting with edge gradient scoring
 */
export function detectDocumentCornersSync(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  origWidth?: number,
  origHeight?: number
): DetectionResult {
  const fullW =
    origWidth ||
    (source instanceof HTMLVideoElement
      ? source.videoWidth
      : source.width) ||
    1000;
  const fullH =
    origHeight ||
    (source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.height) ||
    1000;

  const maxDim = 260;
  const scale = Math.min(1, maxDim / Math.max(fullW, fullH));
  const sw = Math.max(60, Math.round(fullW * scale));
  const sh = Math.max(60, Math.round(fullH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      corners: estimateDefaultCorners(fullW, fullH),
      confidence: 0,
      detected: false
    };
  }

  ctx.drawImage(source, 0, 0, sw, sh);
  const imgData = ctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;
  const numPixels = sw * sh;

  // 1. Compute luminance, saturation, and border vs center color statistics
  const lum = new Float32Array(numPixels);
  const paperScore = new Uint8Array(numPixels);

  // Sample border ring (outer 4% of image) to learn the desk/table color
  let borderR = 0,
    borderG = 0,
    borderB = 0,
    borderCount = 0;
  const borderPadX = Math.max(2, Math.round(sw * 0.04));
  const borderPadY = Math.max(2, Math.round(sh * 0.04));

  for (let y = 0; y < sh; y++) {
    const isBorderY = y < borderPadY || y >= sh - borderPadY;
    for (let x = 0; x < sw; x++) {
      const isBorderX = x < borderPadX || x >= sw - borderPadX;
      if (isBorderX || isBorderY) {
        const idx = (y * sw + x) << 2;
        borderR += data[idx];
        borderG += data[idx + 1];
        borderB += data[idx + 2];
        borderCount++;
      }
    }
  }

  borderR /= Math.max(1, borderCount);
  borderG /= Math.max(1, borderCount);
  borderB /= Math.max(1, borderCount);

  // Sample center box (inner 35% of image) where the document usually sits
  let centerLumSum = 0,
    centerCount = 0;
  const cX0 = Math.round(sw * 0.32),
    cX1 = Math.round(sw * 0.68);
  const cY0 = Math.round(sh * 0.32),
    cY1 = Math.round(sh * 0.68);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const p = y * sw + x;
      const idx = p << 2;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[p] = l;

      if (x >= cX0 && x <= cX1 && y >= cY0 && y <= cY1) {
        centerLumSum += l;
        centerCount++;
      }

      // Color distance from table/desk border
      const distDesk = Math.hypot(r - borderR, g - borderG, b - borderB);

      // Paper typically has high brightness and low saturation
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 10 ? (maxC - minC) / maxC : 0;

      // Combine brightness, low saturation, and difference from desk border
      const score = l * (1 - sat * 0.45) + distDesk * 0.55;
      paperScore[p] = Math.min(255, Math.max(0, Math.round(score)));
    }
  }

  const centerLumAvg = centerLumSum / Math.max(1, centerCount);

  // 2. Smooth luminance with 3x3 Gaussian filter & compute Sobel Gradient Magnitude
  const blurred = new Float32Array(numPixels);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const p = y * sw + x;
      blurred[p] =
        (lum[p - sw - 1] +
          2 * lum[p - sw] +
          lum[p - sw + 1] +
          2 * lum[p - 1] +
          4 * lum[p] +
          2 * lum[p + 1] +
          lum[p + sw - 1] +
          2 * lum[p + sw] +
          lum[p + sw + 1]) /
        16;
    }
  }

  const gradMag = new Float32Array(numPixels);
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const p = y * sw + x;
      const gx =
        -blurred[p - sw - 1] +
        blurred[p - sw + 1] -
        2 * blurred[p - 1] +
        2 * blurred[p + 1] -
        blurred[p + sw - 1] +
        blurred[p + sw + 1];
      const gy =
        -blurred[p - sw - 1] -
        2 * blurred[p - sw] -
        blurred[p - sw + 1] +
        blurred[p + sw - 1] +
        2 * blurred[p + sw] +
        blurred[p + sw + 1];
      gradMag[p] = Math.hypot(gx, gy);
    }
  }

  // 3. Otsu Thresholding on paperScore
  const hist = new Int32Array(256);
  for (let i = 0; i < numPixels; i++) {
    hist[paperScore[i]]++;
  }

  let totalSum = 0;
  for (let i = 0; i < 256; i++) totalSum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let otsuThresh = 140;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = numPixels - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (totalSum - sumB) / wF;
    const betweenVar = wB * wF * (mB - mF) * (mB - mF);
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      otsuThresh = t;
    }
  }

  // Clamp threshold reasonably relative to center brightness
  const finalThresh = Math.max(95, Math.min(225, otsuThresh));

  // Create binary mask (with 2px border zeroed out so page blob doesn't merge with frame edge)
  const mask = new Uint8Array(numPixels);
  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const p = y * sw + x;
      if (paperScore[p] >= finalThresh && lum[p] >= centerLumAvg * 0.62) {
        mask[p] = 1;
      }
    }
  }

  // 4. Morphological Closing (Dilation followed by Erosion) to fill text holes inside the page
  const dilated = new Uint8Array(numPixels);
  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const p = y * sw + x;
      if (
        mask[p] ||
        mask[p - 1] ||
        mask[p + 1] ||
        mask[p - sw] ||
        mask[p + sw] ||
        mask[p - sw - 1] ||
        mask[p - sw + 1] ||
        mask[p + sw - 1] ||
        mask[p + sw + 1]
      ) {
        dilated[p] = 1;
      }
    }
  }

  const closed = new Uint8Array(numPixels);
  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const p = y * sw + x;
      if (
        dilated[p] &&
        dilated[p - 1] &&
        dilated[p + 1] &&
        dilated[p - sw] &&
        dilated[p + sw]
      ) {
        closed[p] = 1;
      }
    }
  }

  // 5. Connected Component Labeling (BFS) to isolate the main paper sheet
  const labels = new Int32Array(numPixels);
  let currentLabel = 0;
  let bestLabel = 0;
  let bestBlobScore = 0;
  const queue = new Int32Array(numPixels);

  const imgCenterX = sw / 2;
  const imgCenterY = sh / 2;

  for (let y = 2; y < sh - 2; y++) {
    for (let x = 2; x < sw - 2; x++) {
      const startP = y * sw + x;
      if (closed[startP] === 1 && labels[startP] === 0) {
        currentLabel++;
        let head = 0;
        let tail = 0;
        queue[tail++] = startP;
        labels[startP] = currentLabel;

        let sumX = 0;
        let sumY = 0;

        while (head < tail) {
          const p = queue[head++];
          const py = Math.floor(p / sw);
          const px = p - py * sw;
          sumX += px;
          sumY += py;

          const neighbors = [p - 1, p + 1, p - sw, p + sw];
          for (const np of neighbors) {
            if (np >= 0 && np < numPixels && closed[np] === 1 && labels[np] === 0) {
              labels[np] = currentLabel;
              queue[tail++] = np;
            }
          }
        }

        const count = tail;
        // Favor large blobs near the center of the camera frame
        const blobCx = sumX / count;
        const blobCy = sumY / count;
        const distFromCenter = Math.hypot(
          (blobCx - imgCenterX) / sw,
          (blobCy - imgCenterY) / sh
        );
        const centralityWeight = Math.max(0.2, 1.2 - distFromCenter * 1.8);
        const blobScore = count * centralityWeight;

        if (blobScore > bestBlobScore) {
          bestBlobScore = blobScore;
          bestLabel = currentLabel;
        }
      }
    }
  }

  // Collect boundary points of the winning paper component
  const boundaryPoints: Point[] = [];
  let blobPixelCount = 0;

  if (bestLabel > 0) {
    for (let y = 2; y < sh - 2; y++) {
      for (let x = 2; x < sw - 2; x++) {
        const p = y * sw + x;
        if (labels[p] === bestLabel) {
          blobPixelCount++;
          // Check if it's a boundary pixel
          if (
            labels[p - 1] !== bestLabel ||
            labels[p + 1] !== bestLabel ||
            labels[p - sw] !== bestLabel ||
            labels[p + sw] !== bestLabel
          ) {
            boundaryPoints.push({ x, y });
          }
        }
      }
    }
  }

  const areaRatio = blobPixelCount / numPixels;

  // 6. If the paper blob covers a reasonable portion of the frame (8% to 92%), fit quad from hull
  // Otherwise (e.g. white paper on a white table), use radial Sobel edge ray-casting from center!
  let candidatePoints = boundaryPoints;

  if (areaRatio < 0.08 || areaRatio > 0.91 || boundaryPoints.length < 20) {
    const rayPoints: Point[] = [];
    const numRays = 72;
    const minRadius = Math.min(sw, sh) * 0.15;
    const maxRadius = Math.hypot(sw, sh) * 0.48;

    for (let i = 0; i < numRays; i++) {
      const angle = (i * 2 * Math.PI) / numRays;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      let strongestGrad = 28; // minimum edge threshold
      let bestPoint: Point | null = null;

      // Cast from outer towards inner to find the outer boundary of the document
      for (let r = maxRadius; r >= minRadius; r -= 1.5) {
        const rx = Math.round(imgCenterX + dx * r);
        const ry = Math.round(imgCenterY + dy * r);
        if (rx <= 3 || rx >= sw - 4 || ry <= 3 || ry >= sh - 4) continue;

        const g = gradMag[ry * sw + rx];
        if (g > strongestGrad) {
          strongestGrad = g;
          bestPoint = { x: rx, y: ry };
        }
      }

      if (bestPoint) {
        rayPoints.push(bestPoint);
      }
    }

    if (rayPoints.length >= 12) {
      candidatePoints = rayPoints;
    }
  }

  if (candidatePoints.length < 4) {
    return {
      corners: estimateDefaultCorners(fullW, fullH),
      confidence: 0.2,
      detected: false
    };
  }

  const hull = computeConvexHull(candidatePoints);
  const smallQuad = findQuadFromHull(hull, sw, sh, gradMag);

  // Validate quadrilateral geometry
  const qArea = quadArea(smallQuad) / numPixels;
  const topW = distance(smallQuad.tl, smallQuad.tr);
  const botW = distance(smallQuad.bl, smallQuad.br);
  const leftH = distance(smallQuad.tl, smallQuad.bl);
  const rightH = distance(smallQuad.tr, smallQuad.br);

  const minSide = Math.min(topW, botW, leftH, rightH);
  const isValidQuad =
    qArea >= 0.08 &&
    qArea <= 0.95 &&
    minSide >= Math.min(sw, sh) * 0.18;

  if (!isValidQuad) {
    return {
      corners: estimateDefaultCorners(fullW, fullH),
      confidence: 0.25,
      detected: false
    };
  }

  // Scale corners back to original full resolution
  const invScale = 1 / scale;
  const clampX = (x: number) => Math.round(Math.max(0, Math.min(fullW, x * invScale)));
  const clampY = (y: number) => Math.round(Math.max(0, Math.min(fullH, y * invScale)));

  const finalCorners: DocumentCorners = {
    tl: { x: clampX(smallQuad.tl.x), y: clampY(smallQuad.tl.y) },
    tr: { x: clampX(smallQuad.tr.x), y: clampY(smallQuad.tr.y) },
    br: { x: clampX(smallQuad.br.x), y: clampY(smallQuad.br.y) },
    bl: { x: clampX(smallQuad.bl.x), y: clampY(smallQuad.bl.y) }
  };

  const confidence = Math.min(0.99, Math.max(0.45, qArea * 1.15));

  return {
    corners: finalCorners,
    confidence,
    detected: true
  };
}

/**
 * Async wrapper for detectDocumentCorners
 */
export async function detectDocumentCorners(img: HTMLImageElement): Promise<DocumentCorners> {
  const result = detectDocumentCornersSync(img, img.width, img.height);
  return result.corners;
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
  let targetWidth = Math.max(120, Math.round(Math.max(topWidth, bottomWidth)));

  const leftHeight = distance(tl, bl);
  const rightHeight = distance(tr, br);
  let targetHeight = Math.max(120, Math.round(Math.max(leftHeight, rightHeight)));

  // Cap max resolution to 2200px so filtering & mobile memory stay fast and crisp
  const maxAllowedDim = 2200;
  if (Math.max(targetWidth, targetHeight) > maxAllowedDim) {
    const downScale = maxAllowedDim / Math.max(targetWidth, targetHeight);
    targetWidth = Math.round(targetWidth * downScale);
    targetHeight = Math.round(targetHeight * downScale);
  }

  const dstPoints: [number, number][] = [
    [0, 0],
    [targetWidth, 0],
    [targetWidth, targetHeight],
    [0, targetHeight]
  ];

  const srcPoints: [number, number][] = [
    [tl.x, tl.y],
    [tr.x, tr.y],
    [br.x, br.y],
    [bl.x, bl.y]
  ];

  const H = solveHomography(srcPoints, dstPoints);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = img.width;
  srcCanvas.height = img.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
  const sPixels = srcData.data;
  const sw = img.width;
  const sh = img.height;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(targetWidth, targetHeight);
  const oPixels = outData.data;

  const h0 = H[0],
    h1 = H[1],
    h2 = H[2];
  const h3 = H[3],
    h4 = H[4],
    h5 = H[5];
  const h6 = H[6],
    h7 = H[7],
    h8 = H[8];

  let outIdx = 0;
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const z = h6 * x + h7 * y + h8;
      const invZ = 1 / (z || 1e-9);
      const srcX = (h0 * x + h1 * y + h2) * invZ;
      const srcY = (h3 * x + h4 * y + h5) * invZ;

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
          w00 * sPixels[idx00] +
            w10 * sPixels[idx10] +
            w01 * sPixels[idx01] +
            w11 * sPixels[idx11]
        );
        oPixels[outIdx + 1] = Math.round(
          w00 * sPixels[idx00 + 1] +
            w10 * sPixels[idx10 + 1] +
            w01 * sPixels[idx01 + 1] +
            w11 * sPixels[idx11 + 1]
        );
        oPixels[outIdx + 2] = Math.round(
          w00 * sPixels[idx00 + 2] +
            w10 * sPixels[idx10 + 2] +
            w01 * sPixels[idx01 + 2] +
            w11 * sPixels[idx11 + 2]
        );
        oPixels[outIdx + 3] = 255;
      } else {
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
 * Computes a local background illumination map via Morphological Dilation (Block Max-Pooling)
 * + Multi-pass Separable Box Blur.
 * This completely erases thin dark text while capturing uneven lighting, phone shadows,
 * and warm/yellow room color casts.
 */
function computeIlluminationGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize = 12
): {
  bgR: Float32Array;
  bgG: Float32Array;
  bgB: Float32Array;
  gw: number;
  gh: number;
  blockSize: number;
} {
  const gw = Math.ceil(width / blockSize);
  const gh = Math.ceil(height / blockSize);
  const gridLen = gw * gh;

  const maxR = new Float32Array(gridLen);
  const maxG = new Float32Array(gridLen);
  const maxB = new Float32Array(gridLen);

  // Step 1: 85th-percentile / Max-pooling per block (Morphological Dilation)
  for (let gy = 0; gy < gh; gy++) {
    const y0 = gy * blockSize;
    const y1 = Math.min(height, y0 + blockSize);
    for (let gx = 0; gx < gw; gx++) {
      const x0 = gx * blockSize;
      const x1 = Math.min(width, x0 + blockSize);

      let mr = 60,
        mg = 60,
        mb = 60;
      let maxLum = 0;

      // Sample every 2nd pixel inside the block for speed
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const idx = (y * width + x) << 2;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const l = r * 2 + g * 3 + b;
          if (l > maxLum) {
            maxLum = l;
            mr = r;
            mg = g;
            mb = b;
          }
        }
      }

      const gIdx = gy * gw + gx;
      maxR[gIdx] = mr;
      maxG[gIdx] = mg;
      maxB[gIdx] = mb;
    }
  }

  // Step 2: Further 3x3 max dilation on the coarse grid so large bold headers don't create halos
  const dilR = new Float32Array(gridLen);
  const dilG = new Float32Array(gridLen);
  const dilB = new Float32Array(gridLen);

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let mr = 0,
        mg = 0,
        mb = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.min(gh - 1, Math.max(0, gy + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.min(gw - 1, Math.max(0, gx + dx));
          const nIdx = ny * gw + nx;
          if (maxR[nIdx] > mr) mr = maxR[nIdx];
          if (maxG[nIdx] > mg) mg = maxG[nIdx];
          if (maxB[nIdx] > mb) mb = maxB[nIdx];
        }
      }
      const gIdx = gy * gw + gx;
      dilR[gIdx] = mr;
      dilG[gIdx] = mg;
      dilB[gIdx] = mb;
    }
  }

  // Step 3: 3-pass separable box blur (radius 3 on coarse grid = ~40px smooth radius)
  const tempR = new Float32Array(gridLen);
  const tempG = new Float32Array(gridLen);
  const tempB = new Float32Array(gridLen);

  const radius = 3;
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal pass
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let sr = 0,
          sg = 0,
          sb = 0,
          cnt = 0;
        for (let k = -radius; k <= radius; k++) {
          const nx = Math.min(gw - 1, Math.max(0, gx + k));
          const idx = gy * gw + nx;
          sr += dilR[idx];
          sg += dilG[idx];
          sb += dilB[idx];
          cnt++;
        }
        const outIdx = gy * gw + gx;
        tempR[outIdx] = sr / cnt;
        tempG[outIdx] = sg / cnt;
        tempB[outIdx] = sb / cnt;
      }
    }

    // Vertical pass
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        let sr = 0,
          sg = 0,
          sb = 0,
          cnt = 0;
        for (let k = -radius; k <= radius; k++) {
          const ny = Math.min(gh - 1, Math.max(0, gy + k));
          const idx = ny * gw + gx;
          sr += tempR[idx];
          sg += tempG[idx];
          sb += tempB[idx];
          cnt++;
        }
        const outIdx = gy * gw + gx;
        dilR[outIdx] = sr / cnt;
        dilG[outIdx] = sg / cnt;
        dilB[outIdx] = sb / cnt;
      }
    }
  }

  return { bgR: dilR, bgG: dilG, bgB: dilB, gw, gh, blockSize };
}

/**
 * Applies a fast 3x3 Unsharp Mask filter to make text edges razor-sharp like a 300 DPI scan
 */
function applyUnsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.55
): void {
  const copy = new Uint8ClampedArray(data);
  const rowStride = width * 4;

  for (let y = 1; y < height - 1; y++) {
    let idx = (y * width + 1) * 4;
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const neighbors =
          (copy[idx - 4 + c] +
            copy[idx + 4 + c] +
            copy[idx - rowStride + c] +
            copy[idx + rowStride + c]) *
          0.25;
        const diff = center - neighbors;
        // Only sharpen significant edges (text/lines), ignore flat white paper
        if (Math.abs(diff) > 3) {
          const val = center + diff * amount;
          data[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
      idx += 4;
    }
  }
}

/**
 * Real CamScanner Pro Filters:
 * - 'magic': Illumination-normalized shadow removal, pure #FFFFFF paper bleaching,
 *            deep black text S-curve, ink/stamp saturation boost, and 3x3 Unsharp Mask.
 * - 'bw': Adaptive shadow-free document binarization with smooth anti-aliased text edges.
 * - 'sharp': Gentle shadow removal + ultra-crisp sharpening for pencil/handwriting.
 * - 'grayscale': Clean shadow-normalized grayscale document.
 * - 'original': Untouched photo with optional brightness/contrast sliders.
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

  const bVal = brightness * 1.3;
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

  // Compute local background illumination grid for shadow removal & white-balancing
  const { bgR, bgG, bgB, gw, gh, blockSize } = computeIlluminationGrid(data, width, height, 12);

  // Helper to bilinearly sample background illumination at pixel (x, y)
  const invBlock = 1 / blockSize;

  for (let y = 0; y < height; y++) {
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) * invBlock - 0.5));
    const gy0 = Math.floor(gy);
    const gy1 = Math.min(gh - 1, gy0 + 1);
    const wy = gy - gy0;
    const wy0 = 1 - wy;

    for (let x = 0; x < width; x++) {
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) * invBlock - 0.5));
      const gx0 = Math.floor(gx);
      const gx1 = Math.min(gw - 1, gx0 + 1);
      const wx = gx - gx0;
      const wx0 = 1 - wx;

      const idx00 = gy0 * gw + gx0;
      const idx10 = gy0 * gw + gx1;
      const idx01 = gy1 * gw + gx0;
      const idx11 = gy1 * gw + gx1;

      const w00 = wx0 * wy0;
      const w10 = wx * wy0;
      const w01 = wx0 * wy;
      const w11 = wx * wy;

      const localBgR = Math.max(
        45,
        w00 * bgR[idx00] + w10 * bgR[idx10] + w01 * bgR[idx01] + w11 * bgR[idx11]
      );
      const localBgG = Math.max(
        45,
        w00 * bgG[idx00] + w10 * bgG[idx10] + w01 * bgG[idx01] + w11 * bgG[idx11]
      );
      const localBgB = Math.max(
        45,
        w00 * bgB[idx00] + w10 * bgB[idx10] + w01 * bgB[idx01] + w11 * bgB[idx11]
      );

      const pIdx = (y * width + x) << 2;
      const rawR = data[pIdx];
      const rawG = data[pIdx + 1];
      const rawB = data[pIdx + 2];

      // Division Normalization: removes 100% of shadows and uneven lighting!
      let nr = Math.min(255, (rawR / localBgR) * 255);
      let ng = Math.min(255, (rawG / localBgG) * 255);
      let nb = Math.min(255, (rawB / localBgB) * 255);

      const normLum = 0.299 * nr + 0.587 * ng + 0.114 * nb;

      if (filter === 'bw') {
        // CamScanner B&W Document Mode (Clean adaptive binarization without shadow blotches)
        const cutoff = 198 - brightness * 0.8;
        const transitionWidth = Math.max(8, 26 - contrast * 0.3);
        let val: number;
        if (normLum >= cutoff + transitionWidth) {
          val = 255;
        } else if (normLum <= cutoff - transitionWidth) {
          val = 12; // Deep laser-printer ink black
        } else {
          // Smooth anti-aliased edge ramp for razor-sharp typography
          const t = (normLum - (cutoff - transitionWidth)) / (2 * transitionWidth);
          val = Math.round(12 + t * t * (3 - 2 * t) * 243);
        }
        data[pIdx] = val;
        data[pIdx + 1] = val;
        data[pIdx + 2] = val;
      } else if (filter === 'grayscale') {
        // Shadow-free Grayscale scan
        let g = normLum;
        if (g > 218) {
          g = 255;
        } else {
          // Stretch [0..218] to [0..255] with contrast S-curve
          const t = g / 218;
          g = Math.pow(t, 1.35) * 255;
        }
        g = cFactor * (g - 128) + 128 + bVal;
        const clamped = g < 0 ? 0 : g > 255 ? 255 : g;
        data[pIdx] = clamped;
        data[pIdx + 1] = clamped;
        data[pIdx + 2] = clamped;
      } else if (filter === 'sharp') {
        // Claritate / Eco-Scan: preserves light pencil & watermarks while whitening background
        const whitePoint = 228;
        const blackPoint = 35;
        const scaleChannel = (c: number) => {
          if (c >= whitePoint) return 255;
          if (c <= blackPoint) return 0;
          return ((c - blackPoint) / (whitePoint - blackPoint)) * 255;
        };
        nr = scaleChannel(nr);
        ng = scaleChannel(ng);
        nb = scaleChannel(nb);

        data[pIdx] = Math.min(255, Math.max(0, cFactor * (nr - 128) + 128 + bVal));
        data[pIdx + 1] = Math.min(255, Math.max(0, cFactor * (ng - 128) + 128 + bVal));
        data[pIdx + 2] = Math.min(255, Math.max(0, cFactor * (nb - 128) + 128 + bVal));
      } else {
        // 'magic': CamScanner Pro "Magic Color"
        // 1. Pure white paper bleaching + deep dark ink curve
        const whitePoint = 210 - brightness * 0.4;
        const blackPoint = 48 + contrast * 0.35;

        const mapCurve = (c: number) => {
          if (c >= whitePoint) return 255;
          if (c <= blackPoint) return Math.max(0, c * 0.25);
          const t = (c - blackPoint) / (whitePoint - blackPoint);
          // Steep S-curve so text is dark and paper is pure #FFFFFF
          const curved = t * t * (3 - 2 * t);
          return curved * 255;
        };

        nr = mapCurve(nr);
        ng = mapCurve(ng);
        nb = mapCurve(nb);

        // 2. Boost color saturation on colored ink (blue signatures, red/purple stamps)
        const maxC = Math.max(nr, ng, nb);
        const minC = Math.min(nr, ng, nb);
        const chroma = maxC - minC;
        if (chroma > 18 && maxC < 248) {
          const mid = (nr + ng + nb) / 3;
          const satBoost = 1.45;
          nr = mid + (nr - mid) * satBoost;
          ng = mid + (ng - mid) * satBoost;
          nb = mid + (nb - mid) * satBoost;
        }

        // 3. Apply fine slider adjustments if any
        if (brightness !== 0 || contrast !== 0) {
          nr = cFactor * (nr - 128) + 128 + bVal;
          ng = cFactor * (ng - 128) + 128 + bVal;
          nb = cFactor * (nb - 128) + 128 + bVal;
        }

        data[pIdx] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
        data[pIdx + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
        data[pIdx + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
      }
    }
  }

  // Apply 3x3 Unsharp Mask for crisp flatbed-scanner typography
  if (filter === 'magic' || filter === 'sharp') {
    applyUnsharpMask(data, width, height, filter === 'sharp' ? 0.75 : 0.55);
  }

  ctx.putImageData(imgData, 0, 0);
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
