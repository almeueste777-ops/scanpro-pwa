import React, { useRef, useState, useEffect } from 'react';
import { Zap, ZapOff, RefreshCw, Image as ImageIcon, Check, X, Layers } from 'lucide-react';

interface CameraViewProps {
  onCapture: (imageDataUrl: string) => void;
  onBatchComplete?: (images: string[]) => void;
  onClose: () => void;
  isBatchMode?: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onCapture,
  onBatchComplete,
  onClose,
  isBatchMode: initialBatchMode = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [batchMode, setBatchMode] = useState(initialBatchMode);
  const [batchImages, setBatchImages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shutterEffect, setShutterEffect] = useState(false);

  // Initialize camera
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      try {
        setCameraError(null);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 3840 },
            height: { ideal: 2160 }
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Check if torch/flashlight is supported
        const track = mediaStream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError('Nu s-a putut accesa camera. Te rugăm să permiți accesul sau să încarci din galerie.');
      }
    }

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Toggle Flashlight/Torch
  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }
  };

  // Flip Camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Shutter / Capture Photo
  const takePicture = () => {
    if (!videoRef.current) return;

    // Visual & Haptic feedback
    setShutterEffect(true);
    setTimeout(() => setShutterEffect(false), 200);
    if (navigator.vibrate) {
      navigator.vibrate(60);
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    if (batchMode) {
      setBatchImages((prev) => [...prev, dataUrl]);
    } else {
      onCapture(dataUrl);
    }
  };

  // Handle Gallery file selection (supports multi-selection!)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const loadedImages: string[] = [];

    let count = 0;
    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          loadedImages.push(event.target.result as string);
        }
        count++;
        if (count === fileList.length) {
          if (batchMode || loadedImages.length > 1) {
            if (onBatchComplete) {
              onBatchComplete(loadedImages);
            } else {
              setBatchImages((prev) => [...prev, ...loadedImages]);
            }
          } else {
            onCapture(loadedImages[0]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFinishBatch = () => {
    if (batchImages.length > 0 && onBatchComplete) {
      onBatchComplete(batchImages);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-5 pt-8 pb-4 z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md text-white hover:bg-slate-800 transition active:scale-95"
          aria-label="Închide camera"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2">
          {/* Batch Mode Toggle */}
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition ${
              batchMode
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                : 'bg-slate-900/60 text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {batchMode ? 'Mod Multiplu ON' : 'O singură pagină'}
          </button>

          {/* Torch Toggle */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2.5 rounded-full backdrop-blur-md transition ${
                torchOn ? 'bg-amber-400 text-slate-950' : 'bg-slate-900/60 text-white hover:bg-slate-800'
              }`}
              aria-label="Lanternă"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          {/* Camera Flip */}
          <button
            onClick={toggleFacingMode}
            className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur-md text-white hover:bg-slate-800 transition active:scale-95"
            aria-label="Schimbă camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Video Viewport & Document Framing Guide */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="p-6 text-center max-w-sm mx-auto">
            <p className="text-rose-400 mb-4 text-sm font-medium">{cameraError}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg text-sm inline-flex items-center gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              Alege din Galerie
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Shutter Flash Animation */}
        {shutterEffect && (
          <div className="absolute inset-0 bg-white/70 pointer-events-none transition-opacity duration-150 animate-pulse" />
        )}

        {/* Document Framing Reticle / Guides */}
        {!cameraError && (
          <div className="absolute inset-x-8 inset-y-16 pointer-events-none border-2 border-emerald-400/40 rounded-2xl flex flex-col justify-between p-3 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
            {/* Corner Bracket Accents */}
            <div className="flex justify-between items-start">
              <div className="w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            </div>

            <div className="text-center">
              <span className="text-[11px] font-medium tracking-wide uppercase px-3 py-1 bg-black/60 backdrop-blur-md text-slate-300 rounded-full border border-white/10">
                Încadrează documentul aici
              </span>
            </div>

            <div className="flex justify-between items-end">
              <div className="w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
              <div className="w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="px-6 pt-4 pb-8 bg-gradient-to-t from-black via-black/80 to-transparent z-20 flex items-center justify-between">
        {/* Gallery Button */}
        <div className="w-16 flex justify-start">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-700/60 text-slate-200 hover:text-white hover:bg-slate-800 transition active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg"
            title="Importă din galerie"
          >
            <ImageIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Big Shutter Button */}
        <div className="relative flex items-center justify-center">
          <button
            onClick={takePicture}
            disabled={!!cameraError}
            className="w-20 h-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center shadow-2xl transition active:scale-90 hover:border-emerald-400 group disabled:opacity-50"
            aria-label="Fă fotografie"
          >
            <div className="w-full h-full rounded-full bg-white group-hover:bg-emerald-400 transition-colors shadow-inner" />
          </button>
        </div>

        {/* Batch Counter or Confirm Button */}
        <div className="w-16 flex justify-end">
          {batchMode && batchImages.length > 0 ? (
            <button
              onClick={handleFinishBatch}
              className="relative p-3.5 rounded-2xl bg-emerald-500 text-slate-950 font-bold transition active:scale-95 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30"
              title="Finalizează scanarea"
            >
              <Check className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-bold">
                {batchImages.length}
              </span>
            </button>
          ) : (
            <div className="w-12 h-12" />
          )}
        </div>
      </div>
    </div>
  );
};
