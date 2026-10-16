import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  PenTool,
  Camera,
  Image as ImageIcon,
  Stamp,
  Trash2,
  Sparkles,
  Plus
} from 'lucide-react';
import {
  type SignatureItem,
  getSignatures,
  saveSignatureItem,
  deleteSignatureItem
} from '../db';
import {
  extractTransparentInk,
  generateRubberStamp,
  trimTransparentCanvas,
  type StampConfig
} from '../utils/signatureProcessing';

interface SignatureModalProps {
  onSelect: (item: SignatureItem) => void;
  onClose: () => void;
  defaultType?: 'signature' | 'stamp';
  initialMode?: CreationMode;
}

export type CreationMode = 'list' | 'draw' | 'scan' | 'import' | 'template';

export const SignatureModal: React.FC<SignatureModalProps> = ({
  onSelect,
  onClose,
  defaultType = 'signature',
  initialMode = 'list'
}) => {
  const [activeTab, setActiveTab] = useState<'signature' | 'stamp'>(defaultType);
  const [items, setItems] = useState<SignatureItem[]>([]);
  const [mode, setMode] = useState<CreationMode>(initialMode === 'import' ? 'list' : initialMode);
  const [itemName, setItemName] = useState('');

  // Drawing state
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1d4ed8'); // blue pen default
  const [penWidth, setPenWidth] = useState(3.5);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Scan / Import state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [rawScannedImage, setRawScannedImage] = useState<string | null>(null);
  const [scannedPreview, setScannedPreview] = useState<string | null>(null);
  const [selectedTint, setSelectedTint] = useState<string | null>(
    defaultType === 'signature' ? '#1d4ed8' : null
  );

  // Stamp template state
  const [stampType, setStampType] = useState<'rect' | 'circle' | 'badge'>('rect');
  const [stampTitle, setStampTitle] = useState('CONFORM CU ORIGINALUL');
  const [stampSubtitle, setStampSubtitle] = useState('SEMNĂTURĂ');
  const [stampDate, setStampDate] = useState(
    new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  );
  const [stampColor, setStampColor] = useState('#dc2626');
  const [stampPreviewUrl, setStampPreviewUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load items from database
  const loadItems = async () => {
    const list = await getSignatures(activeTab);
    setItems(list);
  };

  useEffect(() => {
    loadItems();
  }, [activeTab]);

  // If opened with initialMode === 'import', trigger file input automatically
  useEffect(() => {
    if (initialMode === 'import') {
      setTimeout(() => fileInputRef.current?.click(), 100);
    } else if (initialMode === 'scan') {
      startCamera();
    }
  }, [initialMode]);

  // Bind cameraStream to video element whenever video mounts or stream changes
  useEffect(() => {
    if (mode === 'scan' && !scannedPreview && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [mode, scannedPreview, cameraStream]);

  // Re-extract transparent ink whenever rawScannedImage or selectedTint changes!
  useEffect(() => {
    if (!rawScannedImage) return;
    let active = true;
    extractTransparentInk(rawScannedImage, selectedTint).then((transparentData) => {
      if (active) setScannedPreview(transparentData);
    });
    return () => {
      active = false;
    };
  }, [rawScannedImage, selectedTint]);

  // Clean camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  // Render Rubber Stamp Preview
  useEffect(() => {
    if (mode === 'template') {
      const config: StampConfig = {
        type: stampType,
        title: stampTitle || 'ȘTAMPILĂ',
        subtitle: stampSubtitle,
        dateStr: stampDate,
        color: stampColor
      };
      const url = generateRubberStamp(config);
      setStampPreviewUrl(url);
    }
  }, [mode, stampType, stampTitle, stampSubtitle, stampDate, stampColor]);

  // 1. DRAWING CANVAS LOGIC
  const getCanvasPos = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawCanvasRef.current) return { x: 0, y: 0 };
    const rect = drawCanvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * (drawCanvasRef.current.width / rect.width),
      y: (clientY - rect.top) * (drawCanvasRef.current.height / rect.height)
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const drawMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clearDraw = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSaveDraw = async () => {
    if (!drawCanvasRef.current || !hasDrawn) return;
    const trimmed = trimTransparentCanvas(drawCanvasRef.current);
    const dataUrl = trimmed.toDataURL('image/png');

    const defaultTitle =
      activeTab === 'signature'
        ? `Semnătură Desenată ${items.length + 1}`
        : `Ștampilă Desenată ${items.length + 1}`;

    const saved = await saveSignatureItem({
      type: activeTab,
      name: itemName.trim() || defaultTitle,
      imageData: dataUrl,
      color: penColor
    });

    await loadItems();
    setMode('list');
    onSelect(saved);
  };

  // 2. SCANNING VIA CAMERA
  const startCamera = async () => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Camera error:', err);
    }
  };

  const captureCameraPhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    // Stop stream
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }

    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setRawScannedImage(rawDataUrl);
  };

  const handleSaveScanned = async () => {
    if (!scannedPreview) return;
    const defaultTitle =
      activeTab === 'signature'
        ? `Semnătură Scanată ${items.length + 1}`
        : `Ștampilă Scanată ${items.length + 1}`;

    const saved = await saveSignatureItem({
      type: activeTab,
      name: itemName.trim() || defaultTitle,
      imageData: scannedPreview,
      color: selectedTint || '#000000'
    });

    await loadItems();
    setMode('list');
    onSelect(saved);
  };

  // 3. IMPORT FROM FILE (opens preview with ink color tint selector!)
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      if (evt.target?.result) {
        setItemName(file.name.replace(/\.[^/.]+$/, ''));
        setSelectedTint(activeTab === 'signature' ? '#1d4ed8' : null);
        setRawScannedImage(evt.target.result as string);
        setMode('scan');
      }
    };
    reader.readAsDataURL(file);
  };

  // 4. SAVE TEMPLATE STAMP
  const handleSaveTemplate = async () => {
    if (!stampPreviewUrl) return;
    const saved = await saveSignatureItem({
      type: 'stamp',
      name: stampTitle || 'Ștampilă Șablon',
      imageData: stampPreviewUrl,
      color: stampColor
    });
    await loadItems();
    setMode('list');
    onSelect(saved);
  };

  // Delete item
  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Ești sigur că vrei să ștergi acest element salvat?')) {
      await deleteSignatureItem(id);
      loadItems();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {activeTab === 'signature' ? <PenTool className="w-5 h-5" /> : <Stamp className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {activeTab === 'signature' ? 'Semnături Digitale' : 'Ștampile & Sigilii'}
              </h3>
              <p className="text-xs text-slate-400">
                Alege sau creează elemente cu fundal transparent
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

        {/* Tab Switcher: Semnături vs Ștampile */}
        {mode === 'list' && (
          <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1.5">
            <button
              onClick={() => setActiveTab('signature')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                activeTab === 'signature'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Semnături</span>
            </button>
            <button
              onClick={() => setActiveTab('stamp')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                activeTab === 'stamp'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Stamp className="w-4 h-4" />
              <span>Ștampile</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* VIEW 1: SAVED LIST */}
          {mode === 'list' && (
            <div className="space-y-4">
              {/* Creator Options Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    setItemName('');
                    setMode('draw');
                    setHasDrawn(false);
                  }}
                  className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-center flex flex-col items-center gap-1.5 transition active:scale-95 group"
                >
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition">
                    <PenTool className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-white">Desenează</span>
                </button>

                <button
                  onClick={() => {
                    setItemName('');
                    setRawScannedImage(null);
                    setScannedPreview(null);
                    setMode('scan');
                    startCamera();
                  }}
                  className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-center flex flex-col items-center gap-1.5 transition active:scale-95 group"
                >
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-110 transition">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-white">Scanează</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-center flex flex-col items-center gap-1.5 transition active:scale-95 group"
                >
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-bold text-white">Importă</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileImport}
                  className="hidden"
                />

                {activeTab === 'stamp' ? (
                  <button
                    onClick={() => {
                      setItemName('');
                      setMode('template');
                    }}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-center flex flex-col items-center gap-1.5 transition active:scale-95 group"
                  >
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-110 transition">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold text-white">Șabloane</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setItemName('');
                      setMode('draw');
                    }}
                    className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-center flex flex-col items-center gap-1.5 opacity-60"
                  >
                    <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">Nouă</span>
                  </button>
                )}
              </div>

              {/* Items Grid */}
              <div className="pt-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                  Colecția Ta ({items.length})
                </span>

                {items.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800 border-dashed">
                    <p className="text-xs text-slate-400">
                      Nu ai nicio {activeTab === 'signature' ? 'semnătură' : 'ștampilă'} salvată încă.
                      Alege o opțiune de mai sus pentru a adăuga prima!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onSelect(item)}
                        className="group relative bg-slate-950/70 border border-slate-800 hover:border-emerald-500/60 rounded-xl p-3 cursor-pointer transition flex flex-col items-center justify-between"
                      >
                        {/* Checkerboard transparent container */}
                        <div
                          className="w-full aspect-[2/1] rounded-lg flex items-center justify-center p-2 mb-2 overflow-hidden"
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
                            className="max-h-full max-w-full object-contain filter drop-shadow-md group-hover:scale-105 transition"
                          />
                        </div>

                        <div className="w-full flex items-center justify-between">
                          <span className="text-xs font-bold text-white truncate max-w-[120px]">
                            {item.name}
                          </span>
                          <button
                            onClick={(e) => handleDeleteItem(item.id, e)}
                            className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition"
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
          )}

          {/* VIEW 2: DRAW ON CANVAS */}
          {mode === 'draw' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Semnează sau desenează cu degetul:
                </span>
                <button onClick={clearDraw} className="text-xs text-rose-400 hover:underline">
                  Curăță
                </button>
              </div>

              {/* Drawing Pad */}
              <div
                className="w-full h-52 bg-white rounded-2xl border-2 border-slate-700 overflow-hidden relative touch-none shadow-inner cursor-crosshair"
                style={{
                  backgroundImage:
                    'radial-gradient(#e2e8f0 1.2px, transparent 1.2px), radial-gradient(#e2e8f0 1.2px, #ffffff 1.2px)',
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0, 12px 12px'
                }}
              >
                <canvas
                  ref={drawCanvasRef}
                  width={600}
                  height={260}
                  onMouseDown={startDraw}
                  onMouseMove={drawMove}
                  onMouseUp={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={drawMove}
                  onTouchEnd={endDraw}
                  className="w-full h-full block"
                />
              </div>

              {/* Pen Settings & Colors */}
              <div className="flex items-center justify-between bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Culoare:</span>
                  {[
                    { id: '#1d4ed8', label: 'Albastru Pix' },
                    { id: '#090d16', label: 'Negru' },
                    { id: '#dc2626', label: 'Roșu' }
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setPenColor(c.id)}
                      className={`w-7 h-7 rounded-full border-2 transition ${
                        penColor === c.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.id }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Grosime:</span>
                  <input
                    type="range"
                    min="1.5"
                    max="6"
                    step="0.5"
                    value={penWidth}
                    onChange={(e) => setPenWidth(Number(e.target.value))}
                    className="w-20 accent-emerald-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode('list')}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Anulează
                </button>
                <button
                  onClick={handleSaveDraw}
                  disabled={!hasDrawn}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                >
                  Salvează & Aplică
                </button>
              </div>
            </div>
          )}

          {/* VIEW 3: SCAN WITH CAMERA */}
          {mode === 'scan' && (
            <div className="space-y-4">
              {!scannedPreview ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-300">
                    Îndreaptă camera spre semnătura sau ștampila de pe foaie:
                  </p>
                  <div className="relative aspect-[4/3] rounded-2xl bg-black overflow-hidden border border-slate-700">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute inset-x-8 inset-y-6 border-2 border-emerald-400/60 rounded-xl pointer-events-none" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
                        setMode('list');
                      }}
                      className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-xs font-semibold"
                    >
                      Anulează
                    </button>
                    <button
                      onClick={captureCameraPhoto}
                      className="flex-1 py-3 bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20"
                    >
                      Fotografiază & Extrage
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-emerald-400">
                    ✓ Fundalul a fost eliminat automat (Transparență):
                  </span>
                  <div
                    className="w-full h-44 rounded-2xl flex items-center justify-center p-3 border border-slate-700"
                    style={{
                      backgroundImage:
                        'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                      backgroundSize: '16px 16px'
                    }}
                  >
                    <img src={scannedPreview} alt="Scanned ink" className="max-h-full max-w-full object-contain" />
                  </div>

                  <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-xs text-slate-400">Nuanță tuș:</span>
                    <div className="flex gap-1.5">
                      {[
                        { id: '#1d4ed8', label: 'Albastru' },
                        { id: '#090d16', label: 'Negru' },
                        { id: '#dc2626', label: 'Roșu' },
                        { id: null, label: 'Original' }
                      ].map((t) => (
                        <button
                          key={t.label}
                          onClick={() => setSelectedTint(t.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                            selectedTint === t.id
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRawScannedImage(null);
                        setScannedPreview(null);
                        startCamera();
                      }}
                      className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-xs font-semibold"
                    >
                      Refă Poza
                    </button>
                    <button
                      onClick={handleSaveScanned}
                      className="flex-1 py-3 bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold"
                    >
                      Salvează & Folosește
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: RUBBER STAMP TEMPLATES */}
          {mode === 'template' && (
            <div className="space-y-4">
              {/* Stamp Type Selector */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'rect', label: 'Dreptunghiular' },
                  { id: 'circle', label: 'Rotund (Sigiliu)' },
                  { id: 'badge', label: 'Insignă / Badge' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setStampType(t.id as any)}
                    className={`py-2 px-1 text-xs font-semibold rounded-xl border transition ${
                      stampType === t.id
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Form inputs */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase">Text Principal</label>
                  <input
                    type="text"
                    value={stampTitle}
                    onChange={(e) => setStampTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase focus:border-rose-500 outline-none"
                    placeholder="ex: CONFORM CU ORIGINALUL / APROBAT"
                  />
                </div>

                {stampType !== 'badge' && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase">Text Secundar</label>
                    <input
                      type="text"
                      value={stampSubtitle}
                      onChange={(e) => setStampSubtitle(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase focus:border-rose-500 outline-none"
                      placeholder="ex: SEMNĂTURĂ / VIZAT"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase">Dată Ștampilă</label>
                  <input
                    type="text"
                    value={stampDate}
                    onChange={(e) => setStampDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-rose-500 outline-none"
                    placeholder="14.10.2026"
                  />
                </div>

                {/* Color Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
                    Culoare Tuș Ștampilă
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: '#dc2626', label: 'Roșu Oficial' },
                      { id: '#1d4ed8', label: 'Albastru' },
                      { id: '#059669', label: 'Verde' },
                      { id: '#090d16', label: 'Negru' }
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setStampColor(c.id)}
                        className={`w-7 h-7 rounded-full border-2 transition ${
                          stampColor === c.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.id }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Stamp Preview */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase block mb-1">
                  Previzualizare Ștampilă:
                </span>
                <div
                  className="w-full h-36 rounded-2xl flex items-center justify-center p-3 border border-slate-700"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                    backgroundSize: '16px 16px'
                  }}
                >
                  {stampPreviewUrl && (
                    <img src={stampPreviewUrl} alt="Stamp Preview" className="max-h-full max-w-full object-contain" />
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setMode('list')}
                  className="flex-1 py-3 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Anulează
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/25"
                >
                  Salvează Ștampila
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
