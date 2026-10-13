import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  PenTool,
  Stamp,
  Camera,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Plus,
  ShieldCheck,
  FileText
} from 'lucide-react';
import {
  type SignatureItem,
  type DocumentItem,
  getSignatures,
  deleteSignatureItem
} from '../db';
import { SignatureModal } from './SignatureModal';
import { APP_VERSION } from '../utils/version';

interface SignatureStudioViewProps {
  documents: DocumentItem[];
  onBack: () => void;
  onOpenDocumentToSign: (docId: string) => void;
}

export const SignatureStudioView: React.FC<SignatureStudioViewProps> = ({
  documents,
  onBack,
  onOpenDocumentToSign
}) => {
  const [activeTab, setActiveTab] = useState<'signature' | 'stamp'>('signature');
  const [items, setItems] = useState<SignatureItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalDefaultType, setModalDefaultType] = useState<'signature' | 'stamp'>('signature');
  const [selectedItemToUse, setSelectedItemToUse] = useState<SignatureItem | null>(null);

  const loadData = async () => {
    const list = await getSignatures(activeTab);
    setItems(list);
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Ești sigur că vrei să ștergi acest element?')) {
      await deleteSignatureItem(id);
      loadData();
    }
  };

  const handleOpenCreator = (type: 'signature' | 'stamp') => {
    setModalDefaultType(type);
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 select-none">
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 p-2 -ml-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ChevronLeft className="w-6 h-6" />
            <span className="text-sm font-semibold">Înapoi la Documente</span>
          </button>

          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
            {APP_VERSION} Activ
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <PenTool className="w-5 h-5 text-blue-400" />
              <span>Studio Semnături & Ștampile</span>
            </h1>
            <p className="text-xs text-slate-400">
              Creează și păstrează semnăturile și ștampilele tale pe telefon
            </p>
          </div>

          <button
            onClick={() => handleOpenCreator(activeTab)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 active:scale-95 transition"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Adaugă</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 gap-1.5 mt-3">
          <button
            onClick={() => setActiveTab('signature')}
            className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${
              activeTab === 'signature'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Semnături ({activeTab === 'signature' ? items.length : '...'})</span>
          </button>

          <button
            onClick={() => setActiveTab('stamp')}
            className={`flex-1 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${
              activeTab === 'stamp'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Stamp className="w-3.5 h-3.5" />
            <span>Ștampile ({activeTab === 'stamp' ? items.length : '...'})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 space-y-4 flex-1">
        {/* Creation Modes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div
            onClick={() => handleOpenCreator(activeTab)}
            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 cursor-pointer transition flex flex-col items-center text-center gap-1.5 group shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 group-hover:scale-110 transition">
              <PenTool className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Desenează</span>
            <span className="text-[10px] text-slate-400">Cu degetul pe ecran</span>
          </div>

          <div
            onClick={() => handleOpenCreator(activeTab)}
            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition flex flex-col items-center text-center gap-1.5 group shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 group-hover:scale-110 transition">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Scanează</span>
            <span className="text-[10px] text-slate-400">De pe o foaie de hârtie</span>
          </div>

          <div
            onClick={() => handleOpenCreator(activeTab)}
            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 cursor-pointer transition flex flex-col items-center text-center gap-1.5 group shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 group-hover:scale-110 transition">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Importă</span>
            <span className="text-[10px] text-slate-400">Din pozele din telefon</span>
          </div>

          <div
            onClick={() => handleOpenCreator('stamp')}
            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 cursor-pointer transition flex flex-col items-center text-center gap-1.5 group shadow-lg"
          >
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 group-hover:scale-110 transition">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-white">Șabloane</span>
            <span className="text-[10px] text-slate-400">Conform cu originalul etc.</span>
          </div>
        </div>

        {/* Saved Items Collection */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {activeTab === 'signature' ? 'Semnături Salvate' : 'Ștampile Salvate'} ({items.length})
            </span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              100% Privat pe telefon
            </span>
          </div>

          {items.length === 0 ? (
            <div className="p-10 text-center bg-slate-900/60 rounded-2xl border border-slate-800 border-dashed max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-400">
                {activeTab === 'signature' ? <PenTool className="w-7 h-7" /> : <Stamp className="w-7 h-7" />}
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                Nu ai nicio {activeTab === 'signature' ? 'semnătură' : 'ștampilă'} salvată
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Apasă pe butonul de mai sus pentru a desena, scana sau genera prima ta{' '}
                {activeTab === 'signature' ? 'semnătură' : 'ștampilă'}!
              </p>
              <button
                onClick={() => handleOpenCreator(activeTab)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition active:scale-95"
              >
                + Creează Acum
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItemToUse(item)}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-blue-500/60 rounded-2xl p-3.5 cursor-pointer transition flex flex-col justify-between shadow-lg"
                >
                  {/* Checkerboard preview */}
                  <div
                    className="w-full aspect-[2/1] rounded-xl flex items-center justify-center p-2 mb-2 overflow-hidden border border-slate-800"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                    }}
                  >
                    <img
                      src={item.imageData}
                      alt={item.name}
                      className="max-h-full max-w-full object-contain filter drop-shadow group-hover:scale-105 transition"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white truncate max-w-[110px]">
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {new Date(item.createdAt).toLocaleDateString('ro-RO')}
                      </p>
                    </div>

                    <button
                      onClick={(e) => handleDelete(item.id, e)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                      title="Șterge"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal to choose which document to apply the signature/stamp to */}
      {selectedItemToUse && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Aplică pe un Document:</span>
                <span className="text-blue-400 font-normal">"{selectedItemToUse.name}"</span>
              </h3>
              <button
                onClick={() => setSelectedItemToUse(null)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Alege documentul pe care vrei să aplici această{' '}
              {selectedItemToUse.type === 'signature' ? 'semnătură' : 'ștampilă'}:
            </p>

            {documents.length === 0 ? (
              <div className="p-4 bg-slate-950/60 rounded-xl text-center text-xs text-slate-400">
                Nu ai încă documente scanate. Scanează mai întâi o foaie!
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => {
                      const docId = doc.id;
                      setSelectedItemToUse(null);
                      onOpenDocumentToSign(docId);
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 text-left flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                          {doc.title}
                        </h4>
                        <span className="text-[10px] text-slate-400">
                          {doc.pageCount} pagini • {new Date(doc.updatedAt).toLocaleDateString('ro-RO')}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-400">Semnează →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Modal Creator */}
      {showModal && (
        <SignatureModal
          defaultType={modalDefaultType}
          onSelect={async () => {
            setShowModal(false);
            loadData();
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};
