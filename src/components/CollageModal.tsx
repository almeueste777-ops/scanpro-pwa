import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, LayoutGrid, Check } from 'lucide-react';
import type { DocumentPage } from '../db';
import { loadImage, createThumbnail } from '../utils/imageProcessing';

interface CollageModalProps {
  pages: DocumentPage[];
  onSaveCollagePage: (dataUrl: string, thumbnailUrl: string) => Promise<void>;
  onClose: () => void;
}

type GridLayout = '2v' | '2h' | '4grid' | '6grid';

export const CollageModal: React.FC<CollageModalProps> = ({
  pages,
  onSaveCollagePage,
  onClose
}) => {
  const [layout, setLayout] = useState<GridLayout>(pages.length > 2 ? '4grid' : '2v');
  const [showBorders, setShowBorders] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const renderCollage = useCallback(async () => {
    const a4W = 1240;
    const a4H = 1754;
    const out = document.createElement('canvas');
    out.width = a4W;
    out.height = a4H;
    const ctx = out.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, a4W, a4H);

    let cols = 1;
    let rows = 2;
    if (layout === '2v') {
      cols = 1;
      rows = 2;
    } else if (layout === '2h') {
      cols = 2;
      rows = 1;
    } else if (layout === '4grid') {
      cols = 2;
      rows = 2;
    } else if (layout === '6grid') {
      cols = 2;
      rows = 3;
    }

    const maxItems = cols * rows;
    const itemsToDraw = pages.slice(0, maxItems);

    const padOuter = 56;
    const gap = 36;
    const availW = a4W - padOuter * 2 - gap * (cols - 1);
    const availH = a4H - padOuter * 2 - gap * (rows - 1);
    const cellW = Math.floor(availW / cols);
    const cellH = Math.floor(availH / rows);

    for (let i = 0; i < itemsToDraw.length; i++) {
      const p = itemsToDraw[i];
      const r = Math.floor(i / cols);
      const c = i % cols;

      const cellX = padOuter + c * (cellW + gap);
      const cellY = padOuter + r * (cellH + gap);

      try {
        const img = await loadImage(p.processedImage || p.originalImage);
        const labelSpace = showLabels ? 28 : 0;
        const maxImgW = cellW - 16;
        const maxImgH = cellH - 16 - labelSpace;

        const scale = Math.min(maxImgW / img.width, maxImgH / img.height);
        const dw = Math.round(img.width * scale);
        const dh = Math.round(img.height * scale);
        const dx = Math.round(cellX + (cellW - dw) / 2);
        const dy = Math.round(cellY + labelSpace + (cellH - labelSpace - dh) / 2);

        if (showBorders) {
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2;
          ctx.strokeRect(dx - 3, dy - 3, dw + 6, dh + 6);
        }

        ctx.drawImage(img, dx, dy, dw, dh);

        if (showLabels) {
          ctx.fillStyle = '#475569';
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(` #${i + 1}`, cellX + cellW / 2, dy - 10);
        }
      } catch (e) {
        console.warn('Collage image load error:', e);
      }
    }

    fullCanvasRef.current = out;
    if (previewRef.current) {
      previewRef.current.width = a4W;
      previewRef.current.height = a4H;
      const pCtx = previewRef.current.getContext('2d');
      if (pCtx) pCtx.drawImage(out, 0, 0);
    }
  }, [pages, layout, showBorders, showLabels]);

  useEffect(() => {
    renderCollage();
  }, [renderCollage]);

  const handleSave = async () => {
    if (!fullCanvasRef.current || isSaving) return;
    setIsSaving(true);
    try {
      const dataUrl = fullCanvasRef.current.toDataURL('image/jpeg', 0.94);
      const thumb = createThumbnail(fullCanvasRef.current, 320);
      await onSaveCollagePage(dataUrl, thumb);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Generator Colaj pe 1 Coală A4</h3>
              <p className="text-[11px] text-slate-400">
                Grupează mai multe bonuri, chitanțe sau pagini pe o singură foaie A4
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 flex-1">
          {/* Layout Selector */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: '2v', label: '2 Vertical', desc: 'Sus / Jos' },
              { id: '2h', label: '2 Alăturat', desc: 'Stânga / Dreapta' },
              { id: '4grid', label: '4 pe A4', desc: 'Grilă 2 × 2' },
              { id: '6grid', label: '6 Bonuri', desc: 'Grilă 2 × 3' }
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setLayout(opt.id as GridLayout)}
                className={`p-2 rounded-xl border text-center transition ${
                  layout === opt.id
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-xs font-bold">{opt.label}</div>
                <div className="text-[9px] opacity-80">{opt.desc}</div>
              </button>
            ))}
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showBorders}
                onChange={(e) => setShowBorders(e.target.checked)}
                className="accent-emerald-500"
              />
              <span>Chenar subțire în jurul fiecărui bon</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
                className="accent-emerald-500"
              />
              <span>Numerotare (#1, #2...)</span>
            </label>
          </div>

          {/* Live A4 Preview */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col items-center">
            <span className="text-[10px] text-slate-400 font-semibold mb-2">
              Previzualizare Coală A4 ({pages.length} pagini disponibile)
            </span>
            <canvas
              ref={previewRef}
              className="max-h-[340px] w-auto rounded-lg shadow-2xl border border-slate-700 bg-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{isSaving ? 'Se generează...' : 'Adaugă Coala A4 în Document'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
