import React, { useState } from 'react';
import {
  X,
  Share2,
  Download,
  FileText,
  CheckCircle2,
  Settings2,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import type { DocumentItem, DocumentPage } from '../db';
import {
  generatePdfBlob,
  downloadBlob,
  sharePdfFile,
  type PdfExportOptions
} from '../utils/pdfExport';

interface PdfExportModalProps {
  document: DocumentItem;
  pages: DocumentPage[];
  onClose: () => void;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  document: docItem,
  pages,
  onClose
}) => {
  const [fileName, setFileName] = useState(
    docItem.title.replace(/[/\\?%*:|"<>]/g, '_') || 'Document_ScanPro'
  );
  const [pageSize, setPageSize] = useState<'a4' | 'fit' | 'letter'>('a4');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');
  const [marginMm, setMarginMm] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExport = async (mode: 'share' | 'download') => {
    try {
      setIsGenerating(true);
      setErrorMsg(null);
      setExportSuccess(null);

      const options: PdfExportOptions = {
        fileName,
        pageSize,
        quality,
        marginMm
      };

      const pdfBlob = await generatePdfBlob(docItem, pages, options, (current, total) => {
        setProgressText(`Procesare pagina ${current} din ${total}...`);
      });

      if (mode === 'share') {
        setProgressText('Deschidere meniu partajare...');
        const shared = await sharePdfFile(pdfBlob, `${fileName}.pdf`, fileName);
        if (shared) {
          setExportSuccess('Documentul a fost pregătit pentru partajare!');
        }
      } else {
        downloadBlob(pdfBlob, `${fileName}.pdf`);
        setExportSuccess('PDF-ul a fost descărcat cu succes!');
      }

      setTimeout(() => {
        setIsGenerating(false);
        setProgressText('');
      }, 1000);
    } catch (err: any) {
      console.error('PDF Export error:', err);
      setErrorMsg(err.message || 'Eroare la generarea PDF-ului.');
      setIsGenerating(false);
    }
  };

  // Download individual pages as JPEG images
  const handleDownloadImages = () => {
    pages.forEach((page, idx) => {
      const link = window.document.createElement('a');
      link.href = page.processedImage || page.originalImage;
      link.download = `${fileName}_Pagina_${idx + 1}.jpg`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    });
    setExportSuccess('Imaginile au fost descărcate!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Export & Partajare PDF</h3>
              <p className="text-xs text-slate-400">
                {pages.length} {pages.length === 1 ? 'pagină' : 'pagini'} gata de export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Alerts */}
        {exportSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{exportSuccess}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Settings Form */}
        <div className="space-y-4">
          {/* File Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nume Fișier PDF
            </label>
            <div className="flex items-center rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-2 text-white text-sm focus-within:border-emerald-500">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full bg-transparent outline-none text-white font-medium"
                placeholder="Introdu numele documentului..."
              />
              <span className="text-xs text-slate-400 font-mono ml-1">.pdf</span>
            </div>
          </div>

          {/* Page Format */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Format Pagină
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'a4', label: 'A4 Standard', desc: '210 × 297 mm' },
                { id: 'fit', label: 'Original', desc: 'Potrivire exactă' },
                { id: 'letter', label: 'Letter US', desc: '216 × 279 mm' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setPageSize(opt.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    pageSize === opt.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quality & Size */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Calitate & Compresie
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'high', label: 'Pro HD', desc: 'Calitate maximă' },
                { id: 'medium', label: 'Optimizat', desc: 'Ideal WhatsApp' },
                { id: 'low', label: 'Compact', desc: 'Fișier mic' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setQuality(opt.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    quality === opt.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <p className="text-xs font-bold">{opt.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Margins */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-300">Margini Document</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setMarginMm(0)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  marginMm === 0
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-700/70 text-slate-300'
                }`}
              >
                Fără margini
              </button>
              <button
                onClick={() => setMarginMm(10)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  marginMm === 10
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-700/70 text-slate-300'
                }`}
              >
                10 mm
              </button>
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {isGenerating && (
          <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-center">
            <div className="inline-block animate-spin w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full mr-2 align-middle" />
            <span className="text-xs font-medium text-emerald-300">{progressText}</span>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 flex flex-col gap-2.5">
          {/* Main Share Button */}
          <button
            onClick={() => handleExport('share')}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/25 active:scale-95 transition disabled:opacity-50"
          >
            <Share2 className="w-5 h-5 stroke-[2.5]" />
            <span>Partajează PDF (WhatsApp, Gmail etc.)</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleExport('download')}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs active:scale-95 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Descarcă PDF</span>
            </button>

            <button
              onClick={handleDownloadImages}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs active:scale-95 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Exportă Poze JPG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
