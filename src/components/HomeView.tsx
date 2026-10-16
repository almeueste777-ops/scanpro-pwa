import React, { useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Search,
  FileText,
  Calendar,
  Layers,
  MoreVertical,
  Trash2,
  Edit2,
  PenTool,
  RefreshCw,
  CreditCard,
  BookOpen,
  GitMerge,
  CheckSquare,
  Square,
  X,
  Lock,
  Unlock,
  Shield
} from 'lucide-react';
import {
  deleteDocument,
  createDocument,
  addPageToDocument,
  db,
  type DocumentItem
} from '../db';
import { PwaInstallPrompt } from './PwaInstallPrompt';
import { IdCardScannerModal } from './IdCardScannerModal';
import { VaultBackupModal, VAULT_PIN_STORAGE_KEY } from './VaultBackupModal';
import { APP_VERSION, forceAppUpdate } from '../utils/version';

interface HomeViewProps {
  documents: DocumentItem[];
  onOpenDocument: (id: string) => void;
  onNewScanCamera: () => void;
  onNewScanGallery: (files: FileList) => void;
  onNewBookScan: (file: File) => void;
  onOpenSignatureStudio: () => void;
  onRefresh: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  documents,
  onOpenDocument,
  onNewScanCamera,
  onNewScanGallery,
  onNewBookScan,
  onOpenSignatureStudio,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('toate');
  const [activeMenuDocId, setActiveMenuDocId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showIdCardModal, setShowIdCardModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);

  // Merge Documents state
  const [isMergeMode, setIsMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  // Full-text OCR search index (documentId -> concatenated ocrText)
  const [ocrIndex, setOcrIndex] = useState<Record<string, string>>({});

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bookInputRef = React.useRef<HTMLInputElement>(null);

  // Load OCR text map so search bar searches inside scanned text too
  useEffect(() => {
    db.pages.toArray().then((allPages) => {
      const map: Record<string, string> = {};
      for (const p of allPages) {
        if (p.ocrText) {
          map[p.documentId] = (map[p.documentId] || '') + ' ' + p.ocrText.toLowerCase();
        }
      }
      setOcrIndex(map);
    });
  }, [documents]);

  // Helper to verify PIN if document is locked
  const verifyDocPin = (doc: DocumentItem, actionLabel: string): boolean => {
    if (!doc.isLocked) return true;
    const savedPin = localStorage.getItem(VAULT_PIN_STORAGE_KEY);
    if (!savedPin) return true;
    const entered = prompt(`Documentul „${doc.title}” este protejat. Introdu PIN-ul (4 cifre) pentru ${actionLabel}:`);
    if (entered !== savedPin) {
      if (entered !== null) alert('Cod PIN incorect!');
      return false;
    }
    return true;
  };

  // Filtered documents (matches title OR OCR text inside pages — excluding OCR leak for locked docs)
  const filtered = documents.filter((doc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesTitle = doc.title.toLowerCase().includes(q);
    const matchesOcr = !doc.isLocked && q.length > 1 && (ocrIndex[doc.id] || '').includes(q);
    const matchesSearch = !q || matchesTitle || matchesOcr;
    const matchesCategory =
      selectedCategory === 'toate' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetDoc = documents.find((d) => d.id === docId);
    if (targetDoc && !verifyDocPin(targetDoc, 'ștergere')) return;
    if (confirm('Ești sigur că vrei să ștergi acest document?')) {
      await deleteDocument(docId);
      setActiveMenuDocId(null);
      onRefresh();
    }
  };

  const handleRename = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!verifyDocPin(doc, 'redenumire')) return;
    const newName = prompt('Introdu noul nume pentru document:', doc.title);
    if (newName && newName.trim()) {
      await db.documents.update(doc.id, {
        title: newName.trim(),
        updatedAt: Date.now()
      });
      setActiveMenuDocId(null);
      onRefresh();
    }
  };

  // Lock / Unlock document with 4-digit PIN
  const handleToggleLock = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const savedPin = localStorage.getItem(VAULT_PIN_STORAGE_KEY);
    if (!savedPin) {
      setActiveMenuDocId(null);
      setShowVaultModal(true);
      return;
    }

    if (doc.isLocked) {
      if (!verifyDocPin(doc, 'deblocare')) return;
      await db.documents.update(doc.id, { isLocked: false, updatedAt: Date.now() });
    } else {
      await db.documents.update(doc.id, { isLocked: true, updatedAt: Date.now() });
    }
    setActiveMenuDocId(null);
    onRefresh();
  };

  const handleOpenDocWithPinCheck = (doc: DocumentItem) => {
    if (!verifyDocPin(doc, 'deschidere')) return;
    onOpenDocument(doc.id);
  };

  const handleForceUpdate = async () => {
    setIsUpdating(true);
    await forceAppUpdate();
  };

  // Toggle selection in Merge Mode
  const toggleMergeSelect = (docId: string) => {
    const targetDoc = documents.find((d) => d.id === docId);
    if (targetDoc && !selectedForMerge.includes(docId) && !verifyDocPin(targetDoc, 'îmbinare')) {
      return;
    }
    setSelectedForMerge((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  // Execute Merge of selected documents
  const handleConfirmMerge = async () => {
    if (selectedForMerge.length < 2 || isMerging) return;
    setIsMerging(true);
    try {
      const firstDoc = documents.find((d) => d.id === selectedForMerge[0]);
      const mergedTitle = prompt(
        'Numele noului document îmbinat:',
        `${firstDoc?.title || 'Dosar'} (Îmbinat)`
      );
      if (!mergedTitle) {
        setIsMerging(false);
        return;
      }

      const newDoc = await createDocument(mergedTitle.trim(), firstDoc?.category || 'general');

      for (const docId of selectedForMerge) {
        const docPages = await db.pages
          .where('documentId')
          .equals(docId)
          .sortBy('pageNumber');
        for (const p of docPages) {
          await addPageToDocument(newDoc.id, {
            originalImage: p.originalImage,
            processedImage: p.processedImage,
            thumbnail: p.thumbnail,
            width: p.width,
            height: p.height,
            corners: p.corners,
            filter: p.filter,
            brightness: p.brightness,
            contrast: p.contrast,
            rotation: p.rotation,
            ocrText: p.ocrText
          });
        }
      }

      setIsMergeMode(false);
      setSelectedForMerge([]);
      await onRefresh();
      onOpenDocument(newDoc.id);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-32 select-none">
      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-xl tracking-tighter">
              SP
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-black text-white tracking-tight">ScanPro</h1>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-extrabold text-[10px] tracking-wider uppercase border border-emerald-500/30">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">AI Document Scanner & VIP Suite</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Seif PIN & Backup Button */}
            <button
              onClick={() => setShowVaultModal(true)}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition active:scale-95"
              title="Seif PIN 4 Cifre & Backup / Restaurare Completă"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Seif & Backup</span>
            </button>

            {/* Merge Documents Toggle */}
            {documents.length >= 2 && (
              <button
                onClick={() => {
                  setIsMergeMode(!isMergeMode);
                  setSelectedForMerge([]);
                }}
                className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition active:scale-95 ${
                  isMergeMode
                    ? 'bg-purple-500 text-slate-950 border-purple-400'
                    : 'bg-slate-800/90 text-purple-300 border-purple-500/30 hover:bg-slate-800'
                }`}
                title="Îmbină mai multe documente într-un singur PDF"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{isMergeMode ? 'Anulează' : 'Îmbină'}</span>
              </button>
            )}

            {/* Cache-Buster Force Update Button */}
            <button
              onClick={handleForceUpdate}
              disabled={isUpdating}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900/90 px-2.5 py-1.5 rounded-xl border border-amber-500/40 transition active:scale-95 shadow-md shadow-amber-950"
              title="Apasă pentru a goli cache-ul și reîncărca cea mai recentă versiune"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isUpdating ? 'Se curăță...' : 'Actualizează'}</span>
            </button>
          </div>
        </div>

        {/* Search Bar (Titles + OCR Content) */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Caută după nume sau text din interiorul paginilor (OCR)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          {[
            { id: 'toate', label: 'Toate' },
            { id: 'facturi', label: 'Facturi & Bonuri' },
            { id: 'contracte', label: 'Contracte' },
            { id: 'acte', label: 'Acte Identitate' },
            { id: 'notite', label: 'Notițe' },
            { id: 'general', label: 'General' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Merge Mode Floating Banner */}
      {isMergeMode && (
        <div className="mx-4 mt-3 p-3 rounded-2xl bg-purple-950/90 border border-purple-500/50 flex items-center justify-between gap-2 shadow-xl">
          <div className="text-xs text-purple-200 font-semibold">
            Selectează cel puțin 2 documente ({selectedForMerge.length} selectate)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmMerge}
              disabled={selectedForMerge.length < 2 || isMerging}
              className="px-3.5 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-slate-950 font-black text-xs transition"
            >
              {isMerging ? 'Se îmbină...' : 'Combină în 1 Dosar'}
            </button>
            <button
              onClick={() => {
                setIsMergeMode(false);
                setSelectedForMerge([]);
              }}
              className="p-1.5 rounded-lg text-purple-300 hover:bg-purple-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PWA Install Banner */}
      <div className="pt-3">
        <PwaInstallPrompt />
      </div>

      {/* VIP SMART SCANNER MODES RIBBON */}
      <div className="px-4 mb-3">
        <div className="grid grid-cols-3 gap-2.5">
          {/* 1. Semnături & Ștampile */}
          <div
            onClick={onOpenSignatureStudio}
            className="p-3 rounded-2xl bg-gradient-to-br from-blue-950/90 via-slate-900 to-indigo-950/90 border border-blue-500/40 shadow-lg cursor-pointer hover:border-blue-400 active:scale-95 transition flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <PenTool className="w-5 h-5" />
              </div>
              <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white text-[8px] font-black uppercase">
                STUDIO
              </span>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-white leading-tight">
                Semnături & Ștampile
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                Aplică pe PDF
              </p>
            </div>
          </div>

          {/* 2. Act ID / Buletin Față-Verso pe A4 */}
          <div
            onClick={() => setShowIdCardModal(true)}
            className="p-3 rounded-2xl bg-gradient-to-br from-amber-950/80 via-slate-900 to-orange-950/80 border border-amber-500/40 shadow-lg cursor-pointer hover:border-amber-400 active:scale-95 transition flex flex-col justify-between gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[8px] font-black uppercase">
                A4 VIP
              </span>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-white leading-tight">
                Act ID / Card A4
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                Față + Verso pe 1 foaie
              </p>
            </div>
          </div>

          {/* 3. Mod Carte / Caiet (Despicare 2 Pagini) */}
          <div
            onClick={() => bookInputRef.current?.click()}
            className="p-3 rounded-2xl bg-gradient-to-br from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/40 shadow-lg cursor-pointer hover:border-emerald-400 active:scale-95 transition flex flex-col justify-between gap-2"
          >
            <input
              type="file"
              ref={bookInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) onNewBookScan(e.target.files[0]);
              }}
            />
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[8px] font-black uppercase">
                2 PAG
              </span>
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-white leading-tight">
                Scanare Carte
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                Separă automat 2 pagini
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Documents Grid Area */}
      <div className="flex-1 px-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3 shadow-xl">
              <FileText className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              {searchQuery ? 'Niciun document găsit' : 'Nu ai documente scanate încă'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {searchQuery
                ? 'Încearcă alt termen de căutare.'
                : 'Apasă pe „Scanează” pentru detecție automată AI a colțurilor și albire Magic Color Pro.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onNewScanCamera}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-xl shadow-emerald-500/25 active:scale-95 transition flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>Scanează Document</span>
              </button>
              <button
                onClick={() => setShowIdCardModal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs active:scale-95 transition flex items-center gap-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>Act ID A4</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 pt-1">
            {filtered.map((doc) => {
              const isSelectedMerge = selectedForMerge.includes(doc.id);
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    if (isMergeMode) {
                      toggleMergeSelect(doc.id);
                    } else {
                      handleOpenDocWithPinCheck(doc);
                    }
                  }}
                  className={`group relative bg-slate-900 border rounded-2xl overflow-hidden shadow-lg transition cursor-pointer flex flex-col ${
                    isSelectedMerge
                      ? 'border-purple-400 ring-2 ring-purple-500/40'
                      : doc.isLocked
                        ? 'border-amber-500/50 hover:border-amber-400'
                        : 'border-slate-800/90 hover:border-emerald-500/50'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden">
                    {doc.thumbnail ? (
                      <img
                        src={doc.thumbnail}
                        alt={doc.title}
                        className={`w-full h-full object-cover transition duration-300 ${
                          doc.isLocked ? 'blur-lg scale-110 opacity-40' : 'group-hover:scale-105'
                        }`}
                      />
                    ) : (
                      <FileText className="w-12 h-12 text-slate-700" />
                    )}

                    {/* Locked PIN Overlay */}
                    {doc.isLocked && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 backdrop-blur-sm">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 mb-1.5 shadow-lg">
                          <Lock className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-black/60 px-2 py-0.5 rounded-md border border-amber-500/30">
                          Protejat PIN
                        </span>
                      </div>
                    )}

                    {/* Page Count Badge */}
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-bold text-white border border-white/10 flex items-center gap-1 shadow-md">
                      <Layers className="w-3 h-3 text-emerald-400" />
                      <span>{doc.pageCount}</span>
                    </span>

                    {/* Merge Checkbox or 3-Dots Menu */}
                    {isMergeMode ? (
                      <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-purple-950/90 text-purple-300 border border-purple-400/50">
                        {isSelectedMerge ? (
                          <CheckSquare className="w-4 h-4 text-purple-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuDocId(activeMenuDocId === doc.id ? null : doc.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition shadow-md"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Menu */}
                  {activeMenuDocId === doc.id && !isMergeMode && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-10 right-2 z-30 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1 w-40 animate-in fade-in duration-150"
                    >
                      <button
                        onClick={(e) => handleToggleLock(doc, e)}
                        className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-slate-800 flex items-center gap-2 font-semibold"
                      >
                        {doc.isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Deblochează PIN</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span>Blochează cu PIN</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => handleRename(doc, e)}
                        className="w-full px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Redenumește</span>
                      </button>
                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        className="w-full px-3 py-2 text-left text-xs text-rose-400 hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span>Șterge</span>
                      </button>
                    </div>
                  )}

                  {/* Document Info */}
                  <div className="p-3 bg-slate-900 flex-1 flex flex-col justify-between">
                    <h3 className="text-xs font-bold text-white truncate mb-1 flex items-center gap-1" title={doc.title}>
                      {doc.isLocked && <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      <span className="truncate">{doc.title}</span>
                    </h3>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {new Date(doc.updatedAt).toLocaleDateString('ro-RO')}
                      </span>
                      <span className="uppercase text-[9px] font-semibold text-emerald-400/90 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {doc.category}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modern Bottom Dock */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 border-t border-slate-800/90 backdrop-blur-xl px-4 py-3 z-30 flex items-center justify-between gap-2 max-w-lg mx-auto sm:rounded-t-2xl">
        {/* Left: Gallery Import */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onNewScanGallery(e.target.files);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition"
          title="Importă din galerie"
        >
          <ImageIcon className="w-5 h-5 text-purple-400" />
          <span className="text-[10px] font-bold">Galerie</span>
        </button>

        {/* Center: Big Shutter Camera Scan */}
        <button
          onClick={onNewScanCamera}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500 text-slate-950 font-black text-xs shadow-xl shadow-emerald-500/30 hover:opacity-95 active:scale-95 transition border-2 border-emerald-300/40"
        >
          <Camera className="w-5 h-5 stroke-[2.5]" />
          <span>Scanează</span>
        </button>

        {/* Right: Semnături & Ștampile Studio */}
        <button
          onClick={onOpenSignatureStudio}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-slate-400 hover:text-blue-300 hover:bg-slate-800/80 active:scale-95 transition"
          title="Deschide studiul de semnături și ștampile"
        >
          <PenTool className="w-5 h-5 text-blue-400" />
          <span className="text-[10px] font-bold text-blue-300">Semnături</span>
        </button>
      </div>

      {/* ID Card Front/Back A4 Scanner Modal */}
      {showIdCardModal && (
        <IdCardScannerModal
          onClose={() => setShowIdCardModal(false)}
          onSaveIdDocument={async (title, compositeDataUrl, thumbnailUrl) => {
            const newDoc = await createDocument(title, 'acte');
            await addPageToDocument(newDoc.id, {
              originalImage: compositeDataUrl,
              processedImage: compositeDataUrl,
              thumbnail: thumbnailUrl,
              width: 1240,
              height: 1754,
              filter: 'magic',
              brightness: 0,
              contrast: 0,
              rotation: 0
            });
            await onRefresh();
            onOpenDocument(newDoc.id);
          }}
        />
      )}

      {/* Vault PIN & Full Backup Modal */}
      {showVaultModal && (
        <VaultBackupModal
          onClose={() => setShowVaultModal(false)}
          onDataRestored={onRefresh}
        />
      )}
    </div>
  );
};
