import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Crop,
  Sliders,
  Eraser,
  Sparkles,
  Download
} from 'lucide-react';
import type { DocumentPage } from '../db';

interface ZoomablePreviewModalProps {
  pages: DocumentPage[];
  initialPageIndex?: number;
  documentTitle: string;
  onClose: () => void;
  onEditCrop?: (page: DocumentPage) => void;
  onEditFilter?: (page: DocumentPage) => void;
  onEditRetouch?: (page: DocumentPage) => void;
  onOcr?: (page: DocumentPage) => void;
}

export const ZoomablePreviewModal: React.FC<ZoomablePreviewModalProps> = ({
  pages,
  initialPageIndex = 0,
  documentTitle,
  onClose,
  onEditCrop,
  onEditFilter,
  onEditRetouch,
  onOcr
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(initialPageIndex);
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch pinch-to-zoom tracking
  const initialPinchDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentPage = pages[currentPageIndex] || pages[0];

  // Reset zoom when switching pages
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [currentPageIndex]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(5, Number((prev + 0.5).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(1, Number((prev - 0.5).toFixed(2)));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Double tap to toggle zoom between 1x and 2.5x
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
          setPosition({ x: offsetX, y: offsetY });
        }
      }
    }
    lastTapRef.current = now;
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((prev) => {
      const next = Math.min(5, Math.max(1, Number((prev + delta).toFixed(2))));
      if (next === 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Mouse Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || scale <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Handling (Pinch & Pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      initialPinchDistRef.current = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      initialScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleDoubleTap(touch.clientX, touch.clientY);
      if (scale > 1) {
        setIsDragging(true);
        setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const ratio = dist / initialPinchDistRef.current;
      const newScale = Math.min(5, Math.max(1, Number((initialScaleRef.current * ratio).toFixed(2))));
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null;
    setIsDragging(false);
  };

  // Page switching
  const handlePrevPage = () => {
    if (currentPageIndex > 0) setCurrentPageIndex(currentPageIndex - 1);
  };

  const handleNextPage = () => {
    if (currentPageIndex < pages.length - 1) setCurrentPageIndex(currentPageIndex + 1);
  };

  // Download page image
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentPage.processedImage || currentPage.originalImage;
    link.download = `${documentTitle.replace(/\s+/g, '_')}_pag_${currentPageIndex + 1}.jpg`;
    link.click();
  };

  if (!currentPage) return null;

  return (
    <div className="fixed inset-0 z-50 h-dvh bg-black/95 flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="glass-header pt-safe z-30">
        <div className="max-w-5xl mx-auto w-full flex items-center justify-between px-3.5 sm:px-6 pt-3 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
              title="Închide vizualizatorul"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
                {documentTitle}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                Pagina {currentPageIndex + 1} din {pages.length} • {currentPage.filter.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Quick Page Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {onEditCrop && (
              <button
                onClick={() => {
                  onClose();
                  onEditCrop(currentPage);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                title="Ajustează colțurile"
              >
                <Crop className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Colțuri</span>
              </button>
            )}

            {onEditFilter && (
              <button
                onClick={() => {
                  onClose();
                  onEditFilter(currentPage);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                title="Schimbă filtrul"
              >
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Filtru</span>
              </button>
            )}

            {onEditRetouch && (
              <button
                onClick={() => {
                  onClose();
                  onEditRetouch(currentPage);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                title="Radieră pete & Cenzurare"
              >
                <Eraser className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Retuș</span>
              </button>
            )}

            {onOcr && (
              <button
                onClick={() => {
                  onClose();
                  onOcr(currentPage);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition"
                title="Extrage text OCR"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">OCR</span>
              </button>
            )}

            <button
              onClick={handleDownload}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition"
              title="Descarcă poza HD"
            >
              <Download className="w-4 h-4 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Zoomable Canvas / Image Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      >
        <div
          style={{
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out'
          }}
          className="relative max-w-full max-h-full flex items-center justify-center will-change-transform"
        >
          <img
            src={currentPage.processedImage || currentPage.originalImage}
            alt={`Pagina ${currentPageIndex + 1}`}
            className="max-w-[92vw] max-h-[72dvh] sm:max-h-[78dvh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-none"
            draggable={false}
          />
        </div>

        {/* Previous Page Arrow (Desktop / Floating) */}
        {currentPageIndex > 0 && (
          <button
            onClick={handlePrevPage}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-white/10 text-white shadow-xl transition active:scale-90 z-20"
            title="Pagina anterioară"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Next Page Arrow (Desktop / Floating) */}
        {currentPageIndex < pages.length - 1 && (
          <button
            onClick={handleNextPage}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-white/10 text-white shadow-xl transition active:scale-90 z-20"
            title="Pagina următoare"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Hint banner when scale is 1 */}
        {scale === 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="px-3.5 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-[11px] font-semibold text-slate-300 shadow-lg">
              Atinge de 2 ori sau apropie/depărtează degetele pentru Zoom HD
            </span>
          </div>
        )}
      </div>

      {/* Floating Bottom Zoom & Navigation Dock */}
      <div className="glass-header border-t border-slate-800/80 pb-safe z-30">
        <div className="max-w-md mx-auto w-full px-4 py-2.5 flex items-center justify-between gap-2">
          {/* Page switch arrows for mobile */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevPage}
              disabled={currentPageIndex === 0}
              className="p-2 rounded-xl bg-slate-800/90 text-slate-300 disabled:opacity-30 hover:text-white transition active:scale-95"
              title="Pagina anterioară"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-200 px-1 whitespace-nowrap">
              {currentPageIndex + 1} / {pages.length}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPageIndex === pages.length - 1}
              className="p-2 rounded-xl bg-slate-800/90 text-slate-300 disabled:opacity-30 hover:text-white transition active:scale-95"
              title="Pagina următoare"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 px-2 py-1 rounded-2xl shadow-lg">
            <button
              onClick={handleZoomOut}
              disabled={scale <= 1}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
              title="Micșorează"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetZoom}
              className="px-2 py-1 rounded-lg text-xs font-extrabold text-emerald-400 hover:bg-emerald-500/20 transition"
              title="Resetează la 100%"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              onClick={handleZoomIn}
              disabled={scale >= 5}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition"
              title="Mărește"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((val) => (
              <button
                key={val}
                onClick={() => {
                  setScale(val);
                  if (val === 1) setPosition({ x: 0, y: 0 });
                }}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition ${
                  Math.round(scale) === val
                    ? 'bg-emerald-500 text-slate-950 font-extrabold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {val}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
