import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Check,
  Eraser,
  Highlighter,
  EyeOff,
  PenTool,
  Undo2,
  RotateCcw
} from 'lucide-react';
import { loadImage, createThumbnail } from '../utils/imageProcessing';

interface PageRetouchModalProps {
  pageImage: string;
  onSave: (newProcessedImage: string, newThumbnail: string) => Promise<void>;
  onClose: () => void;
}

type ToolType = 'eraser' | 'highlighter' | 'redact' | 'pen';

export const PageRetouchModal: React.FC<PageRetouchModalProps> = ({
  pageImage,
  onSave,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<ToolType>('eraser');
  const [brushSize, setBrushSize] = useState<number>(28);
  const [highlightColor, setHighlightColor] = useState<string>('#fde047'); // yellow
  const [penColor, setPenColor] = useState<string>('#dc2626'); // red
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Load initial page image onto canvas
  useEffect(() => {
    let mounted = true;
    loadImage(pageImage).then((img) => {
      if (!mounted || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    });
    return () => {
      mounted = false;
    };
  }, [pageImage]);

  const getCanvasCoords = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    const pt = getCanvasCoords(e);
    lastPtRef.current = pt;
    drawSegment(pt, pt);
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || !lastPtRef.current) return;
    const pt = getCanvasCoords(e);
    drawSegment(lastPtRef.current, pt);
    lastPtRef.current = pt;
  };

  const handleEnd = () => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);
    lastPtRef.current = null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-12), snap]);
  };

  const drawSegment = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Scale brush relative to image resolution
    const scaleFactor = Math.max(1, canvas.width / 900);
    const lineW = brushSize * scaleFactor;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineW;

    if (tool === 'eraser') {
      // Smart Paper Eraser: cleans blemishes, fingers, staples with pure paper white
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
    } else if (tool === 'highlighter') {
      // Multiply blend mode keeps black text underneath 100% sharp and visible!
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = lineW * 1.3;
    } else if (tool === 'redact') {
      // Blackout bar for sensitive data (CNP, IBAN, Serie CI)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#090d16';
      ctx.lineCap = 'square';
    } else if (tool === 'pen') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = Math.max(3, lineW * 0.25);
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  };

  const handleUndo = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    const nextHist = history.slice(0, -1);
    const prevData = nextHist[nextHist.length - 1];
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.putImageData(prevData, 0, 0);
    setHistory(nextHist);
  };

  const handleReset = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    const firstData = history[0];
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.putImageData(firstData, 0, 0);
    setHistory([firstData]);
  };

  const handleConfirm = async () => {
    if (!canvasRef.current) return;
    setIsSaving(true);
    try {
      const processed = canvasRef.current.toDataURL('image/jpeg', 0.94);
      const thumb = createThumbnail(canvasRef.current, 320);
      await onSave(processed, thumb);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-3 bg-slate-900 border-b border-slate-800 z-20">
        <button
          onClick={onClose}
          className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h3 className="text-sm font-bold text-white">Retușare & Adnotare Pro</h3>
          <p className="text-[10px] text-slate-400">
            {tool === 'eraser' && 'Radieră Smart: Șterge pete, degete sau margini nedorite'}
            {tool === 'highlighter' && 'Marker Evidențiator: Subliniază fără să acopere textul'}
            {tool === 'redact' && 'Cenzurare: Ascunde CNP, IBAN sau date confidențiale'}
            {tool === 'pen' && 'Pix Adnotare: Scrie notițe direct pe marginea foii'}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-30 hover:text-white"
            title="Anulează ultimul pas"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            disabled={history.length <= 1}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-30 hover:text-white"
            title="Resetează tot"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Salvează</span>
          </button>
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden bg-slate-950">
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="max-w-full max-h-[64vh] object-contain rounded-lg shadow-2xl border border-slate-800 touch-none cursor-crosshair"
        />
      </div>

      {/* Bottom Tool Controls */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 pt-3 pb-6 space-y-3 z-20">
        {/* Brush Size & Color Options */}
        <div className="flex items-center justify-between gap-4 bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">
              Grosime:
            </span>
            <input
              type="range"
              min="10"
              max="65"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg"
            />
          </div>

          {tool === 'highlighter' && (
            <div className="flex items-center gap-1.5">
              {[
                { c: '#fde047', label: 'Galben' },
                { c: '#86efac', label: 'Verde' },
                { c: '#93c5fd', label: 'Albastru' },
                { c: '#f9a8d4', label: 'Roz' }
              ].map((sw) => (
                <button
                  key={sw.c}
                  onClick={() => setHighlightColor(sw.c)}
                  style={{ backgroundColor: sw.c }}
                  className={`w-6 h-6 rounded-full border-2 transition ${
                    highlightColor === sw.c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  title={sw.label}
                />
              ))}
            </div>
          )}

          {tool === 'pen' && (
            <div className="flex items-center gap-1.5">
              {[
                { c: '#dc2626', label: 'Roșu' },
                { c: '#1d4ed8', label: 'Albastru' },
                { c: '#0f172a', label: 'Negru' }
              ].map((sw) => (
                <button
                  key={sw.c}
                  onClick={() => setPenColor(sw.c)}
                  style={{ backgroundColor: sw.c }}
                  className={`w-6 h-6 rounded-full border-2 transition ${
                    penColor === sw.c ? 'border-white scale-110' : 'border-slate-600'
                  }`}
                  title={sw.label}
                />
              ))}
            </div>
          )}
        </div>

        {/* 4 Tools Bar */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => setTool('eraser')}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition ${
              tool === 'eraser'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
            }`}
          >
            <Eraser className="w-5 h-5" />
            <span>Radieră Pete</span>
          </button>

          <button
            onClick={() => setTool('highlighter')}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition ${
              tool === 'highlighter'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
            }`}
          >
            <Highlighter className="w-5 h-5" />
            <span>Evidențiator</span>
          </button>

          <button
            onClick={() => setTool('redact')}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition ${
              tool === 'redact'
                ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
            }`}
          >
            <EyeOff className="w-5 h-5" />
            <span>Cenzurare CNP</span>
          </button>

          <button
            onClick={() => setTool('pen')}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-bold border transition ${
              tool === 'pen'
                ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
            }`}
          >
            <PenTool className="w-5 h-5" />
            <span>Notiță Pix</span>
          </button>
        </div>
      </div>
    </div>
  );
};
