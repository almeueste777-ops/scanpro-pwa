import React, { useState } from 'react';
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
  ShieldCheck,
  PenTool,
  RefreshCw
} from 'lucide-react';
import { deleteDocument, db, type DocumentItem } from '../db';
import { PwaInstallPrompt } from './PwaInstallPrompt';
import { APP_VERSION, forceAppUpdate } from '../utils/version';

interface HomeViewProps {
  documents: DocumentItem[];
  onOpenDocument: (id: string) => void;
  onNewScanCamera: () => void;
  onNewScanGallery: (files: FileList) => void;
  onOpenSignatureStudio: () => void;
  onRefresh: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  documents,
  onOpenDocument,
  onNewScanCamera,
  onNewScanGallery,
  onOpenSignatureStudio,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('toate');
  const [activeMenuDocId, setActiveMenuDocId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Filtered documents
  const filtered = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'toate' || doc.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleDelete = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Ești sigur că vrei să ștergi acest document?')) {
      await deleteDocument(docId);
      setActiveMenuDocId(null);
      onRefresh();
    }
  };

  const handleRename = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const handleForceUpdate = async () => {
    setIsUpdating(true);
    await forceAppUpdate();
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
              <p className="text-[11px] text-slate-400">Scanner & Studio Semnături</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Cache-Buster Force Update Button */}
            <button
              onClick={handleForceUpdate}
              disabled={isUpdating}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/80 hover:bg-amber-900/90 px-2.5 py-1.5 rounded-xl border border-amber-500/40 transition active:scale-95 shadow-md shadow-amber-950"
              title="Apasă pentru a goli cache-ul și reîncărca cea mai recentă versiune"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Se curăță...' : 'Actualizează'}</span>
            </button>

            <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800/80 px-2 py-1.5 rounded-xl border border-slate-700/60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Privat</span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Caută în documente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition"
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

      {/* PWA Install Banner */}
      <div className="pt-3">
        <PwaInstallPrompt />
      </div>

      {/* PROMINENT FEATURE: Studio Semnături & Ștampile */}
      <div className="px-4 mb-2">
        <div
          onClick={onOpenSignatureStudio}
          className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/40 shadow-xl cursor-pointer hover:border-blue-400 active:scale-[0.99] transition flex items-center justify-between gap-3 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-105 transition flex-shrink-0 shadow-lg shadow-blue-500/10">
              <PenTool className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-white tracking-wide">
                  Semnături & Ștampile
                </h3>
                <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[9px] font-black uppercase shadow-sm">
                  NOU
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Desenează, scanează de pe foaie, importă sau generează ștampile oficiale
              </p>
            </div>
          </div>
          <button className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/25 flex-shrink-0 transition active:scale-95 whitespace-nowrap">
            Deschide Studio →
          </button>
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
                : 'Apasă butonul verde de mai jos pentru a scana prima foaie sau deschide studiul de semnături.'}
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
                onClick={onOpenSignatureStudio}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xl shadow-blue-500/25 active:scale-95 transition flex items-center gap-1.5"
              >
                <PenTool className="w-4 h-4" />
                <span>Semnături</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 pt-1">
            {filtered.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onOpenDocument(doc.id)}
                className="group relative bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-lg hover:border-emerald-500/50 transition cursor-pointer flex flex-col"
              >
                {/* Thumbnail */}
                <div className="relative aspect-[3/4] bg-slate-950 flex items-center justify-center overflow-hidden">
                  {doc.thumbnail ? (
                    <img
                      src={doc.thumbnail}
                      alt={doc.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <FileText className="w-12 h-12 text-slate-700" />
                  )}

                  {/* Page Count Badge */}
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-bold text-white border border-white/10 flex items-center gap-1 shadow-md">
                    <Layers className="w-3 h-3 text-emerald-400" />
                    <span>{doc.pageCount}</span>
                  </span>

                  {/* Quick 3-Dots Menu Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuDocId(activeMenuDocId === doc.id ? null : doc.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition shadow-md"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Dropdown Menu */}
                {activeMenuDocId === doc.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-10 right-2 z-30 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl py-1 w-36 animate-in fade-in duration-150"
                  >
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
                  <h3 className="text-xs font-bold text-white truncate mb-1" title={doc.title}>
                    {doc.title}
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
            ))}
          </div>
        )}
      </div>

      {/* Modern Bottom Dock with Dual Actions */}
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
    </div>
  );
};
