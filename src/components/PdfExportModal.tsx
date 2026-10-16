import React, { useState } from 'react';
import {
  X,
  Share2,
  Download,
  FileText,
  CheckCircle2,
  Settings2,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Hash,
  FileCode2
} from 'lucide-react';
import type { DocumentItem, DocumentPage } from '../db';
import {
  generatePdfBlob,
  downloadBlob,
  sharePdfFile,
  exportToWordDoc,
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
  const [watermarkText, setWatermarkText] = useState<string>('');
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(true);
  const [includeSearchableOcr, setIncludeSearchableOcr] = useState<boolean>(true);
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
        marginMm,
        watermarkText,
        showPageNumbers,
        includeSearchableOcr
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

  const handleDownloadImages = () => {
    pages.forEach((page, idx) => {
      const link = window.document.createElement('a');
      link.href = page.processedImage || page.originalImage;
      link.download = `${fileName}_Pagina_${idx + 1}.jpg`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
    });
    setExportSuccess('Imaginile JPG au fost descărcate!');
  };

  const handleExportWord = () => {
    exportToWordDoc(docItem, pages, fileName);
    setExportSuccess('Documentul Word (.doc) a fost descărcat!');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Studio Export PDF & Word VIP</h3>
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
        <div className="space-y-3.5">
          {/* File Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Nume Fișier
            </label>
            <div className="flex items-center rounded-xl bg-slate-800/90 border border-slate-700 px-3 py-2 text-white text-sm focus-within:border-emerald-500">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full bg-transparent outline-none text-white font-medium text-xs"
                placeholder="Introdu numele documentului..."
              />
              <span className="text-xs text-slate-400 font-mono ml-1">.pdf</span>
            </div>
          </div>

          {/* Page Format & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Format Pagină
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'a4', label: 'A4' },
                  { id: 'fit', label: 'Exact' },
                  { id: 'letter', label: 'Letter' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPageSize(opt.id as any)}
                    className={`py-2 rounded-lg border text-center text-xs font-bold transition ${
                      pageSize === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Calitate PDF
              </label>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'high', label: 'HD' },
                  { id: 'medium', label: 'Optim' },
                  { id: 'low', label: 'Mic' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setQuality(opt.id as any)}
                    className={`py-2 rounded-lg border text-center text-xs font-bold transition ${
                      quality === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Security Watermark (Anti-Fraud) */}
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Filigran de Securitate pe Pagini (Watermark)
              </span>
              {watermarkText && (
                <button
                  onClick={() => setWatermarkText('')}
                  className="text-[10px] text-rose-400 hover:underline"
                >
                  Șterge
                </button>
              )}
            </div>
            <input
              type="text"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              placeholder="Opțional: ex. CONFORM CU ORIGINALUL / CONFIDENȚIAL"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
            />
            <div className="flex flex-wrap gap-1.5">
              {['CONFORM CU ORIGINALUL', 'CONFIDENȚIAL', 'COPIE CERTIFICATĂ'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setWatermarkText(preset)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles: Page Numbering, Margins & Searchable OCR */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowPageNumbers(!showPageNumbers)}
              className={`p-2 rounded-xl border text-left flex flex-col justify-between transition ${
                showPageNumbers
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
              }`}
            >
              <span className="text-[11px] font-semibold flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" />
                Numerotare
              </span>
              <span className="text-[10px] font-bold uppercase mt-1">
                {showPageNumbers ? 'Activ (Subsol)' : 'Oprit'}
              </span>
            </button>

            <button
              onClick={() => setMarginMm(marginMm === 0 ? 10 : 0)}
              className={`p-2 rounded-xl border text-left flex flex-col justify-between transition ${
                marginMm === 10
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
              }`}
            >
              <span className="text-[11px] font-semibold flex items-center gap-1">
                <Settings2 className="w-3.5 h-3.5" />
                Margini A4
              </span>
              <span className="text-[10px] font-bold uppercase mt-1">
                {marginMm === 10 ? '10 mm' : 'Fără'}
              </span>
            </button>

            <button
              onClick={() => setIncludeSearchableOcr(!includeSearchableOcr)}
              className={`p-2 rounded-xl border text-left flex flex-col justify-between transition ${
                includeSearchableOcr
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
              }`}
            >
              <span className="text-[11px] font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                PDF Căutabil
              </span>
              <span className="text-[10px] font-bold uppercase mt-1">
                {includeSearchableOcr ? 'Text OCR ON' : 'Oprit'}
              </span>
            </button>
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
        <div className="pt-1 flex flex-col gap-2">
          {/* Main Share Button */}
          <button
            onClick={() => handleExport('share')}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/25 active:scale-95 transition disabled:opacity-50"
          >
            <Share2 className="w-5 h-5 stroke-[2.5]" />
            <span>Partajează PDF (WhatsApp, Email etc.)</span>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleExport('download')}
              disabled={isGenerating}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs active:scale-95 transition"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Salvează PDF</span>
            </button>

            <button
              onClick={handleExportWord}
              disabled={isGenerating}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-blue-950/60 hover:bg-blue-900/60 border border-blue-500/40 text-blue-300 font-semibold text-xs active:scale-95 transition"
            >
              <FileCode2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Export Word</span>
            </button>

            <button
              onClick={handleDownloadImages}
              disabled={isGenerating}
              className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white font-semibold text-xs active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Poze JPG</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
