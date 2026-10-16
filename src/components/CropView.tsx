import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCw, Check, X, Maximize2, Sparkles } from 'lucide-react';
import type { Point, DocumentCorners } from '../db';
import {
  loadImage,
  detectDocumentCornersSync,
  warpPerspective,
  rotateCanvas
} from '../utils/imageProcessing';

interface CropViewProps {
  imageSrc: string;
  initialCorners?: DocumentCorners | null;
  onConfirmCrop: (warpedCanvas: HTMLCanvasElement, corners: DocumentCorners) => void;
  onCancel: () => void;
}

type CornerKey = 'tl' | 'tr' | 'br' | 'bl';

export const CropView: React.FC<CropViewProps> = ({
  imageSrc,
  initialCorners,
  onConfirmCrop,
  onCancel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<DocumentCorners | null>(null);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
  const [displayMetrics, setDisplayMetrics] = useState<{
    scale: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }>({ scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0 });

  // Load image and automatically detect document boundary corners
  useEffect(() => {
    let isMounted = true;
    loadImage(imageSrc).then((img) => {
      if (!isMounted) return;
      setImageObj(img);
      if (initialCorners) {
        setCorners(initialCorners);
      } else {
        const detected = detectDocumentCornersSync(img, img.width, img.height);
        setCorners(detected.corners);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [imageSrc, initialCorners]);

  // Update layout & render canvas
  const updateCanvasDisplay = useCallback(() => {
    if (!imageObj || !canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const contWidth = container.clientWidth;
    const contHeight = container.clientHeight;

    // Calculate scale to fit container while preserving aspect ratio
    const imgW = imageObj.width;
    const imgH = imageObj.height;
    const scale = Math.min((contWidth - 32) / imgW, (contHeight - 48) / imgH, 1);

    const dw = Math.round(imgW * scale);
    const dh = Math.round(imgH * scale);
    const offsetX = Math.round((contWidth - dw) / 2);
    const offsetY = Math.round((contHeight - dh) / 2);

    canvas.width = contWidth;
    canvas.height = contHeight;

    setDisplayMetrics({ scale, offsetX, offsetY, width: dw, height: dh });

    // Draw dark background
    ctx.clearRect(0, 0, contWidth, contHeight);

    // Draw main image
    ctx.drawImage(imageObj, offsetX, offsetY, dw, dh);

    if (!corners) return;

    // Convert corners from image coords to screen coords
    const toScreen = (p: Point) => ({
      x: offsetX + p.x * scale,
      y: offsetY + p.y * scale
    });

    const sTL = toScreen(corners.tl);
    const sTR = toScreen(corners.tr);
    const sBR = toScreen(corners.br);
    const sBL = toScreen(corners.bl);

    // 1. Dim outside polygon
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, contWidth, contHeight);
    // Cut out inner polygon
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.closePath();
    ctx.fill('evenodd');
    ctx.restore();

    // 2. Draw glowing polygon edges
    ctx.strokeStyle = '#10b981'; // emerald-500
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.closePath();
    ctx.stroke();

    // 3. Draw grid lines inside document
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      // Horizontal grid
      const leftX = sTL.x + (sBL.x - sTL.x) * t;
      const leftY = sTL.y + (sBL.y - sTL.y) * t;
      const rightX = sTR.x + (sBR.x - sTR.x) * t;
      const rightY = sTR.y + (sBR.y - sTR.y) * t;
      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();

      // Vertical grid
      const topX = sTL.x + (sTR.x - sTL.x) * t;
      const topY = sTL.y + (sTR.y - sTL.y) * t;
      const botX = sBL.x + (sBR.x - sBL.x) * t;
      const botY = sBL.y + (sBR.y - sBL.y) * t;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(botX, botY);
      ctx.stroke();
    }

    // 4. Draw corner pin handles
    const cornerPoints = [sTL, sTR, sBR, sBL];
    cornerPoints.forEach((pt) => {
      // Outer glow ring
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
      ctx.fill();

      // Inner emerald dot
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = '#047857';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [imageObj, corners]);

  useEffect(() => {
    updateCanvasDisplay();
    window.addEventListener('resize', updateCanvasDisplay);
    return () => window.removeEventListener('resize', updateCanvasDisplay);
  }, [updateCanvasDisplay]);

  // Render Loupe (Magnifier) when user drags a corner
  useEffect(() => {
    if (!activeCorner || !corners || !imageObj || !loupeCanvasRef.current) return;

    const loupe = loupeCanvasRef.current;
    const lCtx = loupe.getContext('2d');
    if (!lCtx) return;

    const pt = corners[activeCorner];
    const zoom = 2.5;
    const size = 120; // loupe diameter

    loupe.width = size;
    loupe.height = size;

    lCtx.clearRect(0, 0, size, size);

    // Circular clip
    lCtx.save();
    lCtx.beginPath();
    lCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    lCtx.clip();

    // Fill background
    lCtx.fillStyle = '#0f172a';
    lCtx.fill();

    // Draw magnified image segment
    const srcW = size / zoom;
    const srcH = size / zoom;
    const srcX = pt.x - srcW / 2;
    const srcY = pt.y - srcH / 2;

    lCtx.drawImage(imageObj, srcX, srcY, srcW, srcH, 0, 0, size, size);

    // Crosshairs
    lCtx.strokeStyle = '#10b981';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.moveTo(size / 2, 0);
    lCtx.lineTo(size / 2, size);
    lCtx.moveTo(0, size / 2);
    lCtx.lineTo(size, size / 2);
    lCtx.stroke();

    // Center target dot
    lCtx.fillStyle = '#ffffff';
    lCtx.beginPath();
    lCtx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    lCtx.fill();

    lCtx.restore();
  }, [activeCorner, corners, imageObj]);

  // Touch & Pointer interaction handling
  const getScreenCoordinates = (e: React.TouchEvent | React.MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top
      };
    }
    return { x: 0, y: 0 };
  };

  const handlePointerDown = (e: React.TouchEvent | React.MouseEvent) => {
    if (!corners || !imageObj) return;

    const { x, y } = getScreenCoordinates(e);
    const { scale, offsetX, offsetY } = displayMetrics;

    const distToCorner = (p: Point) => {
      const sx = offsetX + p.x * scale;
      const sy = offsetY + p.y * scale;
      return Math.hypot(sx - x, sy - y);
    };

    const hitRadius = 48; // Large forgiving touch target for mobile fingertips
    const dTL = distToCorner(corners.tl);
    const dTR = distToCorner(corners.tr);
    const dBR = distToCorner(corners.br);
    const dBL = distToCorner(corners.bl);

    const minDist = Math.min(dTL, dTR, dBR, dBL);
    if (minDist <= hitRadius) {
      let selected: CornerKey = 'tl';
      if (minDist === dTL) selected = 'tl';
      else if (minDist === dTR) selected = 'tr';
      else if (minDist === dBR) selected = 'br';
      else if (minDist === dBL) selected = 'bl';

      setActiveCorner(selected);
      setLoupePos({ x, y: Math.max(70, y - 90) });

      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!activeCorner || !corners || !imageObj) return;

    const { x, y } = getScreenCoordinates(e);
    const { scale, offsetX, offsetY } = displayMetrics;

    // Convert back to image coordinates and clamp
    const imgX = Math.round(Math.max(0, Math.min(imageObj.width, (x - offsetX) / scale)));
    const imgY = Math.round(Math.max(0, Math.min(imageObj.height, (y - offsetY) / scale)));

    setCorners((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [activeCorner]: { x: imgX, y: imgY }
      };
    });

    // Loupe stays above finger
    setLoupePos({ x, y: Math.max(70, y - 90) });
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
    setLoupePos(null);
  };

  // Reset to full image
  const handleSelectAll = () => {
    if (!imageObj) return;
    setCorners({
      tl: { x: 0, y: 0 },
      tr: { x: imageObj.width, y: 0 },
      br: { x: imageObj.width, y: imageObj.height },
      bl: { x: 0, y: imageObj.height }
    });
  };

  // Auto-detect corners
  const handleAutoDetect = () => {
    if (!imageObj) return;
    const detected = detectDocumentCornersSync(imageObj, imageObj.width, imageObj.height);
    setCorners(detected.corners);
    if (navigator.vibrate) navigator.vibrate(40);
  };

  // Rotate image 90 degrees
  const handleRotate = () => {
    if (!imageObj) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageObj.width;
    tempCanvas.height = imageObj.height;
    const tCtx = tempCanvas.getContext('2d')!;
    tCtx.drawImage(imageObj, 0, 0);

    const rotated = rotateCanvas(tempCanvas, 90);
    const nextImg = new Image();
    nextImg.onload = () => {
      setImageObj(nextImg);
      const detected = detectDocumentCornersSync(nextImg, nextImg.width, nextImg.height);
      setCorners(detected.corners);
    };
    nextImg.src = rotated.toDataURL('image/jpeg', 0.95);
  };

  // Confirm and perform bilinear perspective warp
  const handleDone = () => {
    if (!imageObj || !corners) return;
    const warpedCanvas = warpPerspective(imageObj, corners);
    onConfirmCrop(warpedCanvas, corners);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 pt-8 pb-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md z-20">
        <button
          onClick={onCancel}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold text-white tracking-wide">Ajustare Colțuri</h2>
          <p className="text-xs text-slate-400">Trage de colțuri pentru a îndrepta pagina</p>
        </div>
        <button
          onClick={handleDone}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Gata</span>
        </button>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden touch-none"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Floating Magnifying Loupe */}
        {activeCorner && loupePos && (
          <div
            style={{
              left: `${loupePos.x}px`,
              top: `${loupePos.y}px`,
              transform: 'translate(-50%, -100%)'
            }}
            className="pointer-events-none absolute z-30 transition-transform duration-75"
          >
            <div className="w-[124px] h-[124px] rounded-full border-4 border-emerald-400 shadow-2xl bg-slate-900 overflow-hidden flex items-center justify-center">
              <canvas ref={loupeCanvasRef} className="w-full h-full" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tool Bar */}
      <div className="flex items-center justify-around px-6 py-4 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md z-20">
        {/* Full Frame */}
        <button
          onClick={handleSelectAll}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition active:scale-95"
        >
          <div className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700">
            <Maximize2 className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium">Toată Poza</span>
        </button>

        {/* Auto Detect */}
        <button
          onClick={handleAutoDetect}
          className="flex flex-col items-center gap-1 text-emerald-400 hover:text-emerald-300 transition active:scale-95"
        >
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-900/60 shadow-lg shadow-emerald-950">
            <Sparkles className="w-5 h-5 fill-current" />
          </div>
          <span className="text-[11px] font-semibold">Auto-Detecție</span>
        </button>

        {/* Rotate */}
        <button
          onClick={handleRotate}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition active:scale-95"
        >
          <div className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700">
            <RotateCw className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-medium">Rotește 90°</span>
        </button>
      </div>
    </div>
  );
};
