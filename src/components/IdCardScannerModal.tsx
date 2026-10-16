import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  CreditCard,
  Camera,
  Check,
  ShieldAlert,
  Sparkles,
  RotateCw
} from 'lucide-react';
import {
  loadImage,
  detectDocumentCornersSync,
  warpPerspective,
  applyFilter,
  rotateCanvas,
  createThumbnail
} from '../utils/imageProcessing';
import type { FilterType } from '../db';

interface IdCardScannerModalProps {
  onClose: () => void;
  onSaveIdDocument: (
    title: string,
    compositeDataUrl: string,
    thumbnailUrl: string
  ) => Promise<void>;
}

export const IdCardScannerModal: React.FC<IdCardScannerModalProps> = ({
  onClose,
  onSaveIdDocument
}) => {
  const [mode, setMode] = useState<'both' | 'single'>('both'); // Față + Verso vs Doar Față (ex: CI/Pașaport)
  const [frontCanvas, setFrontCanvas] = useState<HTMLCanvasElement | null>(null);
  const [backCanvas, setBackCanvas] = useState<HTMLCanvasElement | null>(null);
  const [filter, setFilter] = useState<FilterType>('magic');
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [showWatermarkPreset, setShowWatermarkPreset] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Process uploaded/captured side (auto-detect corners + warp + enhance)
  const handleSelectSide = async (side: 'front' | 'back', file: File) => {
    setIsProcessing(true);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const img = await loadImage(dataUrl);
      const detected = detectDocumentCornersSync(img, img.width, img.height);
      const warped = warpPerspective(img, detected.corners);

      // Ensure landscape orientation for ID card
      const oriented =
        warped.height > warped.width * 1.15 ? rotateCanvas(warped, 90) : warped;

      if (side === 'front') {
        setFrontCanvas(oriented);
      } else {
        setBackCanvas(oriented);
      }
    } catch (err) {
      console.error('ID Card processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRotateSide = (side: 'front' | 'back') => {
    if (side === 'front' && frontCanvas) {
      setFrontCanvas(rotateCanvas(frontCanvas, 90));
    } else if (side === 'back' && backCanvas) {
      setBackCanvas(rotateCanvas(backCanvas, 90));
    }
  };

  // Render A4 composite preview
  const renderA4Composite = useCallback(() => {
    const out = document.createElement('canvas');
    // Standard crisp A4 portrait @ 150 DPI: 1240 x 1754 px
    const a4W = 1240;
    const a4H = 1754;
    out.width = a4W;
    out.height = a4H;

    const ctx = out.getContext('2d')!;
    // Pure white A4 sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, a4W, a4H);

    // Card target max box on A4 (realistic ID card proportion with clean margins)
    const cardMaxW = 760;
    const cardMaxH = 500;

    const drawCard = (srcCanvas: HTMLCanvasElement, centerY: number, label: string) => {
      const filtered = applyFilter(srcCanvas, filter, 0, 5);
      const scale = Math.min(cardMaxW / filtered.width, cardMaxH / filtered.height);
      const dw = Math.round(filtered.width * scale);
      const dh = Math.round(filtered.height * scale);
      const dx = Math.round((a4W - dw) / 2);
      const dy = Math.round(centerY - dh / 2);

      // Subtle border around ID card on the A4 sheet
      ctx.save();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx - 2, dy - 2, dw + 4, dh + 4);
      ctx.drawImage(filtered, dx, dy, dw, dh);

      // Small label above card
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, a4W / 2, dy - 16);
      ctx.restore();
    };

    if (mode === 'single') {
      if (frontCanvas) {
        drawCard(frontCanvas, a4H * 0.42, 'ACT DE IDENTITATE');
      }
    } else {
      if (frontCanvas) {
        drawCard(frontCanvas, a4H * 0.3, 'FAȚĂ (FRONT)');
      }
      if (backCanvas) {
        drawCard(backCanvas, a4H * 0.7, 'VERSO (BACK)');
      }
    }

    // Optional Anti-Fraud Watermark overlay across the A4 page
    if (watermarkText.trim()) {
      ctx.save();
      ctx.translate(a4W / 2, a4H / 2);
      ctx.rotate(-Math.PI / 6);
      ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';

      const text = watermarkText.trim().toUpperCase();
      for (let y = -600; y <= 600; y += 220) {
        ctx.fillText(text, 0, y);
      }
      ctx.restore();
    }

    compositeCanvasRef.current = out;

    if (previewCanvasRef.current) {
      const pCanvas = previewCanvasRef.current;
      pCanvas.width = a4W;
      pCanvas.height = a4H;
      const pCtx = pCanvas.getContext('2d');
      if (pCtx) {
        pCtx.drawImage(out, 0, 0);
      }
    }
  }, [frontCanvas, backCanvas, mode, filter, watermarkText]);

  useEffect(() => {
    renderA4Composite();
  }, [renderA4Composite]);

  const handleSave = async () => {
    if (!compositeCanvasRef.current || !frontCanvas) return;
    setIsSaving(true);
    try {
      const dataUrl = compositeCanvasRef.current.toDataURL('image/jpeg', 0.94);
      const thumb = createThumbnail(compositeCanvasRef.current, 320);
      const dateStr = new Date().toLocaleDateString('ro-RO');
      await onSaveIdDocument(`Act Identitate A4 (${dateStr})`, dataUrl, thumb);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-xl max-h-[94vh] overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-white">Scanner Act ID / Card pe A4</h3>
                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[9px] uppercase">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Pune automat Față + Verso pe o singură coală A4 albă
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          {/* Mode Switch: Față + Verso vs Doar Față */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMode('both')}
              className={`py-2 rounded-lg text-xs font-bold transition ${
                mode === 'both'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Card Față + Verso (2 fețe)
            </button>
            <button
              onClick={() => setMode('single')}
              className={`py-2 rounded-lg text-xs font-bold transition ${
                mode === 'single'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Doar Față (CI / Pașaport)
            </button>
          </div>

          {/* Capture / Upload Slots */}
          <div className={`grid ${mode === 'both' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            {/* Front Side */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex flex-col items-center gap-2">
              <div className="w-full flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">1. FAȚĂ ACT</span>
                {frontCanvas && (
                  <button
                    onClick={() => handleRotateSide('front')}
                    className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 px-2"
                  >
                    <RotateCw className="w-3 h-3" /> Rotește
                  </button>
                )}
              </div>

              <input
                type="file"
                ref={frontInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleSelectSide('front', e.target.files[0]);
                }}
              />

              <button
                onClick={() => frontInputRef.current?.click()}
                className="w-full py-3 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>{frontCanvas ? 'Schimbă Poza Față' : 'Scanează / Încarcă Fața'}</span>
              </button>
            </div>

            {/* Back Side */}
            {mode === 'both' && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 flex flex-col items-center gap-2">
                <div className="w-full flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400">2. VERSO ACT</span>
                  {backCanvas && (
                    <button
                      onClick={() => handleRotateSide('back')}
                      className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[10px] flex items-center gap-1 px-2"
                    >
                      <RotateCw className="w-3 h-3" /> Rotește
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={backInputRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleSelectSide('back', e.target.files[0]);
                  }}
                />

                <button
                  onClick={() => backInputRef.current?.click()}
                  className="w-full py-3 px-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>{backCanvas ? 'Schimbă Poza Verso' : 'Scanează / Încarcă Verso'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter & Anti-Fraud Watermark Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">Filtru:</span>
              {(['magic', 'bw', 'grayscale', 'original'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition ${
                    filter === f
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {f === 'magic' ? 'Magic' : f === 'bw' ? 'A&N' : f === 'grayscale' ? 'Gri' : 'Orig'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowWatermarkPreset(!showWatermarkPreset)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                watermarkText
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Filigran Protecție CI</span>
            </button>
          </div>

          {showWatermarkPreset && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <label className="block text-[11px] font-semibold text-slate-400">
                Filigran anti-fraudă peste copia de buletin (opțional):
              </label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Ex: CONFORM CU ORIGINALUL / EXCLUSIV PENTRU BANCĂ"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  'CONFORM CU ORIGINALUL',
                  'DOAR PENTRU VERIFICARE',
                  'CONFIDENȚIAL',
                  ''
                ].map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setWatermarkText(preset)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                  >
                    {preset || 'Fără filigran'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live A4 Sheet Preview */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex flex-col items-center">
            <span className="text-[11px] text-slate-400 font-semibold mb-2">
              Previzualizare Coală A4 Finală
            </span>
            {isProcessing ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-emerald-400 font-semibold">
                  Se decupează și se curăță automat actul...
                </span>
              </div>
            ) : (
              <canvas
                ref={previewCanvasRef}
                className="max-h-[340px] w-auto rounded-lg shadow-2xl border border-slate-700 bg-white"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={!frontCanvas || isSaving}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition"
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            <span>{isSaving ? 'Se salvează...' : 'Salvează Coala A4 în Documente'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
