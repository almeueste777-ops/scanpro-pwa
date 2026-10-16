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

  const totalPages = documents.reduce((acc, d) => acc + (d.pageCount || 0), 0);
  const hasVaultPin = Boolean(localStorage.getItem(VAULT_PIN_STORAGE_KEY));

  return (
    <div className="min-h-dvh bg-luxury-aurora text-slate-100 flex flex-col pb-32 select-none">
      {/* Sticky Glass Header */}
      <header className="sticky top-0 z-30 glass-header pt-safe">
        <div className="max-w-5xl mx-auto w-full px-3.5 sm:px-6 pt-3 pb-3">
          {/* Top Brand & Action Row */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 text-slate-950 font-black text-lg sm:text-xl tracking-tighter flex-shrink-0 ring-1 ring-white/20">
                SP
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight truncate">
                    ScanPro
                  </h1>
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-extrabold text-[9px] sm:text-[10px] tracking-wider uppercase border border-emerald-500/30 flex-shrink-0">
                    {APP_VERSION}
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                  {documents.length} {documents.length === 1 ? 'dosar' : 'dosare'} • {totalPages}{' '}
                  {totalPages === 1 ? 'pagină' : 'pagini'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Seif PIN & Backup Button */}
              <button
                onClick={() => setShowVaultModal(true)}
                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition active:scale-95 shadow-sm"
                title="Seif PIN 4 Cifre & Backup / Restaurare Completă"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>Seif</span>
                <span className="hidden md:inline">& Backup</span>
              </button>

              {/* Merge Documents Toggle */}
              {documents.length >= 2 && (
                <button
                  onClick={() => {
                    setIsMergeMode(!isMergeMode);
                    setSelectedForMerge([]);
                  }}
                  className={`flex items-center gap-1 text-[11px] font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border transition active:scale-95 ${
                    isMergeMode
                      ? 'bg-purple-500 text-slate-950 border-purple-400 shadow-lg shadow-purple-500/20'
                      : 'bg-slate-900/90 text-purple-300 border-purple-500/30 hover:bg-slate-800'
                  }`}
                  title="Îmbină mai multe documente într-un singur PDF"
                >
                  <GitMerge className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{isMergeMode ? 'Anulează' : 'Îmbină'}</span>
                </button>
              )}

              {/* Cache-Buster Force Update Button */}
              <button
                onClick={handleForceUpdate}
                disabled={isUpdating}
                className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300 bg-amber-950/70 hover:bg-amber-900/80 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-amber-500/35 transition active:scale-95"
                title="Apasă pentru a goli cache-ul și reîncărca cea mai recentă versiune"
              >
                <RefreshCw className={`w-3.5 h-3.5 flex-shrink-0 ${isUpdating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isUpdating ? 'Se curăță...' : 'Actualizează'}
                </span>
              </button>
            </div>
          </div>

          {/* Search Bar (Titles + OCR Content) */}
          <div className="relative mb-2.5">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Caută documente sau cuvinte din pagini (OCR)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/85 border border-white/[0.08] rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20 transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Categories Pill Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
            {[
              { id: 'toate', label: 'Toate' },
              { id: 'facturi', label: 'Facturi & Bonuri' },
              { id: 'contracte', label: 'Contracte' },
              { id: 'acte', label: 'Acte ID' },
              { id: 'notite', label: 'Notițe' },
              { id: 'general', label: 'General' }
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`text-xs px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900/75 text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Centered Container */}
      <main className="max-w-5xl mx-auto w-full flex-1 px-3.5 sm:px-6 pt-3 space-y-4">
        {/* Merge Mode Floating Banner */}
        {isMergeMode && (
          <div className="p-3.5 rounded-2xl bg-purple-950/90 border border-purple-500/50 flex flex-wrap items-center justify-between gap-2 shadow-xl">
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
        <PwaInstallPrompt />

        {/* VIP BENTO GRID (2x2 on mobile, 4 columns on tablet/desktop — fits every screen!) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* 1. Semnături & Ștampile */}
          <div
            onClick={onOpenSignatureStudio}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-950/75 via-slate-900/90 to-indigo-950/75 border border-blue-500/35 hover:border-blue-400/70 shadow-lg cursor-pointer active:scale-[0.98] transition flex flex-col justify-between gap-2.5 group"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 group-hover:scale-105 transition">
                <PenTool className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-[9px] font-extrabold uppercase tracking-wider">
                STUDIO
              </span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug">
                Semnături & Ștampile
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">
                Desenează, scanează & aplică
              </p>
            </div>
          </div>

          {/* 2. Act ID / Buletin Față-Verso pe A4 */}
          <div
            onClick={() => setShowIdCardModal(true)}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-950/75 via-slate-900/90 to-orange-950/75 border border-amber-500/35 hover:border-amber-400/70 shadow-lg cursor-pointer active:scale-[0.98] transition flex flex-col justify-between gap-2.5 group"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition">
                <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider">
                A4 VIP
              </span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug">
                Act ID / Card pe A4
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">
                Față + Verso pe o coală A4
              </p>
            </div>
          </div>

          {/* 3. Mod Carte / Caiet (Despicare 2 Pagini) */}
          <div
            onClick={() => bookInputRef.current?.click()}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/75 via-slate-900/90 to-teal-950/75 border border-emerald-500/35 hover:border-emerald-400/70 shadow-lg cursor-pointer active:scale-[0.98] transition flex flex-col justify-between gap-2.5 group"
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
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[9px] font-extrabold uppercase tracking-wider">
                2 PAGINI
              </span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug">
                Scanare Carte
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">
                Desparte automat 2 pagini
              </p>
            </div>
          </div>

          {/* 4. Seif PIN & Arhivă Backup */}
          <div
            onClick={() => setShowVaultModal(true)}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-950/75 via-slate-900/90 to-fuchsia-950/75 border border-purple-500/35 hover:border-purple-400/70 shadow-lg cursor-pointer active:scale-[0.98] transition flex flex-col justify-between gap-2.5 group"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                  hasVaultPin
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    : 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                }`}
              >
                {hasVaultPin ? 'PIN ACTIV' : 'BACKUP'}
              </span>
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-white leading-snug">
                Seif PIN & Backup
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">
                Protecție PIN & export arhivă
              </p>
            </div>
          </div>
        </section>

        {/* Main Documents Grid Area */}
        <section className="pt-1">
          {filtered.length === 0 ? (
            <div className="glass-card rounded-3xl flex flex-col items-center justify-center py-12 px-6 text-center max-w-md mx-auto my-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-3.5 shadow-xl">
                <FileText className="w-8 h-8 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-1">
                {searchQuery ? 'Niciun document găsit' : 'Arhiva ta ScanPro este pregătită'}
              </h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                {searchQuery
                  ? 'Încearcă alt termen de căutare sau schimbă categoria selectată.'
                  : 'Apasă pe „Scanează” pentru detecție automată AI a colțurilor și albire Magic Color Pro ca la imprimantă.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                <button
                  onClick={onNewScanCamera}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs shadow-xl shadow-emerald-500/25 active:scale-95 transition flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 stroke-[2.5]" />
                  <span>Scanează Document</span>
                </button>
                <button
                  onClick={() => setShowIdCardModal(true)}
                  className="px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 font-bold text-xs active:scale-95 transition flex items-center gap-1.5"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Act ID pe A4</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
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
                    className={`group relative glass-card rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer flex flex-col ${
                      isSelectedMerge
                        ? 'border-purple-400 ring-2 ring-purple-500/40 scale-[0.99]'
                        : doc.isLocked
                          ? 'border-amber-500/45 hover:border-amber-400'
                          : 'hover:border-emerald-500/50 hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden">
                      {doc.thumbnail ? (
                        <img
                          src={doc.thumbnail}
                          alt={doc.title}
                          className={`w-full h-full object-cover transition duration-300 ${
                            doc.isLocked ? 'blur-lg scale-110 opacity-35' : 'group-hover:scale-105'
                          }`}
                        />
                      ) : (
                        <FileText className="w-12 h-12 text-slate-700" />
                      )}

                      {/* Locked PIN Overlay */}
                      {doc.isLocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/45 backdrop-blur-sm">
                          <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 mb-1.5 shadow-lg">
                            <Lock className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-black/70 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                            Protejat PIN
                          </span>
                        </div>
                      )}

                      {/* Page Count Badge */}
                      <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-bold text-white border border-white/15 flex items-center gap-1 shadow-md">
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
                          className="absolute top-2 right-2 p-1.5 rounded-xl bg-black/65 hover:bg-black/90 text-white backdrop-blur-md transition shadow-md border border-white/10"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Dropdown Menu */}
                    {activeMenuDocId === doc.id && !isMergeMode && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-11 right-2 z-30 bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 rounded-2xl shadow-2xl py-1.5 w-44 animate-in fade-in duration-150"
                      >
                        <button
                          onClick={(e) => handleToggleLock(doc, e)}
                          className="w-full px-3.5 py-2 text-left text-xs text-amber-300 hover:bg-slate-800/80 flex items-center gap-2 font-semibold"
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
                          className="w-full px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800/80 flex items-center gap-2"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Redenumește</span>
                        </button>
                        <button
                          onClick={(e) => handleDelete(doc.id, e)}
                          className="w-full px-3.5 py-2 text-left text-xs text-rose-400 hover:bg-slate-800/80 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Șterge</span>
                        </button>
                      </div>
                    )}

                    {/* Document Info */}
                    <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between border-t border-white/[0.05]">
                      <h3
                        className="text-xs sm:text-sm font-bold text-white truncate mb-1.5 flex items-center gap-1"
                        title={doc.title}
                      >
                        {doc.isLocked && (
                          <Lock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{doc.title}</span>
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {new Date(doc.updatedAt).toLocaleDateString('ro-RO')}
                        </span>
                        <span className="uppercase text-[9px] font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded-md border border-emerald-500/25">
                          {doc.category}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Floating Glass Bottom Dock — Centered & Framed on All Screens */}
      <div className="fixed bottom-0 inset-x-0 z-30 px-3.5 pb-safe pt-2 pointer-events-none">
        <div className="max-w-md mx-auto glass-dock rounded-3xl p-2 flex items-center justify-between gap-2 pointer-events-auto">
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
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl text-slate-300 hover:text-white hover:bg-white/[0.06] active:scale-95 transition"
            title="Importă din galerie"
          >
            <ImageIcon className="w-5 h-5 text-purple-400" />
            <span className="text-[10px] font-bold">Galerie</span>
          </button>

          {/* Center: Primary Shutter Camera Scan */}
          <button
            onClick={onNewScanCamera}
            className="flex-[1.35] flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/30 hover:brightness-105 active:scale-95 transition ring-1 ring-white/30"
          >
            <Camera className="w-5 h-5 stroke-[2.5]" />
            <span>Scanează</span>
          </button>

          {/* Right: Semnături & Ștampile Studio */}
          <button
            onClick={onOpenSignatureStudio}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl text-slate-300 hover:text-blue-300 hover:bg-white/[0.06] active:scale-95 transition"
            title="Deschide studiul de semnături și ștampile"
          >
            <PenTool className="w-5 h-5 text-blue-400" />
            <span className="text-[10px] font-bold text-blue-300">Semnături</span>
          </button>
        </div>
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
