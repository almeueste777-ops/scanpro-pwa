import React, { useState, useRef } from 'react';
import {
  X,
  Lock,
  Unlock,
  Download,
  Upload,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  HardDriveDownload
} from 'lucide-react';
import { db } from '../db';

interface VaultBackupModalProps {
  onClose: () => void;
  onDataRestored: () => void;
}

export const VAULT_PIN_STORAGE_KEY = 'scanpro_vault_pin';

export const VaultBackupModal: React.FC<VaultBackupModalProps> = ({
  onClose,
  onDataRestored
}) => {
  const [existingPin, setExistingPin] = useState<string | null>(
    localStorage.getItem(VAULT_PIN_STORAGE_KEY)
  );
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSavePin = () => {
    setErrorMsg(null);
    setStatusMsg(null);

    if (existingPin && currentPinInput.trim() !== existingPin) {
      setErrorMsg('Introdu mai întâi codul PIN actual corect pentru a-l putea schimba!');
      return;
    }

    const clean = pinInput.trim();
    if (!/^\d{4}$/.test(clean)) {
      setErrorMsg('Noul cod PIN trebuie să conțină exact 4 cifre (ex: 2580).');
      return;
    }
    localStorage.setItem(VAULT_PIN_STORAGE_KEY, clean);
    setExistingPin(clean);
    setCurrentPinInput('');
    setPinInput('');
    setStatusMsg(
      existingPin
        ? 'Codul PIN a fost schimbat cu succes!'
        : 'Codul PIN pentru Seiful de Documente a fost activat!'
    );
  };

  const handleRemovePin = async () => {
    setErrorMsg(null);
    setStatusMsg(null);

    if (existingPin && currentPinInput.trim() !== existingPin) {
      setErrorMsg('Introdu codul PIN actual în câmpul „PIN Actual” pentru a dezactiva protecția!');
      return;
    }

    localStorage.removeItem(VAULT_PIN_STORAGE_KEY);
    setExistingPin(null);
    setCurrentPinInput('');
    setPinInput('');
    // Unlock all locked docs
    const allDocs = await db.documents.toArray();
    for (const d of allDocs) {
      if (d.isLocked) {
        await db.documents.update(d.id, { isLocked: false });
      }
    }
    onDataRestored();
    setStatusMsg('Protecția cu PIN a fost dezactivată și toate documentele au fost deblocate.');
  };

  // Export entire IndexedDB database (documents + pages + signatures/stamps)
  const handleExportBackup = async () => {
    setErrorMsg(null);
    setStatusMsg(null);

    if (existingPin && currentPinInput.trim() !== existingPin) {
      const verify = prompt('Pentru siguranță, introdu codul PIN (4 cifre) înainte de a exporta arhiva:');
      if (verify !== existingPin) {
        setErrorMsg('Cod PIN incorect! Exportul arhivei a fost blocat.');
        return;
      }
    }

    setIsWorking(true);
    try {
      const documents = await db.documents.toArray();
      const pages = await db.pages.toArray();
      const signatures = await db.signatures.toArray();

      const payload = {
        app: 'ScanPro PWA',
        version: '3.0',
        exportedAt: new Date().toISOString(),
        documents,
        pages,
        signatures
      };

      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ScanPro_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setStatusMsg(
        `Backup complet descărcat (${documents.length} documente, ${pages.length} pagini, ${signatures.length} semnături/ștampile)!`
      );
    } catch {
      setErrorMsg('Eroare la crearea fișierului de backup.');
    } finally {
      setIsWorking(false);
    }
  };

  // Restore from backup file
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsWorking(true);
    setErrorMsg(null);
    setStatusMsg(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const raw = evt.target?.result as string;
        const data = JSON.parse(raw);

        if (!data || !Array.isArray(data.documents)) {
          throw new Error('Fișierul selectat nu este un backup ScanPro valid.');
        }

        const currentPin = localStorage.getItem(VAULT_PIN_STORAGE_KEY);
        const normalizedDocs = data.documents.map((d: any) => ({
          ...d,
          // Ensure locked docs don't become permanently inaccessible if no PIN is configured on the new device
          isLocked: currentPin ? Boolean(d.isLocked) : false
        }));

        if (normalizedDocs.length > 0) {
          await db.documents.bulkPut(normalizedDocs);
        }
        if (Array.isArray(data.pages) && data.pages.length > 0) {
          await db.pages.bulkPut(data.pages);
        }
        if (Array.isArray(data.signatures) && data.signatures.length > 0) {
          await db.signatures.bulkPut(data.signatures);
        }

        onDataRestored();
        setStatusMsg(
          `Restaurare reușită: ${normalizedDocs.length} documente și ${
            data.signatures?.length || 0
          } semnături/ștampile au fost importate!`
        );
      } catch (err: any) {
        setErrorMsg(err.message || 'Eroare la restaurarea fișierului de backup.');
      } finally {
        setIsWorking(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Seif PIN & Backup Complet</h3>
              <p className="text-xs text-slate-400">
                Protejează documentele confidențiale și salvează arhiva pe telefon
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

        {statusMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Section 1: Seif cu PIN (4 Cifre) */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Seif Documente Confidențiale (PIN 4 Cifre)
              </h4>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                existingPin
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {existingPin ? 'PIN ACTIV' : 'NECONFIGURAT'}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            După ce setezi un cod PIN, poți bloca orice document din meniul său (cele 3 puncte `⋮` →{' '}
            <strong>Blochează cu PIN</strong>). Documentele blocate au imaginea ascunsă și cer PIN la deschidere, ștergere sau redenumire.
          </p>

          <div className="space-y-2">
            {existingPin && (
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={currentPinInput}
                onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="PIN Actual (4 cifre) - obligatoriu pt. modificare/dezactivare"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono tracking-widest outline-none focus:border-amber-400"
              />
            )}

            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder={existingPin ? 'Nou PIN (4 cifre)' : 'Setează PIN (ex: 2580)'}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono tracking-widest outline-none focus:border-amber-400"
              />
              <button
                onClick={handleSavePin}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition active:scale-95 flex items-center gap-1"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{existingPin ? 'Schimbă' : 'Activează PIN'}</span>
              </button>
              {existingPin && (
                <button
                  onClick={handleRemovePin}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-400 font-bold text-xs transition flex items-center gap-1"
                  title="Dezactivează PIN"
                >
                  <Unlock className="w-4 h-4" />
                  <span className="hidden sm:inline">Dezactivează</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Full Offline Backup & Restore */}
        <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Backup & Restaurare Arhivă (Mutare pe alt Telefon)
            </h4>
          </div>

          <p className="text-xs text-slate-400">
            Salvează toate documentele, paginile scanate, semnăturile și ștampilele tale într-un singur fișier de siguranță sau restaurează-le oricând.
          </p>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleExportBackup}
              disabled={isWorking}
              className="py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Descarcă Backup</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isWorking}
              className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Restaurează Backup</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
