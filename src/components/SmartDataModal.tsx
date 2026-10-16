import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Copy,
  Check,
  CreditCard,
  Building2,
  Banknote,
  Phone,
  Mail,
  Calendar,
  UserSquare2,
  FileSpreadsheet,
  Contact,
  Sparkles
} from 'lucide-react';
import { db, type DocumentItem, type DocumentPage } from '../db';
import { recognizeTextFromImage } from '../utils/ocr';

interface SmartDataModalProps {
  document: DocumentItem;
  pages: DocumentPage[];
  onPagesUpdated: () => void;
  onClose: () => void;
}

interface ExtractedEntities {
  ibans: string[];
  cuis: string[];
  regComs: string[];
  amounts: string[];
  cnps: string[];
  idSeries: string[];
  dates: string[];
  phones: string[];
  emails: string[];
}

function parseRomanianDocumentEntities(rawText: string): ExtractedEntities {
  const clean = rawText.replace(/\r/g, '\n');
  const upper = clean.toUpperCase();

  // 1. IBAN (Romanian 24-char RO.. or international)
  const ibanMatches =
    upper.match(/\bRO\s*\d{2}\s*[A-Z]{4}(?:\s*[A-Z0-9]{4}){4}\b/g) || [];
  const ibans = Array.from(
    new Set(ibanMatches.map((m) => m.replace(/\s+/g, '')))
  );

  // 2. CUI / CIF (e.g., RO12345678 or CUI: 12345678 or CIF 12345678)
  const cuiRegex = /\b(?:C\.?U\.?I\.?|C\.?I\.?F\.?|COD\s*FISCAL)\s*[:.]?\s*(RO\s*\d{2,10}|\d{6,10})\b|\b(RO\d{6,10})\b/gi;
  const cuiSet = new Set<string>();
  let mCui: RegExpExecArray | null;
  while ((mCui = cuiRegex.exec(upper)) !== null) {
    const val = (mCui[1] || mCui[2] || '').replace(/\s+/g, '');
    if (val) cuiSet.add(val);
  }

  // 3. Nr. Reg. Com. (e.g., J40/1234/2020 or F12/345/2019)
  const regMatches = upper.match(/\b[JFC]\d{1,2}\s*\/\s*\d{1,6}\s*\/\s*(?:19|20)\d{2}\b/g) || [];
  const regComs = Array.from(new Set(regMatches.map((r) => r.replace(/\s+/g, ''))));

  // 4. Amounts / Totals (e.g. 1.250,50 RON / LEI / EUR or TOTAL: 450.00)
  const amountRegex =
    /\b(?:\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\s*(?:LEI|RON|EUR|USD)\b|\b(?:TOTAL(?:\s*DE\s*PLAT[AĂ])?|VALOARE)\s*[:.]?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/gi;
  const amountSet = new Set<string>();
  let mAmt: RegExpExecArray | null;
  while ((mAmt = amountRegex.exec(upper)) !== null) {
    amountSet.add(mAmt[0].trim());
  }

  // 5. CNP (13 digits starting with 1..8)
  const cnpMatches = upper.match(/\b[1-8]\d{12}\b/g) || [];
  const cnps = Array.from(new Set(cnpMatches));

  // 6. Serie & Numar CI (e.g. RX 123456, RK 654321, XT 123456)
  const ciRegex = /\b(?:SERIA\s*([A-Z]{2})\s*(?:NR\.?\s*)?(\d{6})|([A-Z]{2})\s*(\d{6}))\b/g;
  const idSeriesSet = new Set<string>();
  let mCi: RegExpExecArray | null;
  while ((mCi = ciRegex.exec(upper)) !== null) {
    const s = mCi[1] || mCi[3];
    const n = mCi[2] || mCi[4];
    // Exclude common RO fiscal codes starting with RO
    if (s && n && s !== 'RO') {
      idSeriesSet.add(`${s} ${n}`);
    }
  }

  // 7. Dates (DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY)
  const dateMatches =
    clean.match(/\b(?:0[1-9]|[12]\d|3[01])[./-](?:0[1-9]|1[0-2])[./-](?:19|20)\d{2}\b/g) || [];
  const dates = Array.from(new Set(dateMatches));

  // 8. Phone numbers (Romanian 07xx xxx xxx or +407xx...)
  const phoneMatches =
    clean.match(/\b(?:\+?40|0)\s*7\d{2}[\s.-]*\d{3}[\s.-]*\d{3}\b/g) || [];
  const phones = Array.from(
    new Set(phoneMatches.map((p) => p.replace(/[\s.-]+/g, '')))
  );

  // 9. Emails
  const emailMatches =
    clean.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
  const emails = Array.from(new Set(emailMatches.map((e) => e.toLowerCase())));

  return {
    ibans,
    cuis: Array.from(cuiSet),
    regComs,
    amounts: Array.from(amountSet),
    cnps,
    idSeries: Array.from(idSeriesSet),
    dates,
    phones,
    emails
  };
}

export const SmartDataModal: React.FC<SmartDataModalProps> = ({
  document: docItem,
  pages,
  onPagesUpdated,
  onClose
}) => {
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [combinedText, setCombinedText] = useState('');
  const [entities, setEntities] = useState<ExtractedEntities | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  // Gather existing OCR text or run OCR automatically
  useEffect(() => {
    const existingTexts = pages.map((p) => p.ocrText || '').filter((t) => t.trim().length > 0);
    if (existingTexts.length > 0) {
      const full = existingTexts.join('\n\n');
      setCombinedText(full);
      setEntities(parseRomanianDocumentEntities(full));
    } else {
      runFullDocumentAnalysis();
    }
  }, []);

  const runFullDocumentAnalysis = async () => {
    if (pages.length === 0 || isScanningOcr) return;
    setIsScanningOcr(true);
    setProgress(5);
    setStatusText('Se analizează documentul cu AI OCR...');

    try {
      const collected: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        setStatusText(`Se extrag datele din pagina ${i + 1} / ${pages.length}...`);
        const txt = await recognizeTextFromImage(
          p.processedImage || p.originalImage,
          'ron+eng',
          (prog) => {
            const totalProg = Math.round(((i + prog / 100) / pages.length) * 100);
            setProgress(totalProg);
          }
        );
        await db.pages.update(p.id, { ocrText: txt });
        collected.push(txt);
      }

      const full = collected.join('\n\n');
      setCombinedText(full);
      setEntities(parseRomanianDocumentEntities(full));
      onPagesUpdated();
    } catch (err) {
      console.error('Smart Data extraction error:', err);
    } finally {
      setIsScanningOcr(false);
    }
  };

  const handleCopy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedValue(val);
    setTimeout(() => setCopiedValue(null), 1800);
  };

  // Export structured CSV for Excel accounting
  const handleExportCsv = () => {
    if (!entities) return;
    const rows = [
      ['Camp', 'Valori Extrase'],
      ['Titlu Document', docItem.title],
      ['Categorie', docItem.category],
      ['IBAN', entities.ibans.join(' | ')],
      ['CUI / CIF', entities.cuis.join(' | ')],
      ['Reg. Com.', entities.regComs.join(' | ')],
      ['Sume / Totaluri', entities.amounts.join(' | ')],
      ['CNP', entities.cnps.join(' | ')],
      ['Serie CI', entities.idSeries.join(' | ')],
      ['Date', entities.dates.join(' | ')],
      ['Telefoane', entities.phones.join(' | ')],
      ['Email', entities.emails.join(' | ')]
    ];

    const csvContent =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docItem.title.replace(/[/\\?%*:|"<>]/g, '_')}_Date.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Export vCard (.vcf) contact for phone address book
  const handleExportVCard = () => {
    if (!entities) return;
    const phone = entities.phones[0] || '';
    const email = entities.emails[0] || '';
    const org = entities.cuis[0] ? `CUI ${entities.cuis[0]}` : docItem.title;

    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${docItem.title}`,
      `ORG:${org}`,
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      email ? `EMAIL:${email}` : '',
      entities.ibans[0] ? `NOTE:IBAN: ${entities.ibans[0]}` : '',
      'END:VCARD'
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Contact_${docItem.title.replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalFound = entities
    ? entities.ibans.length +
      entities.cuis.length +
      entities.regComs.length +
      entities.amounts.length +
      entities.cnps.length +
      entities.idSeries.length +
      entities.dates.length +
      entities.phones.length +
      entities.emails.length
    : 0;

  const renderBadgeGroup = (
    title: string,
    icon: React.ReactNode,
    values: string[],
    colorClass: string,
    actionType?: 'tel' | 'mailto'
  ) => {
    if (values.length === 0) return null;
    return (
      <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
          {icon}
          <span>{title}</span>
        </div>
        <div className="space-y-1.5">
          {values.map((v) => (
            <div
              key={v}
              className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800/90"
            >
              <span className={`font-mono text-xs font-bold break-all ${colorClass}`}>{v}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {actionType === 'tel' && (
                  <a
                    href={`tel:${v}`}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30"
                  >
                    Sună
                  </a>
                )}
                {actionType === 'mailto' && (
                  <a
                    href={`mailto:${v}`}
                    className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/30"
                  >
                    Email
                  </a>
                )}
                <button
                  onClick={() => handleCopy(v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold transition active:scale-95"
                >
                  {copiedValue === v ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copiat</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiază</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-bold text-white">Asistent AI: Extragere Date</h3>
                <span className="px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 font-black text-[9px] uppercase">
                  SMART
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Detectează automat IBAN, CUI, Sume, CNP, Telefoane & Date
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {isScanningOcr ? (
            <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-3">
              <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs font-bold text-cyan-300">
                {statusText} ({progress}%)
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between bg-slate-800/50 px-3.5 py-2.5 rounded-xl border border-slate-700/60">
                <span className="text-xs text-slate-300 font-semibold">
                  Elemente structurate găsite:{' '}
                  <strong className="text-cyan-400">{totalFound}</strong>
                </span>
                <button
                  onClick={runFullDocumentAnalysis}
                  className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-analizează
                </button>
              </div>

              {entities && totalFound > 0 ? (
                <div className="space-y-3">
                  {renderBadgeGroup(
                    'Conturi Bancare IBAN (1-Click pt. Mobile Banking)',
                    <CreditCard className="w-4 h-4 text-emerald-400" />,
                    entities.ibans,
                    'text-emerald-300'
                  )}
                  {renderBadgeGroup(
                    'Coduri Fiscale (CUI / CIF)',
                    <Building2 className="w-4 h-4 text-amber-400" />,
                    entities.cuis,
                    'text-amber-300'
                  )}
                  {renderBadgeGroup(
                    'Nr. Registrul Comerțului',
                    <Building2 className="w-4 h-4 text-orange-400" />,
                    entities.regComs,
                    'text-orange-300'
                  )}
                  {renderBadgeGroup(
                    'Sume / Valori Identificate',
                    <Banknote className="w-4 h-4 text-green-400" />,
                    entities.amounts,
                    'text-green-300'
                  )}
                  {renderBadgeGroup(
                    'CNP (Cod Numeric Personal)',
                    <UserSquare2 className="w-4 h-4 text-purple-400" />,
                    entities.cnps,
                    'text-purple-300'
                  )}
                  {renderBadgeGroup(
                    'Serie & Număr Act Identitate',
                    <UserSquare2 className="w-4 h-4 text-indigo-400" />,
                    entities.idSeries,
                    'text-indigo-300'
                  )}
                  {renderBadgeGroup(
                    'Numere de Telefon',
                    <Phone className="w-4 h-4 text-cyan-400" />,
                    entities.phones,
                    'text-cyan-300',
                    'tel'
                  )}
                  {renderBadgeGroup(
                    'Adrese de Email',
                    <Mail className="w-4 h-4 text-blue-400" />,
                    entities.emails,
                    'text-blue-300',
                    'mailto'
                  )}
                  {renderBadgeGroup(
                    'Date Calendaristice',
                    <Calendar className="w-4 h-4 text-slate-400" />,
                    entities.dates,
                    'text-slate-200'
                  )}
                </div>
              ) : (
                <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-2xl text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-300">
                    Nu s-au detectat automat coduri IBAN, CUI, CNP sau sume standard în text.
                  </p>
                  {combinedText && (
                    <p className="text-[11px] text-slate-400 line-clamp-4 italic">
                      „{combinedText.slice(0, 220)}...”
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Export Actions: CSV Excel & vCard Contact */}
        {!isScanningOcr && (
          <div className="p-4 bg-slate-900 border-t border-slate-800 grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExportCsv}
              className="py-3 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Tabel Excel (.CSV)</span>
            </button>

            <button
              onClick={handleExportVCard}
              className="py-3 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Contact className="w-4 h-4" />
              <span>Salvează Contact (.VCF)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
