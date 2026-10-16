import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  PenTool,
  Stamp,
  RotateCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  Layers
} from 'lucide-react';
import {
  type DocumentItem,
  type DocumentPage,
  type SignatureItem,
  db
} from '../db';
import {
  type PlacedOverlay,
  burnOverlaysOntoPage
} from '../utils/signatureProcessing';
import { createThumbnail, loadImage } from '../utils/imageProcessing';
import { SignatureModal } from './SignatureModal';

interface SignDocumentViewProps {
  document: DocumentItem;
  pages: DocumentPage[];
  initialPageIndex?: number;
  initialSignatureItem?: SignatureItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export const SignDocumentView: React.FC<SignDocumentViewProps> = ({
  document: docItem,
  pages,
  initialPageIndex = 0,
  initialSignatureItem = null,
  onClose,
  onSaved
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex);
  const [overlays, setOverlays] = useState<PlacedOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [applyToAllPages, setApplyToAllPages] = useState<boolean>(true);
  const [modalType, setModalType] = useState<'signature' | 'stamp' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const activePage = pages[currentPageIndex] || pages[0];

  // Dragging interaction state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle adding a signature or stamp from the modal
  const handleSelectSignatureItem = (item: SignatureItem) => {
    setModalType(null);

    // Smart default coordinates: signature bottom-right, stamp bottom-left
    const isSig = item.type === 'signature';
    const defaultX = isSig ? 0.72 : 0.28;
    const defaultY = 0.85;
    const defaultScale = isSig ? 0.28 : 0.24;

    const newOverlay: PlacedOverlay = {
      id: crypto.randomUUID(),
      signatureId: item.id,
      imageData: item.imageData,
      type: item.type,
      name: item.name,
      x: defaultX,
      y: defaultY,
      scale: defaultScale,
      rotation: isSig ? 0 : -5
    };

    setOverlays((prev) => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  // Automatically place initialSignatureItem if passed from SignatureStudioView
  useEffect(() => {
    if (initialSignatureItem && overlays.length === 0) {
      handleSelectSignatureItem(initialSignatureItem);
    }
  }, [initialSignatureItem]);

  // Dragging logic
  const handlePointerDown = (id: string, e: React.TouchEvent | React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOverlayId(id);
    setDraggingId(id);

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const overlay = overlays.find((o) => o.id === id);
    if (!overlay || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const pixelX = overlay.x * rect.width;
    const pixelY = overlay.y * rect.height;

    setDragOffset({
      x: clientX - (rect.left + pixelX),
      y: clientY - (rect.top + pixelY)
    });
  };

  const handlePointerMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!draggingId || !containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const rect = containerRef.current.getBoundingClientRect();

    // Calculate normalized coordinates clamped inside bounds
    const newPixelX = clientX - rect.left - dragOffset.x;
    const newPixelY = clientY - rect.top - dragOffset.y;

    const normX = Math.max(0.05, Math.min(0.95, newPixelX / rect.width));
    const normY = Math.max(0.05, Math.min(0.95, newPixelY / rect.height));

    setOverlays((prev) =>
      prev.map((o) => (o.id === draggingId ? { ...o, x: normX, y: normY } : o))
    );
  };

  const handlePointerUp = () => {
    setDraggingId(null);
  };

  // Adjust scale of selected overlay
  const handleScaleChange = (delta: number) => {
    if (!selectedOverlayId) return;
    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id === selectedOverlayId) {
          const nextScale = Math.max(0.1, Math.min(0.8, o.scale + delta));
          return { ...o, scale: nextScale };
        }
        return o;
      })
    );
  };

  // Rotate selected overlay 15 degrees
  const handleRotate = () => {
    if (!selectedOverlayId) return;
    setOverlays((prev) =>
      prev.map((o) => {
        if (o.id === selectedOverlayId) {
          return { ...o, rotation: (o.rotation + 15) % 360 };
        }
        return o;
      })
    );
  };

  // Remove selected overlay
  const handleRemoveOverlay = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedOverlayId === id) {
      setSelectedOverlayId(null);
    }
  };

  // BURN & SAVE CHANGES TO DOCUMENT
  const handleSaveDocument = async () => {
    if (overlays.length === 0) {
      onClose();
      return;
    }

    try {
      setIsSaving(true);

      const targetPages = applyToAllPages ? pages : [activePage];

      for (let i = 0; i < targetPages.length; i++) {
        const page = targetPages[i];
        const baseSrc = page.processedImage || page.originalImage;

        // Burn overlays onto page
        const updatedProcessed = await burnOverlaysOntoPage(baseSrc, overlays);

        // Generate thumbnail
        const pageImg = await loadImage(updatedProcessed);
        const canvas = document.createElement('canvas');
        canvas.width = pageImg.width;
        canvas.height = pageImg.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(pageImg, 0, 0);
        const updatedThumb = createThumbnail(canvas, 320);

        // Update database
        await db.pages.update(page.id, {
          processedImage: updatedProcessed,
          thumbnail: updatedThumb
        });

        // Update document cover if first page
        if (page.pageNumber === 1) {
          await db.documents.update(docItem.id, {
            thumbnail: updatedThumb,
            updatedAt: Date.now()
          });
        }
      }

      await db.documents.update(docItem.id, { updatedAt: Date.now() });

      setIsSaving(false);
      onSaved();
    } catch (err) {
      console.error('Error saving signature to document:', err);
      setIsSaving(false);
    }
  };

  const selectedItem = overlays.find((o) => o.id === selectedOverlayId);

  return (
    <div
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 pt-8 pb-3 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md z-30">
        <button
          onClick={onClose}
          className="flex items-center gap-1 p-2 -ml-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="text-sm font-medium">Anulează</span>
        </button>

        <div className="text-center">
          <h2 className="text-base font-bold text-white tracking-wide">Semnare & Ștampilare</h2>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            {pages.length > 1 && (
              <button
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentPageIndex === 0}
                className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-20"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <span>
              Pagina {currentPageIndex + 1} din {pages.length}
            </span>
            {pages.length > 1 && (
              <button
                onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                disabled={currentPageIndex === pages.length - 1}
                className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-20"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={handleSaveDocument}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition disabled:opacity-50"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{isSaving ? 'Se aplică...' : 'Aplică'}</span>
        </button>
      </div>

      {/* Main Document Canvas Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center p-3 overflow-hidden bg-slate-950/70">
        {/* Document Page Container (tightly wraps image for 1:1 normalized coordinates) */}
        <div
          ref={containerRef}
          className="relative inline-block shadow-2xl rounded-lg overflow-hidden border border-slate-700 bg-white"
        >
          {/* Base Page Image */}
          <img
            src={activePage.processedImage || activePage.originalImage}
            alt="Pagina document"
            className="max-h-[60vh] max-w-full w-auto h-auto pointer-events-none select-none block"
          />

          {/* Placed Signature / Stamp Overlays */}
          {overlays.map((item) => {
            const isSelected = item.id === selectedOverlayId;

            return (
              <div
                key={item.id}
                onMouseDown={(e) => handlePointerDown(item.id, e)}
                onTouchStart={(e) => handlePointerDown(item.id, e)}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.scale * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`
                }}
                className={`absolute cursor-move touch-none group select-none transition-shadow ${
                  isSelected
                    ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-transparent shadow-2xl'
                    : 'hover:ring-1 hover:ring-emerald-400/60'
                }`}
              >
                {/* Overlay Image */}
                <img
                  src={item.imageData}
                  alt={item.name}
                  className="w-full h-auto object-contain pointer-events-none block drop-shadow-md"
                />

                {/* Selection Controls when active */}
                {isSelected && (
                  <>
                    {/* Delete button (top-right) */}
                    <button
                      onClick={(e) => handleRemoveOverlay(item.id, e)}
                      className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg active:scale-90"
                      title="Șterge"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Type badge (bottom-left) */}
                    <span className="absolute -bottom-3 left-0 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white uppercase border border-white/20">
                      {item.type === 'signature' ? 'Semnătură' : 'Ștampilă'}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Item Floating Toolbar (Resize / Rotate) */}
        {selectedItem && (
          <div className="absolute top-4 inset-x-4 max-w-sm mx-auto bg-slate-900/90 border border-slate-700/80 rounded-2xl px-4 py-2.5 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-2 z-20">
            <span className="text-xs font-bold text-white truncate max-w-[100px]">
              {selectedItem.name}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleScaleChange(-0.04)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                title="Micșorează"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleScaleChange(0.04)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                title="Mărește"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleRotate}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                title="Rotește 15°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleRemoveOverlay(selectedItem.id)}
                className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-950"
                title="Șterge"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tool Bar & Controls */}
      <div className="bg-slate-900/95 border-t border-slate-800/90 backdrop-blur-md z-30 p-4 space-y-3">
        {/* Toggle Option: Apply to entire document (all pages) */}
        {pages.length > 1 && (
          <div
            onClick={() => setApplyToAllPages(!applyToAllPages)}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 cursor-pointer hover:bg-slate-800 transition"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                  applyToAllPages
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                    : 'border-slate-500 bg-slate-900'
                }`}
              >
                {applyToAllPages && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Pune pe întreg documentul
                </span>
                <span className="text-[10px] text-slate-400">
                  Aplică semnătura & ștampila pe toate cele {pages.length} pagini în același loc
                </span>
              </div>
            </div>
            <Layers className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          </div>
        )}

        {/* Buttons to add Signature or Stamp */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setModalType('signature')}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-bold text-xs shadow-md active:scale-95 transition"
          >
            <PenTool className="w-4 h-4 text-blue-400" />
            <span>+ Adaugă Semnătură</span>
          </button>

          <button
            onClick={() => setModalType('stamp')}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-bold text-xs shadow-md active:scale-95 transition"
          >
            <Stamp className="w-4 h-4 text-rose-400" />
            <span>+ Adaugă Ștampilă</span>
          </button>
        </div>
      </div>

      {/* Signature & Stamp Creator/Picker Modal */}
      {modalType && (
        <SignatureModal
          defaultType={modalType}
          onSelect={handleSelectSignatureItem}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
};
