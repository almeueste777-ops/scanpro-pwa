import React, { useRef, useState, useEffect } from 'react';
import { Zap, ZapOff, RefreshCw, Image as ImageIcon, Check, X, Layers, Sparkles } from 'lucide-react';
import type { DocumentCorners } from '../db';
import { detectDocumentCornersSync } from '../utils/imageProcessing';

interface CameraViewProps {
  onCapture: (imageDataUrl: string, detectedCorners?: DocumentCorners) => void;
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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [batchMode, setBatchMode] = useState(initialBatchMode);
  const [batchImages, setBatchImages] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shutterEffect, setShutterEffect] = useState(false);

  // Live AI Document Detection & Auto-Snap state
  const [autoSnap, setAutoSnap] = useState(true);
  const [docDetected, setDocDetected] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0); // 0..100
  const smoothedCornersRef = useRef<DocumentCorners | null>(null);
  const stableCountRef = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);

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
            width: { ideal: 2560 },
            height: { ideal: 1440 }
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

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

  // Real-time live document boundary detection loop on video stream
  useEffect(() => {
    if (cameraError) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!video || !overlay || video.readyState < 2 || !video.videoWidth) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const rect = overlay.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      overlay.width = rect.width;
      overlay.height = rect.height;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, overlay.width, overlay.height);

      // Run fast CV document boundary detection on live video frame
      const result = detectDocumentCornersSync(video, vw, vh);

      if (result.detected) {
        setDocDetected(true);

        // Smooth corners exponentially so polygon doesn't jitter
        const prev = smoothedCornersRef.current;
        const alpha = 0.45;
        const raw = result.corners;

        let movement = 0;
        if (prev) {
          movement =
            (Math.hypot(raw.tl.x - prev.tl.x, raw.tl.y - prev.tl.y) +
              Math.hypot(raw.tr.x - prev.tr.x, raw.tr.y - prev.tr.y) +
              Math.hypot(raw.br.x - prev.br.x, raw.br.y - prev.br.y) +
              Math.hypot(raw.bl.x - prev.bl.x, raw.bl.y - prev.bl.y)) /
            4;

          smoothedCornersRef.current = {
            tl: {
              x: prev.tl.x + (raw.tl.x - prev.tl.x) * alpha,
              y: prev.tl.y + (raw.tl.y - prev.tl.y) * alpha
            },
            tr: {
              x: prev.tr.x + (raw.tr.x - prev.tr.x) * alpha,
              y: prev.tr.y + (raw.tr.y - prev.tr.y) * alpha
            },
            br: {
              x: prev.br.x + (raw.br.x - prev.br.x) * alpha,
              y: prev.br.y + (raw.br.y - prev.br.y) * alpha
            },
            bl: {
              x: prev.bl.x + (raw.bl.x - prev.bl.x) * alpha,
              y: prev.bl.y + (raw.bl.y - prev.bl.y) * alpha
            }
          };
        } else {
          smoothedCornersRef.current = raw;
          movement = 999;
        }

        // Map video coordinates to object-cover screen coordinates
        const scale = Math.max(overlay.width / vw, overlay.height / vh);
        const renderedW = vw * scale;
        const renderedH = vh * scale;
        const offsetX = (overlay.width - renderedW) / 2;
        const offsetY = (overlay.height - renderedH) / 2;

        const toScreen = (p: { x: number; y: number }) => ({
          x: offsetX + p.x * scale,
          y: offsetY + p.y * scale
        });

        const sc = smoothedCornersRef.current!;
        const sTL = toScreen(sc.tl);
        const sTR = toScreen(sc.tr);
        const sBR = toScreen(sc.br);
        const sBL = toScreen(sc.bl);

        // Draw live CamScanner glowing emerald quadrilateral
        ctx.save();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sTL.x, sTL.y);
        ctx.lineTo(sTR.x, sTR.y);
        ctx.lineTo(sBR.x, sBR.y);
        ctx.lineTo(sBL.x, sBL.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Corner dots
        [sTL, sTR, sBR, sBL].forEach((pt) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();

        // Stability check for Auto-Snap (if movement is < 3.5% of width)
        const maxAllowedMove = vw * 0.035;
        if (autoSnap && !isCapturingRef.current && movement < maxAllowedMove) {
          stableCountRef.current += 1;
          const prog = Math.min(100, Math.round((stableCountRef.current / 6) * 100));
          setStabilityProgress(prog);

          if (stableCountRef.current >= 6) {
            stableCountRef.current = 0;
            setStabilityProgress(0);
            takePicture();
          }
        } else if (movement >= maxAllowedMove) {
          stableCountRef.current = Math.max(0, stableCountRef.current - 1);
          setStabilityProgress(Math.round((stableCountRef.current / 6) * 100));
        }
      } else {
        setDocDetected(false);
        stableCountRef.current = 0;
        setStabilityProgress(0);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [cameraError, autoSnap, batchMode]);

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
    if (!videoRef.current || isCapturingRef.current) return;
    isCapturingRef.current = true;

    setShutterEffect(true);
    setTimeout(() => {
      setShutterEffect(false);
      isCapturingRef.current = false;
    }, 350);

    if (navigator.vibrate) {
      navigator.vibrate(60);
    }

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      isCapturingRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    if (batchMode) {
      setBatchImages((prev) => [...prev, dataUrl]);
    } else {
      onCapture(dataUrl, smoothedCornersRef.current || undefined);
    }
  };

  // Handle Gallery file selection
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
    <div className="fixed inset-0 z-50 h-dvh bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Top Action Bar */}
      <div className="pt-safe z-20 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between px-4 pt-3 pb-4">
          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-900/70 border border-white/10 backdrop-blur-md text-white hover:bg-slate-800 transition active:scale-95"
            aria-label="Închide camera"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-2">
            {/* Auto-Snap AI Toggle */}
            <button
              onClick={() => {
                setAutoSnap(!autoSnap);
                stableCountRef.current = 0;
                setStabilityProgress(0);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md transition ${
                autoSnap
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-900/75 text-slate-300 border border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {autoSnap ? 'Auto-Scan ON' : 'Manual'}
            </button>

            {/* Batch Mode Toggle */}
            <button
              onClick={() => setBatchMode(!batchMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md transition ${
                batchMode
                  ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/30'
                  : 'bg-slate-900/70 text-slate-300 hover:text-white border border-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {batchMode ? 'Multiplu' : '1 Pag'}
            </button>

            {/* Torch Toggle */}
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`p-2.5 rounded-full backdrop-blur-md transition ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900/70 text-white hover:bg-slate-800 border border-white/10'
                }`}
                aria-label="Lanternă"
              >
                {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
              </button>
            )}

            {/* Camera Flip */}
            <button
              onClick={toggleFacingMode}
              className="p-2.5 rounded-full bg-slate-900/70 border border-white/10 backdrop-blur-md text-white hover:bg-slate-800 transition active:scale-95"
              aria-label="Schimbă camera"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Video Viewport & Live AI Document Overlay */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="p-6 text-center max-w-sm mx-auto glass-card rounded-3xl">
            <p className="text-rose-400 mb-4 text-sm font-medium">{cameraError}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-extrabold shadow-lg text-sm inline-flex items-center gap-2"
            >
              <ImageIcon className="w-4 h-4" />
              Alege din Galerie
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Live Document Boundary Canvas Overlay */}
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />
          </>
        )}

        {/* Shutter Flash Animation */}
        {shutterEffect && (
          <div className="absolute inset-0 bg-white/80 pointer-events-none z-30 transition-opacity duration-150 animate-pulse" />
        )}

        {/* Dynamic Status Pill */}
        {!cameraError && (
          <div className="absolute bottom-5 inset-x-4 flex justify-center pointer-events-none z-20">
            <div
              className={`px-4 py-1.5 rounded-full text-xs font-bold backdrop-blur-md border transition-all flex items-center gap-2 text-center ${
                docDetected
                  ? 'bg-emerald-950/85 border-emerald-400/60 text-emerald-200 shadow-lg shadow-emerald-950/50'
                  : 'bg-black/70 border-white/15 text-slate-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  docDetected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                }`}
              />
              <span className="truncate">
                {docDetected
                  ? autoSnap && stabilityProgress > 15
                    ? `Document încadrat • Ține nemișcat (${stabilityProgress}%)`
                    : 'Document detectat automat — Apasă sau ține nemișcat'
                  : 'Îndreaptă camera spre foaie (va fi încadrată automat)'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="pb-safe bg-gradient-to-t from-black via-black/85 to-transparent z-20">
        <div className="max-w-xl mx-auto w-full px-6 pt-3 pb-6 flex items-center justify-between">
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
              className="p-3.5 rounded-2xl bg-slate-900/85 border border-slate-700/70 text-slate-200 hover:text-white hover:bg-slate-800 transition active:scale-95 flex flex-col items-center justify-center gap-1 shadow-lg"
              title="Importă din galerie"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Big Shutter Button with Auto-Snap Progress Ring */}
          <div className="relative flex items-center justify-center">
            <button
              onClick={takePicture}
              disabled={!!cameraError}
              className={`w-20 h-20 rounded-full border-4 p-1.5 flex items-center justify-center shadow-2xl transition active:scale-90 group disabled:opacity-50 ${
                docDetected ? 'border-emerald-400' : 'border-white/80'
              }`}
              aria-label="Fă fotografie"
            >
              <div
                className={`w-full h-full rounded-full transition-colors shadow-inner flex items-center justify-center ${
                  docDetected
                    ? 'bg-emerald-400 group-hover:bg-emerald-300'
                    : 'bg-white group-hover:bg-emerald-400'
                }`}
              >
                {autoSnap && stabilityProgress > 0 && (
                  <span className="text-xs font-extrabold text-slate-950">{stabilityProgress}%</span>
                )}
              </div>
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
    </div>
  );
};
