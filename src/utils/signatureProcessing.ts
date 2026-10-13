import { loadImage } from './imageProcessing';

export interface PlacedOverlay {
  id: string;
  signatureId: string;
  imageData: string;
  type: 'signature' | 'stamp';
  name: string;
  // Normalized coordinates (0 to 1) so it maps smoothly across any page resolution
  x: number; // 0 to 1
  y: number; // 0 to 1
  scale: number; // scale relative to page width (e.g. 0.25 = 25% of page width)
  rotation: number; // degrees
}

export interface StampConfig {
  type: 'rect' | 'circle' | 'badge';
  title: string;
  subtitle?: string;
  dateStr?: string;
  color: string; // '#dc2626', '#1d4ed8', '#059669', '#0f172a'
}

/**
 * Trims transparent borders from a canvas so the signature/stamp fits tightly
 */
export function trimTransparentCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If completely empty, return small canvas
  if (minX > maxX || minY > maxY) {
    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = 100;
    emptyCanvas.height = 50;
    return emptyCanvas;
  }

  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;

  const out = document.createElement('canvas');
  out.width = trimW;
  out.height = trimH;
  const outCtx = out.getContext('2d')!;
  outCtx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

  return out;
}

/**
 * Converts a scanned or uploaded signature on paper into a transparent PNG
 * with intelligent background subtraction and optional ink tinting.
 */
export async function extractTransparentInk(
  imageSrc: string,
  tintColor: string | null = null, // e.g. '#1d4ed8' (blue pen), '#111827' (black), '#dc2626' (red)
  thresholdMultiplier = 1.0
): Promise<string> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  // 1. Calculate average luminance of corners (estimated paper color)
  let bgLuminance = 240;
  let sampleCount = 0;
  let sampleSum = 0;
  // Sample 20 random perimeter points
  for (let i = 0; i < 20; i++) {
    const rx = Math.floor(Math.random() * img.width);
    const ry = i % 2 === 0 ? 5 : img.height - 5;
    const pIdx = (ry * img.width + rx) * 4;
    const lum = 0.299 * data[pIdx] + 0.587 * data[pIdx + 1] + 0.114 * data[pIdx + 2];
    sampleSum += lum;
    sampleCount++;
  }
  if (sampleCount > 0) {
    bgLuminance = Math.min(255, Math.max(180, (sampleSum / sampleCount) * thresholdMultiplier));
  }

  // Parse tint RGB if provided
  let tR = 0, tG = 0, tB = 0;
  if (tintColor && tintColor.startsWith('#')) {
    const hex = tintColor.replace('#', '');
    tR = parseInt(hex.substring(0, 2), 16) || 0;
    tG = parseInt(hex.substring(2, 4), 16) || 0;
    tB = parseInt(hex.substring(4, 6), 16) || 0;
  }

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (lum >= bgLuminance - 10) {
      // Paper background -> 100% transparent
      data[i + 3] = 0;
    } else {
      // Ink pixel: calculate alpha with smooth gradient falloff
      const diff = bgLuminance - lum;
      const alpha = Math.min(255, Math.max(0, Math.round((diff / 90) * 255)));
      data[i + 3] = alpha;

      if (tintColor) {
        // Tint to selected realistic pen / stamp ink color
        data[i] = tR;
        data[i + 1] = tG;
        data[i + 2] = tB;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Auto-trim transparent margins around the signature
  const trimmed = trimTransparentCanvas(canvas);
  return trimmed.toDataURL('image/png');
}

/**
 * Programmatically generates authentic rubber stamps (rectangular, circular, badge)
 */
export function generateRubberStamp(config: StampConfig): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const color = config.color || '#dc2626';

  if (config.type === 'rect') {
    // Rectangular stamp: double border box
    canvas.width = 460;
    canvas.height = 180;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // Outer border
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 440, 160);

    // Inner dashed or thin border
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, 424, 144);

    // Text Title
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.title.toUpperCase(), 230, 56);

    // Subtitle / Date
    if (config.subtitle || config.dateStr) {
      ctx.beginPath();
      ctx.moveTo(35, 84);
      ctx.lineTo(425, 84);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillText((config.subtitle || 'SEMNĂTURĂ / APROBAT').toUpperCase(), 230, 114);

      if (config.dateStr) {
        ctx.font = '13px Arial, sans-serif';
        ctx.fillText(`DATA: ${config.dateStr}`, 230, 142);
      }
    }
  } else if (config.type === 'circle') {
    // Circular company seal
    const size = 320;
    canvas.width = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    const center = size / 2;
    const rOuter = 144;
    const rInner = 126;

    // Outer ring
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center, center, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring (dashed or double)
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, rInner, 0, Math.PI * 2);
    ctx.stroke();

    // Curved title along top arc
    const title = config.title.toUpperCase();
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'center';

    const textRadius = 106;
    const totalAngle = Math.min(Math.PI * 0.9, title.length * 0.14);
    const startAngle = -Math.PI / 2 - totalAngle / 2;
    const angleStep = totalAngle / Math.max(1, title.length - 1);

    for (let i = 0; i < title.length; i++) {
      const angle = startAngle + i * angleStep;
      ctx.save();
      ctx.translate(center + textRadius * Math.cos(angle), center + textRadius * Math.sin(angle));
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(title[i], 0, 0);
      ctx.restore();
    }

    // Center Text
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText((config.subtitle || 'VIZAT').toUpperCase(), center, center - 6);

    // Stars / Date
    if (config.dateStr) {
      ctx.font = '13px Arial, sans-serif';
      ctx.fillText(config.dateStr, center, center + 24);
    } else {
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText('★ ★ ★', center, center + 24);
    }
  } else {
    // Rounded modern badge (e.g. ACHITAT, CONFIDENTIAL)
    canvas.width = 380;
    canvas.height = 140;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // Rounded rectangle
    const x = 12, y = 12, w = 356, h = 116, r = 16;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 7, y + 7, w - 14, h - 14, r - 4);
    ctx.stroke();

    ctx.font = '900 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.title.toUpperCase(), 190, config.dateStr ? 56 : 70);

    if (config.dateStr) {
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.fillText(config.dateStr, 190, 94);
    }
  }

  // Slight ink grunge / opacity feel
  return canvas.toDataURL('image/png');
}

/**
 * Burns an array of placed overlays (signatures/stamps) onto a page's image
 * and returns the new processed JPEG data URL and thumbnail.
 */
export async function burnOverlaysOntoPage(
  pageImageSrc: string,
  overlays: PlacedOverlay[]
): Promise<string> {
  if (overlays.length === 0) return pageImageSrc;

  const pageImg = await loadImage(pageImageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = pageImg.width;
  canvas.height = pageImg.height;
  const ctx = canvas.getContext('2d')!;

  // 1. Draw base page
  ctx.drawImage(pageImg, 0, 0);

  // 2. Draw each overlay at its normalized position & scale
  for (const item of overlays) {
    const itemImg = await loadImage(item.imageData);

    // Calculate item width based on scale relative to page width
    const targetWidth = canvas.width * item.scale;
    const aspect = itemImg.width / itemImg.height;
    const targetHeight = targetWidth / aspect;

    // Center position in pixel coordinates
    const posX = item.x * canvas.width;
    const posY = item.y * canvas.height;

    ctx.save();
    ctx.translate(posX, posY);
    if (item.rotation !== 0) {
      ctx.rotate((item.rotation * Math.PI) / 180);
    }
    // Draw centered
    ctx.drawImage(itemImg, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    ctx.restore();
  }

  return canvas.toDataURL('image/jpeg', 0.94);
}
