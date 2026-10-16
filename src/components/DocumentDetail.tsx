import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Share2,
  Trash2,
  RotateCw,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Edit2,
  Check,
  ChevronLeft as ArrowLeft,
  ChevronRight as ArrowRight,
  Maximize2,
  PenTool,
  Eraser,
  Wand2,
  Cpu,
  LayoutGrid
} from 'lucide-react';
import {
  db,
  deletePage,
  deleteDocument,
  addPageToDocument,
  type DocumentItem,
  type DocumentPage,
  type FilterType,
  type SignatureItem
} from '../db';
import {
  loadImage,
  warpPerspective,
  applyFilter,
  rotateCanvas,
  createThumbnail
} from '../utils/imageProcessing';
import { PdfExportModal } from './PdfExportModal';
import { OcrModal } from './OcrModal';
import { SignDocumentView } from './SignDocumentView';
import { PageRetouchModal } from './PageRetouchModal';
import { SmartDataModal } from './SmartDataModal';
import { CollageModal } from './CollageModal';

interface DocumentDetailProps {
  documentId: string;
  initialSignatureToPlace?: SignatureItem | null;
  onClearInitialSignature?: () => void;
  onBack: () => void;
  onAddPageCamera: (docId: string) => void;
  onAddPageGallery: (docId: string, files: FileList) => void;
  onEditPageCrop: (page: DocumentPage) => void;
}

export const DocumentDetail: React.FC<DocumentDetailProps> = ({
  documentId,
  initialSignatureToPlace = null,
  onClearInitialSignature,
  onBack,
  onAddPageCamera,
  onAddPageGallery,
  onEditPageCrop
}) => {
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSmartDataModal, setShowSmartDataModal] = useState(false);
  const [showCollageModal, setShowCollageModal] = useState(false);
  const [ocrTargetPage, setOcrTargetPage] = useState<DocumentPage | null>(null);
  const [retouchTargetPage, setRetouchTargetPage] = useState<DocumentPage | null>(null);
  const [fullPreviewPage, setFullPreviewPage] = useState<DocumentPage | null>(null);
  const [signViewPageIndex, setSignViewPageIndex] = useState<number | null>(
    initialSignatureToPlace ? 0 : null
  );
  const [isBatchFiltering, setIsBatchFiltering] = useState<boolean>(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load document & pages from Dexie
  const loadData = useCallback(async () => {
    const d = await db.documents.get(documentId);
    if (!d) return;
    setDoc(d);
    setTitleInput(d.title);

    const p = await db.pages.where('documentId').equals(documentId).sortBy('pageNumber');
    setPages(p);
  }, [documentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Rename Title
  const handleSaveTitle = async () => {
    if (!titleInput.trim() || !doc) return;
    await db.documents.update(documentId, {
      title: titleInput.trim(),
      updatedAt: Date.now()
    });
    setIsEditingTitle(false);
    loadData();
  };

  // Change Category
  const handleCategoryChange = async (cat: DocumentItem['category']) => {
    await db.documents.update(documentId, {
      category: cat,
      updatedAt: Date.now()
    });
    loadData();
  };

  // Batch Apply Filter to ALL pages in the document
  const handleApplyBatchFilter = async (targetFilter: FilterType) => {
    if (pages.length === 0 || isBatchFiltering) return;
    setIsBatchFiltering(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const rawImg = await loadImage(p.originalImage);
        let baseCanvas: HTMLCanvasElement;
        if (p.corners) {
          baseCanvas = warpPerspective(rawImg, p.corners);
        } else {
          baseCanvas = document.createElement('canvas');
          baseCanvas.width = rawImg.width;
          baseCanvas.height = rawImg.height;
          baseCanvas.getContext('2d')!.drawImage(rawImg, 0, 0);
        }
        const rotated = rotateCanvas(baseCanvas, p.rotation || 0);
        const filtered = applyFilter(rotated, targetFilter, p.brightness || 0, p.contrast || 0);
        const nextProcessed = filtered.toDataURL('image/jpeg', 0.94);
        const nextThumb = createThumbnail(filtered, 320);

        await db.pages.update(p.id, {
          processedImage: nextProcessed,
          thumbnail: nextThumb,
          width: filtered.width,
          height: filtered.height,
          filter: targetFilter
        });

        if (i === 0) {
          await db.documents.update(documentId, {
            thumbnail: nextThumb,
            updatedAt: Date.now()
          });
        }
      }
      await loadData();
    } finally {
      setIsBatchFiltering(false);
    }
  };

  // Rotate a page 90 degrees
  const handleRotatePage = async (page: DocumentPage) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const rotated = rotateCanvas(canvas, 90);
      const nextProcessed = rotated.toDataURL('image/jpeg', 0.94);
      const nextThumb = createThumbnail(rotated, 320);

      await db.pages.update(page.id, {
        processedImage: nextProcessed,
        thumbnail: nextThumb,
        width: rotated.width,
        height: rotated.height,
        rotation: ((page.rotation || 0) + 90) % 360
      });

      if (page.pageNumber === 1) {
        await db.documents.update(documentId, {
          thumbnail: nextThumb,
          updatedAt: Date.now()
        });
      } else {
        await db.documents.update(documentId, { updatedAt: Date.now() });
      }

      loadData();
    };
    img.src = page.processedImage || page.originalImage;
  };

  // Reorder pages
  const handleMovePage = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) return;

    const pageA = pages[index];
    const pageB = pages[targetIndex];

    await db.pages.update(pageA.id, { pageNumber: targetIndex + 1 });
    await db.pages.update(pageB.id, { pageNumber: index + 1 });

    // If Page 1 changed position, update document cover thumbnail
    if (index === 0 || targetIndex === 0) {
      const newFirstPage = targetIndex === 0 ? pageA : pageB;
      await db.documents.update(documentId, {
        thumbnail: newFirstPage.thumbnail,
        updatedAt: Date.now()
      });
    } else {
      await db.documents.update(documentId, { updatedAt: Date.now() });
    }

    loadData();
  };

  // Delete page (or delete entire document if it was the last page)
  const handleDeletePage = async (pageId: string) => {
    if (!confirm('Ești sigur că vrei să ștergi această pagină?')) return;
    if (pages.length <= 1) {
      await deleteDocument(documentId);
      onBack();
      return;
    }
    await deletePage(pageId);
    await loadData();
  };

  // Delete entire document
  const handleDeleteDoc = async () => {
    if (!confirm('Ești sigur că vrei să ștergi întregul document?')) return;
    await deleteDocument(documentId);
    onBack();
  };

  if (!doc) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 select-none">
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                  autoFocus
                  className="bg-slate-800 text-white text-base font-semibold px-2.5 py-1 rounded-lg outline-none border border-emerald-500 w-full"
                />
                <button
                  onClick={handleSaveTitle}
                  className="p-1.5 rounded-lg bg-emerald-500 text-slate-950"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="flex items-center gap-1.5 cursor-pointer group"
              >
                <h1 className="text-base font-bold text-white truncate max-w-[200px] sm:max-w-md">
                  {doc.title}
                </h1>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 flex-shrink-0" />
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              {pages.length} {pages.length === 1 ? 'pagină' : 'pagini'} • Actualizat{' '}
              {new Date(doc.updatedAt).toLocaleDateString('ro-RO')}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Smart Data Extractor (IBAN, CUI, Total, CNP) */}
            <button
              onClick={() => setShowSmartDataModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-950/90 hover:bg-purple-900 text-purple-300 border border-purple-500/40 rounded-xl font-bold text-xs active:scale-95 transition"
              title="Extractor AI Date: IBAN, CUI, Total Factură, CNP, CSV/vCard"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Date & IBAN</span>
              <span className="sm:hidden">IBAN/AI</span>
            </button>

            {/* Collage A4 Button */}
            <button
              onClick={() => setShowCollageModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/40 rounded-xl font-bold text-xs active:scale-95 transition"
              title="Colaj A4 (pune 2, 4 sau 6 bonuri/pagini pe o singură foaie A4)"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
              <span>Colaj A4</span>
            </button>

            {/* Export PDF Button */}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition"
            >
              <Share2 className="w-4 h-4 stroke-[2.5]" />
              <span>PDF</span>
            </button>

            {/* Delete Document */}
            <button
              onClick={handleDeleteDoc}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
              title="Șterge document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Chips + Batch Filter Bar */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pt-3 pb-1 no-scrollbar">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'general', label: 'General' },
              { id: 'facturi', label: 'Facturi' },
              { id: 'contracte', label: 'Contracte' },
              { id: 'acte', label: 'Acte ID' },
              { id: 'notite', label: 'Notițe' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id as any)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition whitespace-nowrap ${
                  doc.category === cat.id
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Batch Filter Quick Buttons */}
          {pages.length > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
              <Wand2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">
                Filtru toate:
              </span>
              {(
                [
                  { id: 'magic', label: 'Magic' },
                  { id: 'bw', label: 'Alb-Negru' },
                  { id: 'sharp', label: 'Clar' },
                  { id: 'original', label: 'Orig' }
                ] as { id: FilterType; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  disabled={isBatchFiltering}
                  onClick={() => handleApplyBatchFilter(f.id)}
                  className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-[10px] font-bold text-slate-300 transition whitespace-nowrap"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pages Grid */}
      <div className="p-4 flex-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {pages.map((page, idx) => (
            <div
              key={page.id}
              className="group relative bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-lg hover:border-slate-700 transition flex flex-col"
            >
              {/* Thumbnail Container */}
              <div
                onClick={() => setFullPreviewPage(page)}
                className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center cursor-pointer overflow-hidden"
              >
                <img
                  src={page.thumbnail || page.processedImage || page.originalImage}
                  alt={`Pagina ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                />

                {/* Page Number Badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[11px] font-bold text-white border border-white/10">
                  {idx + 1}
                </span>

                {/* Filter Badge */}
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-emerald-950/80 backdrop-blur-md text-[10px] font-semibold text-emerald-300 border border-emerald-500/30 uppercase">
                  {page.filter}
                </span>

                {/* Tap to expand overlay */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <Maximize2 className="w-6 h-6 text-white" />
                </div>
              </div>

              {/* Action Toolbar per page */}
              <div className="p-2 bg-slate-900 flex items-center justify-between border-t border-slate-800/80">
                <div className="flex items-center gap-0.5">
                  {/* Reorder Left */}
                  <button
                    onClick={() => handleMovePage(idx, 'left')}
                    disabled={idx === 0}
                    className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800"
                    title="Mută la stânga"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Reorder Right */}
                  <button
                    onClick={() => handleMovePage(idx, 'right')}
                    disabled={idx === pages.length - 1}
                    className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-20 hover:bg-slate-800"
                    title="Mută la dreapta"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Rotate 90 */}
                  <button
                    onClick={() => handleRotatePage(page)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Rotește 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Smart Eraser / Highlighter / Redact */}
                  <button
                    onClick={() => setRetouchTargetPage(page)}
                    className="p-1 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-slate-800"
                    title="Radieră pete, Evidențiator & Cenzurare CNP"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                  </button>

                  {/* OCR Button */}
                  <button
                    onClick={() => setOcrTargetPage(page)}
                    className="p-1 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-slate-800"
                    title="Extrage text (OCR)"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  {/* Sign & Stamp Page */}
                  <button
                    onClick={() => setSignViewPageIndex(idx)}
                    className="p-1 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-slate-800"
                    title="Semnează / Ștampilează"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Delete Page */}
                <button
                  onClick={() => handleDeletePage(page.id)}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                  title="Șterge pagina"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add Page Card */}
          <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl aspect-[3/4] flex flex-col items-center justify-center p-4 gap-3 bg-slate-900/30 transition">
            <span className="text-xs font-semibold text-slate-400">Adaugă Pagină</span>
            <div className="flex gap-2">
              <button
                onClick={() => onAddPageCamera(documentId)}
                className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 transition active:scale-95"
                title="Fă poză"
              >
                <Camera className="w-5 h-5" />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) onAddPageGallery(documentId, e.target.files);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white transition active:scale-95"
                title="Alege din galerie"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 border-t border-slate-800 px-4 py-3 backdrop-blur-md flex items-center justify-between gap-2 z-30">
        <button
          onClick={() => onAddPageCamera(documentId)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs active:scale-95 transition"
        >
          <Camera className="w-4 h-4 text-emerald-400" />
          <span>+ Poză</span>
        </button>

        <button
          onClick={() => {
            if (pages[0]) setRetouchTargetPage(pages[0]);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs active:scale-95 transition"
        >
          <Eraser className="w-4 h-4 text-amber-400" />
          <span>Radieră / Marker</span>
        </button>

        <button
          onClick={() => setSignViewPageIndex(0)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 font-semibold text-xs active:scale-95 transition"
        >
          <PenTool className="w-4 h-4 text-blue-400" />
          <span>Semnează</span>
        </button>

        <button
          onClick={() => setShowExportModal(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 px-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition"
        >
          <Share2 className="w-4 h-4 stroke-[2.5]" />
          <span>Export PDF</span>
        </button>
      </div>

      {/* Fullscreen Page Preview Modal */}
      {fullPreviewPage && (
        <div
          onClick={() => setFullPreviewPage(null)}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
        >
          <img
            src={fullPreviewPage.processedImage || fullPreviewPage.originalImage}
            alt="Fullscreen"
            className="max-w-full max-h-[82vh] object-contain rounded-lg shadow-2xl"
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFullPreviewPage(null);
                onEditPageCrop(fullPreviewPage);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Ajustează Colțuri
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const target = fullPreviewPage;
                setFullPreviewPage(null);
                setRetouchTargetPage(target);
              }}
              className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
            >
              <Eraser className="w-3.5 h-3.5" />
              Radieră / Marker
            </button>
            <button
              onClick={() => setFullPreviewPage(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showExportModal && (
        <PdfExportModal
          document={doc}
          pages={pages}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {ocrTargetPage && (
        <OcrModal
          pageImage={ocrTargetPage.processedImage || ocrTargetPage.originalImage}
          initialText={ocrTargetPage.ocrText}
          onSaveText={async (text) => {
            await db.pages.update(ocrTargetPage.id, { ocrText: text });
            loadData();
          }}
          onClose={() => setOcrTargetPage(null)}
        />
      )}

      {retouchTargetPage && (
        <PageRetouchModal
          pageImage={retouchTargetPage.processedImage || retouchTargetPage.originalImage}
          onSave={async (newProcessed, newThumb) => {
            await db.pages.update(retouchTargetPage.id, {
              processedImage: newProcessed,
              thumbnail: newThumb
            });
            if (retouchTargetPage.pageNumber === 1) {
              await db.documents.update(documentId, {
                thumbnail: newThumb,
                updatedAt: Date.now()
              });
            }
            await loadData();
          }}
          onClose={() => setRetouchTargetPage(null)}
        />
      )}

      {showSmartDataModal && (
        <SmartDataModal
          document={doc}
          pages={pages}
          onPagesUpdated={loadData}
          onClose={() => setShowSmartDataModal(false)}
        />
      )}

      {showCollageModal && (
        <CollageModal
          pages={pages}
          onSaveCollagePage={async (collageDataUrl, thumbnailUrl) => {
            await addPageToDocument(documentId, {
              originalImage: collageDataUrl,
              processedImage: collageDataUrl,
              thumbnail: thumbnailUrl,
              width: 1240,
              height: 1754,
              filter: 'magic',
              brightness: 0,
              contrast: 0,
              rotation: 0
            });
            await loadData();
          }}
          onClose={() => setShowCollageModal(false)}
        />
      )}

      {signViewPageIndex !== null && pages.length > 0 && (
        <SignDocumentView
          document={doc}
          pages={pages}
          initialPageIndex={signViewPageIndex}
          initialSignatureItem={initialSignatureToPlace}
          onClose={() => {
            setSignViewPageIndex(null);
            if (onClearInitialSignature) onClearInitialSignature();
          }}
          onSaved={() => {
            setSignViewPageIndex(null);
            if (onClearInitialSignature) onClearInitialSignature();
            loadData();
          }}
        />
      )}
    </div>
  );
};
