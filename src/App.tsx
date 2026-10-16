import React, { useState, useEffect, useCallback } from 'react';
import {
  db,
  createDocument,
  addPageToDocument,
  type DocumentItem,
  type DocumentCorners,
  type FilterType,
  type SignatureItem
} from './db';
import {
  loadImage,
  detectDocumentCornersSync,
  warpPerspective,
  applyFilter,
  rotateCanvas,
  createThumbnail
} from './utils/imageProcessing';
import { HomeView } from './components/HomeView';
import { CameraView } from './components/CameraView';
import { CropView } from './components/CropView';
import { FilterView } from './components/FilterView';
import { DocumentDetail } from './components/DocumentDetail';
import { SignatureStudioView } from './components/SignatureStudioView';

export const App: React.FC = () => {
  // Navigation / views
  const [activeView, setActiveView] = useState<
    'home' | 'camera' | 'crop' | 'filter' | 'detail' | 'studio'
  >('home');

  // Documents list
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // Current active document for multi-page scanning
  const [targetDocId, setTargetDocId] = useState<string | null>(null);

  // Active scan processing states
  const [currentRawImage, setCurrentRawImage] = useState<string | null>(null);
  const [currentWarpedCanvas, setCurrentWarpedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [currentCorners, setCurrentCorners] = useState<DocumentCorners | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pendingSignatureItem, setPendingSignatureItem] = useState<SignatureItem | null>(null);
  const [isAutoProcessing, setIsAutoProcessing] = useState<boolean>(false);

  // Batch queue for scanning multiple pages
  const [batchQueue, setBatchQueue] = useState<string[]>([]);

  // Load all documents from IndexedDB
  const refreshDocuments = useCallback(async () => {
    const list = await db.documents.orderBy('updatedAt').reverse().toArray();
    setDocuments(list);
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  /**
   * CamScanner Pro Automatic Pipeline:
   * Automatically detects the 4 corners of the sheet, straightens perspective,
   * and opens the enhanced Magic Color scan directly.
   */
  const runAutoScanPipeline = useCallback(
    async (imageDataUrl: string, preDetectedCorners?: DocumentCorners) => {
      setIsAutoProcessing(true);
      setCurrentRawImage(imageDataUrl);
      try {
        const img = await loadImage(imageDataUrl);
        const corners =
          preDetectedCorners ||
          detectDocumentCornersSync(img, img.width, img.height).corners;
        const warped = warpPerspective(img, corners);
        setCurrentCorners(corners);
        setCurrentWarpedCanvas(warped);
        setActiveView('filter');
      } catch (err) {
        console.error('Auto-scan error, falling back to manual crop:', err);
        setActiveView('crop');
      } finally {
        setIsAutoProcessing(false);
      }
    },
    []
  );

  /**
   * Book Mode (2-Page Spread Auto-Splitter):
   * Detects the open book spread, warps perspective, splits along the center spine
   * into Left Page + Right Page, applies Magic Color Pro, and saves both pages!
   */
  const handleNewBookScan = async (file: File) => {
    setIsAutoProcessing(true);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const img = await loadImage(dataUrl);
      const detected = detectDocumentCornersSync(img, img.width, img.height);
      let warped = warpPerspective(img, detected.corners);

      // Ensure landscape orientation so spine is vertical in the middle
      if (warped.height > warped.width) {
        warped = rotateCanvas(warped, 90);
      }

      const halfW = Math.floor(warped.width / 2);
      const fullH = warped.height;

      const leftCanvas = document.createElement('canvas');
      leftCanvas.width = halfW;
      leftCanvas.height = fullH;
      leftCanvas.getContext('2d')!.drawImage(warped, 0, 0, halfW, fullH, 0, 0, halfW, fullH);

      const rightCanvas = document.createElement('canvas');
      rightCanvas.width = halfW;
      rightCanvas.height = fullH;
      rightCanvas
        .getContext('2d')!
        .drawImage(warped, halfW, 0, halfW, fullH, 0, 0, halfW, fullH);

      const dateStr = new Date().toLocaleDateString('ro-RO');
      const newDoc = await createDocument(`Carte Scanată (${dateStr})`, 'notite');

      for (const pageCanvas of [leftCanvas, rightCanvas]) {
        const rawPageUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
        const enhanced = applyFilter(pageCanvas, 'magic', 0, 0);
        const procUrl = enhanced.toDataURL('image/jpeg', 0.92);
        const thumbUrl = createThumbnail(enhanced, 320);

        await addPageToDocument(newDoc.id, {
          originalImage: rawPageUrl,
          processedImage: procUrl,
          thumbnail: thumbUrl,
          width: enhanced.width,
          height: enhanced.height,
          filter: 'magic',
          brightness: 0,
          contrast: 0,
          rotation: 0
        });
      }

      await refreshDocuments();
      setTargetDocId(newDoc.id);
      setActiveView('detail');
    } catch (e) {
      console.error('Book scan error:', e);
    } finally {
      setIsAutoProcessing(false);
    }
  };

  // Start new scan from Home
  const handleStartNewScanCamera = () => {
    setTargetDocId(null);
    setEditingPageId(null);
    setBatchQueue([]);
    setActiveView('camera');
  };

  // Import from Gallery -> Automatically detect corners, warp & enhance!
  const handleStartGalleryImport = (files: FileList, existingDocId?: string) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setEditingPageId(null);
    if (existingDocId) {
      setTargetDocId(existingDocId);
    } else {
      setTargetDocId(null);
    }

    const loaded: string[] = [];
    let count = 0;
    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          loaded.push(e.target.result as string);
        }
        count++;
        if (count === fileList.length && loaded.length > 0) {
          setBatchQueue(loaded.slice(1));
          runAutoScanPipeline(loaded[0]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Add page to an existing document via Camera
  const handleAddPageCamera = (docId: string) => {
    setTargetDocId(docId);
    setEditingPageId(null);
    setBatchQueue([]);
    setActiveView('camera');
  };

  // Camera single image captured -> Automatically frame & enhance!
  const handleCameraCapture = (imageDataUrl: string, detectedCorners?: DocumentCorners) => {
    setEditingPageId(null);
    runAutoScanPipeline(imageDataUrl, detectedCorners);
  };

  // Camera batch images captured -> Automatically frame & enhance first image
  const handleCameraBatchComplete = (images: string[]) => {
    if (images.length === 0) return;
    setEditingPageId(null);
    setBatchQueue(images.slice(1));
    runAutoScanPipeline(images[0]);
  };

  // Crop confirmed -> go to filter view
  const handleConfirmCrop = (warpedCanvas: HTMLCanvasElement, corners: DocumentCorners) => {
    setCurrentWarpedCanvas(warpedCanvas);
    setCurrentCorners(corners);
    setActiveView('filter');
  };

  // Filter confirmed -> save page to Dexie (or update existing page if editingPageId is set!)
  const handleSavePage = async (
    processedImage: string,
    thumbnail: string,
    filter: FilterType,
    brightness: number,
    contrast: number,
    rotation: number,
    continueAdding = false
  ) => {
    if (!currentRawImage) return;

    if (editingPageId && targetDocId) {
      // Update existing page in place instead of creating a duplicate!
      const existingPage = await db.pages.get(editingPageId);
      await db.pages.update(editingPageId, {
        processedImage,
        thumbnail,
        width: currentWarpedCanvas?.width || 1200,
        height: currentWarpedCanvas?.height || 1600,
        corners: currentCorners || undefined,
        filter,
        brightness,
        contrast,
        rotation
      });

      if (existingPage && existingPage.pageNumber === 1) {
        await db.documents.update(targetDocId, {
          thumbnail,
          updatedAt: Date.now()
        });
      } else {
        await db.documents.update(targetDocId, { updatedAt: Date.now() });
      }

      setEditingPageId(null);
      await refreshDocuments();
      setActiveView('detail');
      return;
    }

    let docId = targetDocId;
    if (!docId) {
      const newDoc = await createDocument();
      docId = newDoc.id;
      setTargetDocId(docId);
    }

    await addPageToDocument(docId, {
      originalImage: currentRawImage,
      processedImage,
      thumbnail,
      width: currentWarpedCanvas?.width || 1200,
      height: currentWarpedCanvas?.height || 1600,
      corners: currentCorners || undefined,
      filter,
      brightness,
      contrast,
      rotation
    });

    await refreshDocuments();

    if (batchQueue.length > 0) {
      const nextImg = batchQueue[0];
      setBatchQueue((prev) => prev.slice(1));
      runAutoScanPipeline(nextImg);
    } else if (continueAdding) {
      setActiveView('camera');
    } else {
      setActiveView('detail');
    }
  };

  // Cancel crop
  const handleCancelCrop = () => {
    setEditingPageId(null);
    if (batchQueue.length > 0) {
      const next = batchQueue[0];
      setBatchQueue((prev) => prev.slice(1));
      runAutoScanPipeline(next);
    } else if (targetDocId) {
      setActiveView('detail');
    } else {
      setActiveView('home');
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col justify-start">
      {/* Loading overlay during instant auto-scan */}
      {isAutoProcessing && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
          <p className="text-sm font-bold text-emerald-400 tracking-wide">
            Se încadrează și se curăță automat foaia...
          </p>
        </div>
      )}

      {/* 1. Home Dashboard View */}
      {activeView === 'home' && (
        <HomeView
          documents={documents}
          onOpenDocument={(id) => {
            setTargetDocId(id);
            setPendingSignatureItem(null);
            setActiveView('detail');
          }}
          onNewScanCamera={handleStartNewScanCamera}
          onNewScanGallery={(files) => handleStartGalleryImport(files)}
          onNewBookScan={handleNewBookScan}
          onOpenSignatureStudio={() => setActiveView('studio')}
          onRefresh={refreshDocuments}
        />
      )}

      {/* 2. Camera View */}
      {activeView === 'camera' && (
        <CameraView
          onCapture={handleCameraCapture}
          onBatchComplete={handleCameraBatchComplete}
          onClose={() => {
            if (targetDocId) {
              setActiveView('detail');
            } else {
              setActiveView('home');
            }
          }}
          isBatchMode={batchQueue.length > 0}
        />
      )}

      {/* 3. Crop & Perspective View */}
      {activeView === 'crop' && currentRawImage && (
        <CropView
          imageSrc={currentRawImage}
          initialCorners={currentCorners}
          onConfirmCrop={handleConfirmCrop}
          onCancel={handleCancelCrop}
        />
      )}

      {/* 4. Filter & Enhancement View */}
      {activeView === 'filter' && currentWarpedCanvas && (
        <FilterView
          warpedCanvas={currentWarpedCanvas}
          onSavePage={handleSavePage}
          onBackToCrop={() => setActiveView('crop')}
        />
      )}

      {/* 5. Document Multi-Page Detail View */}
      {activeView === 'detail' && targetDocId && (
        <DocumentDetail
          documentId={targetDocId}
          initialSignatureToPlace={pendingSignatureItem}
          onClearInitialSignature={() => setPendingSignatureItem(null)}
          onBack={() => {
            setTargetDocId(null);
            setPendingSignatureItem(null);
            setActiveView('home');
            refreshDocuments();
          }}
          onAddPageCamera={(docId) => handleAddPageCamera(docId)}
          onAddPageGallery={(docId, files) => handleStartGalleryImport(files, docId)}
          onEditPageCrop={(page) => {
            setEditingPageId(page.id);
            setCurrentRawImage(page.originalImage);
            setCurrentCorners(page.corners || null);
            setActiveView('crop');
          }}
        />
      )}

      {/* 6. Signature & Stamp Studio View */}
      {activeView === 'studio' && (
        <SignatureStudioView
          documents={documents}
          onBack={() => setActiveView('home')}
          onOpenDocumentToSign={(docId, sigItem) => {
            setTargetDocId(docId);
            setPendingSignatureItem(sigItem || null);
            setActiveView('detail');
          }}
        />
      )}
    </div>
  );
};

export default App;
