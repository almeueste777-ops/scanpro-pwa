import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Check,
  ChevronLeft,
  RotateCw,
  Sliders,
  Sparkles,
  FileText,
  Sun,
  Eye,
  Plus,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { FilterType } from '../db';
import { applyFilter, rotateCanvas, createThumbnail } from '../utils/imageProcessing';

interface FilterViewProps {
  warpedCanvas: HTMLCanvasElement;
  isEditingExistingPage?: boolean;
  onSavePage: (
    processedImage: string,
    thumbnail: string,
    filter: FilterType,
    brightness: number,
    contrast: number,
    rotation: number,
    continueAdding?: boolean
  ) => void;
  onBackToCrop: () => void;
}

interface FilterOption {
  type: FilterType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    type: 'magic',
    label: 'Magic Color HD',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
    description: 'Fundal alb curat, text intens și culori vii'
  },
  {
    type: 'bw',
    label: 'Text Ultra-Clar',
    icon: <FileText className="w-4 h-4 text-blue-400" />,
    description: 'Binarizare adaptivă laser-sharp pentru text mărunt'
  },
  {
    type: 'sharp',
    label: 'Claritate HD',
    icon: <Sun className="w-4 h-4 text-amber-400" />,
    description: 'Păstrează detalii fine, scris de mână și ștampile'
  },
  {
    type: 'grayscale',
    label: 'Tonuri Gri',
    icon: <span className="text-sm font-bold text-slate-400">G</span>,
    description: 'Nuanțe uniforme de gri'
  },
  {
    type: 'original',
    label: 'Original',
    icon: <Eye className="w-4 h-4 text-slate-400" />,
    description: 'Fără ajustări de culoare'
  }
];

export const FilterView: React.FC<FilterViewProps> = ({
  warpedCanvas,
  isEditingExistingPage = false,
  onSavePage,
  onBackToCrop
}) => {
  const [currentFilter, setCurrentFilter] = useState<FilterType>('magic');
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [showSliders, setShowSliders] = useState<boolean>(false);
  const [comparingOriginal, setComparingOriginal] = useState<boolean>(false);

  // Interactive Zoom & Pan States
  const [scale, setScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPinchDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render processed image with filter, rotation, brightness & contrast
  const updatePreview = useCallback(() => {
    if (!previewCanvasRef.current) return;

    // 1. Apply rotation first
    const rotated = rotateCanvas(warpedCanvas, rotation);

    // 2. Apply chosen CamScanner filter & sliders
    const filtered = applyFilter(rotated, currentFilter, brightness, contrast);
    processedCanvasRef.current = filtered;

    const displayCanvas = previewCanvasRef.current;
    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const toShow = comparingOriginal ? rotated : filtered;
    displayCanvas.width = toShow.width;
    displayCanvas.height = toShow.height;
    ctx.drawImage(toShow, 0, 0);
  }, [warpedCanvas, currentFilter, brightness, contrast, rotation, comparingOriginal]);

  useEffect(() => {
    updatePreview();
  }, [updatePreview]);

  // Handle Save
  const handleSave = (continueAdding = false) => {
    if (!processedCanvasRef.current) return;
    const canvas = processedCanvasRef.current;
    const processedImage = canvas.toDataURL('image/jpeg', 0.96);
    const thumbnail = createThumbnail(canvas, 420);

    onSavePage(
      processedImage,
      thumbnail,
      currentFilter,
      brightness,
      contrast,
      rotation,
      continueAdding
    );
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
    if (navigator.vibrate) navigator.vibrate(25);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(4, Number((prev + 0.5).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(2)));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Double tap to toggle zoom
  const handleDoubleTap = (clientX: number, clientY: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (scale > 1) {
        handleResetZoom();
      } else {
        setScale(2.5);
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const offsetX = (clientX - (rect.left + rect.width / 2)) * -1.2;
          const offsetY = (clientY - (rect.top + rect.height / 2)) * -1.2;
          setPanOffset({ x: offsetX, y: offsetY });
        }
      }
    }
    lastTapRef.current = now;
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((prev) => {
      const next = Math.min(4, Math.max(1, Number((prev + delta).toFixed(2))));
      if (next === 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  // Dragging / Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      initialPinchDistRef.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      initialScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleDoubleTap(touch.clientX, touch.clientY);
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const ratio = dist / initialPinchDistRef.current;
      const newScale = Math.min(4, Math.max(1, Number((initialScaleRef.current * ratio).toFixed(2))));
      setScale(newScale);
      if (newScale === 1) setPanOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const touch = e.touches[0];
      setPanOffset({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null;
    setIsDragging(false);
  };

  return (
    <div className="fixed inset-0 z-50 h-dvh bg-luxury-aurora flex flex-col justify-between overflow-hidden select-none">
      {/* Top Header */}
      <div className="glass-header pt-safe z-20">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between px-3.5 sm:px-6 pt-3 pb-3 gap-2">
          <button
            onClick={onBackToCrop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 transition active:scale-95"
            title="Ajustează manual cele 4 colțuri ale foii"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-xs font-bold">Colțuri</span>
          </button>

          <div className="text-center min-w-0">
            <h2 className="text-xs sm:text-sm font-extrabold text-white tracking-wide flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="truncate">Scanare Automată</span>
            </h2>
            <p className="text-[10px] text-emerald-400/90 font-medium truncate">
              Încadrat & albit automat
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Rotate Button */}
            <button
              onClick={handleRotate}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
              title="Rotește"
            >
              <RotateCw className="w-5 h-5" />
            </button>

            {/* Toggle Sliders */}
            <button
              onClick={() => setShowSliders(!showSliders)}
              className={`p-2 rounded-xl transition ${
                showSliders ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/80'
              }`}
              title="Ajustări luminozitate & contrast"
            >
              <Sliders className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Preview Container with Interactive Zoom & Pan */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center p-3 sm:p-6 overflow-hidden touch-none"
      >
        <div
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
          }}
          className="relative max-w-full max-h-full flex items-center justify-center shadow-2xl rounded-xl overflow-hidden border border-slate-800/90 bg-slate-950/60 will-change-transform"
        >
          <canvas
            ref={previewCanvasRef}
            className="max-w-full max-h-[58dvh] sm:max-h-[66dvh] w-auto h-auto object-contain block mx-auto rounded-lg pointer-events-none"
          />

          {/* Before / After Hold-to-Compare Pill */}
          {currentFilter !== 'original' && scale === 1 && (
            <button
              onMouseDown={() => setComparingOriginal(true)}
              onMouseUp={() => setComparingOriginal(false)}
              onMouseLeave={() => setComparingOriginal(false)}
              onTouchStart={() => setComparingOriginal(true)}
              onTouchEnd={() => setComparingOriginal(false)}
              className={`absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-lg flex items-center gap-1.5 transition ${
                comparingOriginal
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-black/75 text-white border-white/20 hover:bg-black/90'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{comparingOriginal ? 'POZA BRUTĂ (ÎNAINTE)' : 'Ține apăsat: Înainte/După'}</span>
            </button>
          )}
        </div>

        {/* Floating Zoom Controls Widget */}
        <div className="absolute top-4 right-4 z-30 flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 p-1 rounded-2xl shadow-xl backdrop-blur-md">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 1}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white disabled:opacity-30 hover:bg-slate-800 transition"
            title="Micșorează"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
            title="Resetează zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 4}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white disabled:opacity-30 hover:bg-slate-800 transition"
            title="Mărește zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Floating Fine-Tuning Sliders Overlay */}
        {showSliders && (
          <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:w-96 bg-slate-900/95 border border-slate-700/80 rounded-2xl p-4 backdrop-blur-xl shadow-2xl z-30 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Ajustări Fine
              </span>
              <button
                onClick={() => {
                  setBrightness(0);
                  setContrast(0);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-bold"
              >
                Resetează
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Luminozitate</span>
                  <span>{brightness > 0 ? `+${brightness}` : brightness}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Contrast</span>
                  <span>{contrast > 0 ? `+${contrast}` : contrast}</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Selector Ribbon & Save Bar */}
      <div className="glass-header border-t border-slate-800/80 pb-safe z-20">
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex items-center sm:justify-center gap-2 overflow-x-auto px-3.5 py-2.5 no-scrollbar">
            {FILTER_OPTIONS.map((f) => {
              const isSelected = currentFilter === f.type;
              return (
                <button
                  key={f.type}
                  onClick={() => {
                    setCurrentFilter(f.type);
                    if (navigator.vibrate) navigator.vibrate(20);
                  }}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 scale-[1.03]'
                      : 'bg-slate-800/85 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {f.icon}
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom Save & Continue Action Bar */}
          <div className="flex items-center justify-between px-3.5 pb-4 pt-1.5 gap-2.5">
            {!isEditingExistingPage && (
              <button
                onClick={() => handleSave(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition active:scale-95 border border-slate-700/80"
              >
                <Plus className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="truncate">Scanează Următoarea</span>
              </button>
            )}

            <button
              onClick={() => handleSave(false)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-xl shadow-emerald-500/25 transition active:scale-95"
            >
              <Check className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5] flex-shrink-0" />
              <span className="truncate">
                {isEditingExistingPage ? 'Salvează Modificarea' : 'Finalizează Pagina'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
