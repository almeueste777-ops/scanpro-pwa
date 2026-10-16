import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Download, Sparkles, Globe, Volume2, Square } from 'lucide-react';
import { recognizeTextFromImage } from '../utils/ocr';

interface OcrModalProps {
  pageImage: string;
  initialText?: string;
  onSaveText?: (text: string) => void;
  onClose: () => void;
}

export const OcrModal: React.FC<OcrModalProps> = ({
  pageImage,
  initialText = '',
  onSaveText,
  onClose
}) => {
  const [text, setText] = useState<string>(initialText);
  const [language, setLanguage] = useState<'ron+eng' | 'ron' | 'eng'>('ron+eng');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Stop speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const runOcr = async () => {
    try {
      setIsRunning(true);
      setProgress(0);
      setStatusText('Pornire motor OCR...');

      const result = await recognizeTextFromImage(pageImage, language, (p, s) => {
        setProgress(p);
        setStatusText(s);
      });

      setText(result);
      if (onSaveText) onSaveText(result);
      setIsRunning(false);
    } catch (err: any) {
      console.error('OCR Error:', err);
      setStatusText('Eroare la recunoașterea textului.');
      setIsRunning(false);
    }
  };

  const toggleSpeak = () => {
    if (!('speechSynthesis' in window) || !text.trim()) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'eng' ? 'en-US' : 'ro-RO';
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const copyToClipboard = () => {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTextFile = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Text_Scanat_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Extragere Text & Cititor Vocal</h3>
              <p className="text-xs text-slate-400">Recunoaștere OCR + Citire cu voce tare</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Controls */}
          <div className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Limbă dicționar:</span>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              disabled={isRunning}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="ron+eng">Română + Engleză</option>
              <option value="ron">Doar Română</option>
              <option value="eng">Doar Engleză</option>
            </select>
          </div>

          {/* Run Button */}
          {!text && !isRunning && (
            <button
              onClick={runOcr}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Pornește Scanarea Textului</span>
            </button>
          )}

          {/* Progress Bar */}
          {isRunning && (
            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2 text-center">
              <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {statusText} ({progress}%)
              </p>
            </div>
          )}

          {/* Text Area */}
          {text && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Text extras ({text.length} caractere)
                </span>
                <div className="flex items-center gap-3">
                  {/* Text-to-Speech Button */}
                  <button
                    onClick={toggleSpeak}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                      isSpeaking
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                    }`}
                  >
                    {isSpeaking ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Oprește Vocea</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Citește cu Voce</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={runOcr}
                    disabled={isRunning}
                    className="text-xs text-purple-400 hover:underline font-semibold"
                  >
                    Re-scanează
                  </button>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (onSaveText) onSaveText(e.target.value);
                }}
                rows={8}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500 font-sans leading-relaxed"
                placeholder="Textul extras va apărea aici..."
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {text && (
          <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex gap-2">
            <button
              onClick={copyToClipboard}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm active:scale-95 transition"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiat în Clipboard!' : 'Copiază Text'}</span>
            </button>

            <button
              onClick={downloadTextFile}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition"
              title="Descarcă fișier .txt"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
