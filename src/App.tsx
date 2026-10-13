import React, { useState, useEffect, useCallback } from 'react';
import {
  db,
  createDocument,
  addPageToDocument,
  type DocumentItem,
  type DocumentCorners,
  type FilterType
} from './db';
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

  // Start new scan from Home (create fresh document or prepare batch)
  const handleStartNewScanCamera = () => {
    setTargetDocId(null); // will create new doc on first page save
    setBatchQueue([]);
    setActiveView('camera');
  };

  // Import from Gallery
  const handleStartGalleryImport = (files: FileList, existingDocId?: string) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

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
        if (count === fileList.length) {
          if (loaded.length === 1) {
            setCurrentRawImage(loaded[0]);
            setActiveView('crop');
          } else {
            // Batch queue
            setCurrentRawImage(loaded[0]);
            setBatchQueue(loaded.slice(1));
            setActiveView('crop');
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Add page to an existing document via Camera
  const handleAddPageCamera = (docId: string) => {
    setTargetDocId(docId);
    setBatchQueue([]);
    setActiveView('camera');
  };

  // Camera single image captured
  const handleCameraCapture = (imageDataUrl: string) => {
    setCurrentRawImage(imageDataUrl);
    setActiveView('crop');
  };

  // Camera batch images captured
  const handleCameraBatchComplete = (images: string[]) => {
    if (images.length === 0) return;
    setCurrentRawImage(images[0]);
    setBatchQueue(images.slice(1));
    setActiveView('crop');
  };

  // Crop confirmed -> go to filter view
  const handleConfirmCrop = (warpedCanvas: HTMLCanvasElement, corners: DocumentCorners) => {
    setCurrentWarpedCanvas(warpedCanvas);
    setCurrentCorners(corners);
    setActiveView('filter');
  };

  // Filter confirmed -> save page to Dexie
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

    // 1. Determine or create document
    let docId = targetDocId;
    if (!docId) {
      const newDoc = await createDocument();
      docId = newDoc.id;
      setTargetDocId(docId);
    }

    // 2. Add page
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

    // 3. Handle next step: batch queue or user chose "Scanează Următoarea"
    if (batchQueue.length > 0) {
      const nextImg = batchQueue[0];
      setBatchQueue((prev) => prev.slice(1));
      setCurrentRawImage(nextImg);
      setActiveView('crop');
    } else if (continueAdding) {
      // User tapped "Scanează Următoarea"
      setActiveView('camera');
    } else {
      // Done -> open document detail view
      setActiveView('detail');
    }
  };

  // Cancel crop
  const handleCancelCrop = () => {
    if (batchQueue.length > 0) {
      const next = batchQueue[0];
      setBatchQueue((prev) => prev.slice(1));
      setCurrentRawImage(next);
      setActiveView('crop');
    } else if (targetDocId) {
      setActiveView('detail');
    } else {
      setActiveView('home');
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col justify-start">
      {/* 1. Home Dashboard View */}
      {activeView === 'home' && (
        <HomeView
          documents={documents}
          onOpenDocument={(id) => {
            setTargetDocId(id);
            setActiveView('detail');
          }}
          onNewScanCamera={handleStartNewScanCamera}
          onNewScanGallery={(files) => handleStartGalleryImport(files)}
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
          onBack={() => {
            setTargetDocId(null);
            setActiveView('home');
            refreshDocuments();
          }}
          onAddPageCamera={(docId) => handleAddPageCamera(docId)}
          onAddPageGallery={(docId, files) => handleStartGalleryImport(files, docId)}
          onEditPageCrop={(page) => {
            setCurrentRawImage(page.originalImage);
            setActiveView('crop');
          }}
        />
      )}

      {/* 6. Signature & Stamp Studio View */}
      {activeView === 'studio' && (
        <SignatureStudioView
          documents={documents}
          onBack={() => setActiveView('home')}
          onOpenDocumentToSign={(docId) => {
            setTargetDocId(docId);
            setActiveView('detail');
          }}
        />
      )}
    </div>
  );
};

export default App;
