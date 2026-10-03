import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  Camera,
  Zap,
  ZapOff,
  ChevronLeft,
  Lock,
  Send,
  Trash2,
  X,
  Loader2,
  Circle,
  Mic,
  VideoOff,
  RefreshCw,
} from "lucide-react";
import { useChatStore } from "../stores/chatStore";
import { useAuthStore } from "../stores/authStore";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useLang } from "../lib/i18n";

// --- Types ---

type RecordingState =
  | "IDLE"
  | "RECORDING"
  | "LOCKED"
  | "CANCELLING"
  | "SENDING";

interface VideoCircleRecorderProps {
  chatId: string;
  onClose: () => void;
  autoStart?: boolean;
}

// --- Constants ---

const MAX_DURATION = 60;
const CANCEL_THRESHOLD = 100;
const LOCK_THRESHOLD = 75;
const MIN_RECORDING = 1;
const CIRCLE_SIZE = 360;
const BTN_SIZE = 88;

// --- MIME type fallback ---

function getMimeType(): string {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    // iOS Safari / часть WebView умеют только mp4
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/** Расширение файла, соответствующее выбранному mimeType */
function extFromMime(mime: string): string {
  return mime.includes("mp4") ? "mp4" : "webm";
}

// --- Utility ---

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ds = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")},${ds}`;
}
function VideoCircleRecorder({ chatId, onClose, autoStart = false }: VideoCircleRecorderProps) {
  const user = useAuthStore(s => s.user);
  const t = useLang(s => s.t);
  const replyTo = useChatStore(s => s.replyTo);
  const setReplyTo = useChatStore(s => s.setReplyTo);

  const [recState, setRecState] = useState<RecordingState>("IDLE");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [flashOn, setFlashOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [isCanvasMode, setIsCanvasMode] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasAnimRef = useRef<number | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const mimeRef = useRef(getMimeType());

  const [slideOffset, setSlideOffset] = useState(0);
  const [lockOffset, setLockOffset] = useState(0);
  const [gestureMode, setGestureMode] = useState<"none" | "horizontal" | "vertical">("none");
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const slideRef = useRef(0);
  const lockRef = useRef(0);

  const [isUploading, setIsUploading] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  // --- Camera lifecycle ---

  const startCamera = useCallback(async (face: "user" | "environment") => {
    if (canvasAnimRef.current) {
      cancelAnimationFrame(canvasAnimRef.current);
      canvasAnimRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    setIsCanvasMode(false);
    setCamReady(false);
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: face,
          width: { ideal: 480 },
          height: { ideal: 480 },
          aspectRatio: { ideal: 1 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamReady(true);
      setFlashOn(false);
    } catch (err: any) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        setCamError("camera_permission");
      else if (err.name === "NotReadableError" || err.name === "AbortError")
        setCamError("camera_busy");
      else if (err.name === "NotFoundError")
        setCamError("camera_unavailable");
      else
        setCamError("camera_error");
    }
  }, []);

  // --- Canvas fallback: record without camera ---

  const startCanvasAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let startTs: number | null = null;
    const draw = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // dark gradient background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(0.5, "#16213e");
      grad.addColorStop(1, "#0f3460");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // pulsing circle
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) * 0.3;
      const pulse = 1 + 0.08 * Math.sin(elapsed * 2.5);
      const cr = r * pulse;

      // outer glow
      const glow = ctx.createRadialGradient(cx, cy, cr * 0.5, cx, cy, cr * 1.6);
      glow.addColorStop(0, "rgba(51,144,236,0.25)");
      glow.addColorStop(1, "rgba(51,144,236,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // circle rim
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();

      // inner mic icon style dot
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      canvasAnimRef.current = requestAnimationFrame(draw);
    };
    canvasAnimRef.current = requestAnimationFrame(draw);
  }, []);

  const startCanvasStream = useCallback(async () => {
    // clean up any existing camera/canvas stream
    if (canvasAnimRef.current) {
      cancelAnimationFrame(canvasAnimRef.current);
      canvasAnimRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
    setCamReady(false);
    setCamError(null);

    const canvas = canvasRef.current;
    if (!canvas) {
      setCamError("camera_error");
      return;
    }

    try {
      // microphone audio (fallback to silent track if mic unavailable)
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // create a silent audio track so MediaRecorder still produces valid video
        try {
          const audioCtx = new AudioContext();
          const dest = audioCtx.createMediaStreamDestination();
          audioStream = dest.stream;
        } catch { /* audio not available */ }
      }

      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : []),
      ]);

      streamRef.current = combined;
      if (videoRef.current) {
        videoRef.current.srcObject = combined;
        await videoRef.current.play();
      }
      setIsCanvasMode(true);
      startCanvasAnimation();
      setCamReady(true);
    } catch {
      setCamError("camera_error");
    }
  }, [startCanvasAnimation]);

  useEffect(() => {
    startCamera(facingMode);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      if (timerRef.current) clearInterval(timerRef.current);
      if (canvasAnimRef.current) {
        cancelAnimationFrame(canvasAnimRef.current);
        canvasAnimRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // --- Camera toggle + Flash ---

  const toggleCamera = useCallback(() => {
    if (recState === "SENDING" || isCanvasMode) return;
    const newFace = facingMode === "user" ? "environment" : "user";
    setFacingMode(newFace);
    if (recState === "RECORDING" || recState === "LOCKED") {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFace, width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 } },
        audio: false,
      }).then(newVideoStream => {
        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        if (!newVideoTrack || !streamRef.current) return;
        const oldVideoTrack = streamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          streamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        streamRef.current.addTrack(newVideoTrack);
        if (videoRef.current) videoRef.current.srcObject = streamRef.current;
        setCamReady(true);
        setFlashOn(false);
      }).catch(err => console.error("Failed to switch camera:", err));
    } else {
      startCamera(newFace);
    }
    setAnimKey(k => k + 1);
  }, [facingMode, recState, startCamera, isCanvasMode]);

  const toggleFlash = useCallback(async () => {
    if (!streamRef.current || isCanvasMode) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      const capabilities = videoTrack.getCapabilities?.() as any;
      if (!capabilities?.torch) return;
      const newState = !flashOn;
      await videoTrack.applyConstraints({ advanced: [{ torch: newState }] as any });
      setFlashOn(newState);
    } catch { /* torch not supported */ }
  }, [flashOn, isCanvasMode]);


  // --- Recording logic ---

  const startRecording = useCallback(() => {
    if (!streamRef.current || recState !== "IDLE") return;
    const mimeType = mimeRef.current;
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(streamRef.current, { mimeType }); }
    catch { recorder = new MediaRecorder(streamRef.current); }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onerror = () => cancelRecording();
    recorder.start(250);
    mediaRecorderRef.current = recorder;
    setRecState("RECORDING");
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    timerRef.current = setInterval(() => {
      recordingTimeRef.current += 1;
      setRecordingTime(t => { const next = t + 1; if (next >= MAX_DURATION) stopRecording(); return next; });
    }, 1000);
  }, [recState]);

  useEffect(() => {
    if (!autoStart) return;
    if (!camReady || recState !== "IDLE") return;
    const t = setTimeout(() => startRecording(), 150);
    return () => clearTimeout(t);
  }, [autoStart, camReady, recState, startRecording]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
    if (recorder && recorder.state === "recording") {
      recorder.onstop = async () => {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        const dur = recordingTimeRef.current;
        if (dur < MIN_RECORDING) {
          setRecState("IDLE"); setRecordingTime(0); recordingTimeRef.current = 0; chunksRef.current = [];
          if (isCanvasMode) startCanvasStream();
          else startCamera(facingMode);
          return;
        }
        setRecState("SENDING"); setIsUploading(true);
        try {
          const file = new File([blob], `video_message_${Date.now()}.${extFromMime(mimeRef.current)}`, { type: mimeRef.current });
          const result = await api.uploadFile(file);
          const socket = getSocket();
          if (!socket) {
            console.error("❌ VideoCircle: сокет не подключён — видео загружено, но не отправлено");
            alert("Ошибка отправки: нет соединения с сервером. Попробуйте перезагрузить страницу.");
            setRecState("IDLE"); onClose();
            return;
          }
          socket.emit("send_message", {
            chatId, content: null, type: "video_message", mediaUrl: result.url,
            mediaType: "video", fileName: result.filename, fileSize: result.size,
            duration: dur, replyToId: replyTo?.id || null,
          });
          setReplyTo(null);
          setRecState("IDLE"); onClose();
        } catch (err) { console.error("Failed to send video:", err); alert("Не удалось отправить видеосообщение: " + (err instanceof Error ? err.message : "неизвестная ошибка")); setRecState("IDLE"); onClose(); }
        finally { setIsUploading(false); setRecordingTime(0); recordingTimeRef.current = 0; chunksRef.current = []; }
      };
      recorder.stop();
    }
  }, [chatId, facingMode, onClose, replyTo, setReplyTo, startCamera, isCanvasMode, startCanvasStream]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
    if (recorder && (recorder.state === "recording" || recorder.state === "paused")) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.stop();
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    mediaRecorderRef.current = null; chunksRef.current = [];
    setRecordingTime(0); recordingTimeRef.current = 0;
    setSlideOffset(0); setLockOffset(0); slideRef.current = 0; lockRef.current = 0;
    setGestureMode("none"); pointerStartRef.current = null;
    setRecState("IDLE");
    if (isCanvasMode) startCanvasStream();
    else startCamera(facingMode);
    setAnimKey(k => k + 1);
  }, [facingMode, startCamera, isCanvasMode, startCanvasStream]);


  // --- Gesture handlers ---

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (recState === "SENDING" || recState === "CANCELLING") return;
    e.preventDefault(); e.stopPropagation();
    const btn = btnRef.current;
    if (btn) btn.setPointerCapture(e.pointerId);
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    slideRef.current = 0; lockRef.current = 0;
    setSlideOffset(0); setLockOffset(0); setGestureMode("none");
    if (recState === "LOCKED") return;
    if (recState === "IDLE") startRecording();
  }, [recState, startRecording]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current || recState === "SENDING" || recState === "CANCELLING" || recState === "LOCKED") return;
    e.preventDefault();
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    if (gestureMode === "none") {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) setGestureMode("horizontal");
      else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) setGestureMode("vertical");
    }
    if (gestureMode === "horizontal") {
      const offset = Math.min(0, dx);
      slideRef.current = offset; lockRef.current = 0;
      setSlideOffset(offset); setLockOffset(0);
    } else if (gestureMode === "vertical") {
      const offset = Math.min(0, dy);
      lockRef.current = offset; slideRef.current = 0;
      setLockOffset(offset); setSlideOffset(0);
    }
  }, [recState, gestureMode]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (recState === "SENDING" || recState === "CANCELLING") return;
    const btn = btnRef.current;
    if (btn) btn.releasePointerCapture(e.pointerId);
    const finalDx = slideRef.current;
    const finalDy = lockRef.current;
    pointerStartRef.current = null;
    if (finalDx <= -CANCEL_THRESHOLD) {
      setRecState("CANCELLING");
      try { navigator.vibrate?.(30); } catch {}
      setTimeout(() => cancelRecording(), 200);
      return;
    }
    if (finalDy <= -LOCK_THRESHOLD) {
      setRecState("LOCKED");
      setSlideOffset(0); setLockOffset(0); slideRef.current = 0; lockRef.current = 0; setGestureMode("none");
      try { navigator.vibrate?.(20); } catch {}
      return;
    }
    if (recState === "RECORDING") stopRecording();
    setSlideOffset(0); setLockOffset(0); slideRef.current = 0; lockRef.current = 0; setGestureMode("none");
  }, [recState, stopRecording, cancelRecording]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    handlePointerUp(e);
  }, [handlePointerUp]);

  const handleLockedStop = useCallback(() => { if (recState === "LOCKED") stopRecording(); }, [recState, stopRecording]);
  const handleLockedCancel = useCallback(() => {
    if (recState === "LOCKED") { setRecState("CANCELLING"); setTimeout(() => cancelRecording(), 200); }
  }, [recState, cancelRecording]);


  // --- Derived ---

  const isCancelZone = slideOffset <= -CANCEL_THRESHOLD;
  const isLockZone = lockOffset <= -LOCK_THRESHOLD;
  const isRecording = recState === "RECORDING" || recState === "LOCKED";
  const cancelProgress = Math.min(1, Math.abs(slideOffset) / CANCEL_THRESHOLD);
  const lockProgress = Math.min(1, Math.abs(lockOffset) / LOCK_THRESHOLD);
  const btnScale = recState === "RECORDING" ? 1.15 : 1;


  // --- Main render ---

  const errorText =
    camError === "camera_permission" ? t("camera_permission_text") :
    camError === "camera_busy" ? t("camera_busy_text") :
    camError === "camera_unavailable" ? t("camera_unavailable_text") :
    camError ? t("camera_error_text") : "";

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-black select-none"
      style={{ paddingTop: "env(safe-area-inset-top, 12px)", paddingBottom: "env(safe-area-inset-bottom, 12px)" }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Hidden canvas used as a video source when the camera is unavailable */}
      <canvas
        ref={canvasRef}
        width={480}
        height={480}
        className="absolute opacity-0 pointer-events-none"
        aria-hidden="true"
      />
      {/* Top bar */}
      <div className="w-full flex items-center justify-between px-4 pt-2 pb-1 flex-shrink-0">
        <button
          onClick={() => { if (isRecording) cancelRecording(); onClose(); }}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
          aria-label="Закрыть"
        >
          <X size={22} className="text-white" />
        </button>

        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2"
            >
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"
              />
              <span className="text-white font-mono text-lg font-medium tracking-wider tabular-nums min-w-[54px]">
                {formatTime(recordingTime)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {isCanvasMode && (
            <span className="text-xs text-white/50 bg-white/10 rounded-full px-3 py-1 font-medium">
              {t("recordWithoutCamera")}
            </span>
          )}
          {!isCanvasMode && <div className="w-10" />}
      </div>


      {/* Center: Circular preview */}
      <div className="flex-1 flex items-center justify-center w-full px-4 overflow-hidden py-2">
        <motion.div
          key={`preview-${animKey}`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative flex-shrink-0"
          style={{
            width: `min(${CIRCLE_SIZE}px, calc(100vw - 40px))`,
            height: `min(${CIRCLE_SIZE}px, calc(100vw - 40px))`,
          }}
        >
          <div
            className="absolute inset-0 rounded-full overflow-hidden bg-zinc-900"
            style={{
              boxShadow: isRecording
                ? "0 0 0 3px rgba(239,68,68,0.55), 0 0 50px rgba(239,68,68,0.2)"
                : "0 0 0 2px rgba(255,255,255,0.08)",
              transition: "box-shadow 0.35s ease",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: facingMode === "user" ? "scaleX(-1)" : "scaleX(1)" }}
            />
            {!camReady && !camError && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                <Loader2 size={36} className="text-white/40 animate-spin" />
              </div>
            )}
            {camError && recState === "IDLE" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/95 p-6 text-center z-10">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
                  <VideoOff size={26} className="text-white/60" />
                </div>
                <p className="text-white/80 text-sm font-medium leading-tight max-w-[260px]">
                  {errorText}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); startCamera(facingMode); }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition"
                  >
                    <RefreshCw size={14} /> {t("retry")}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); startCanvasStream(); }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#3390ec] hover:bg-[#3390ec]/80 text-white text-xs font-medium transition"
                  >
                    <Mic size={14} /> {t("recordWithoutCamera")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {isRecording && (
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="48"
                fill="none"
                stroke="rgba(239,68,68,0.55)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 48}
                strokeDashoffset={(1 - recordingTime / MAX_DURATION) * 2 * Math.PI * 48}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
          )}

          <AnimatePresence>
            {recState === "LOCKED" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3.5 py-1.0 rounded-full bg-black/70 backdrop-blur-xl border border-white/10"
              >
                <Lock size={12} className="text-white" />
                <span className="text-white text-xs font-medium">Запись заблокирована</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>


      {/* Bottom: Controls */}
      <div className="w-full flex-shrink-0 px-4 pb-3 pt-1">
        <AnimatePresence mode="wait">
          {recState === "LOCKED" ? (
            <motion.div
              key="locked"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-between w-full max-w-md mx-auto"
            >
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleFlash}
                className={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${
                  flashOn ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
                aria-label={flashOn ? "Выключить вспышку" : "Включить вспышку"}
              >
                {flashOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleLockedCancel}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-red-500/15 hover:bg-red-500/25 transition-colors border border-red-500/20"
                aria-label="Отменить запись"
              >
                <Trash2 size={22} className="text-red-400" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleLockedStop}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-white hover:bg-white/95 transition-colors shadow-xl shadow-white/10"
                aria-label="Отправить видео"
              >
                <Send size={22} className="text-black translate-x-[1px]" />
              </motion.button>
            </motion.div>
          ) : recState === "SENDING" ? (
            <motion.div
              key="sending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex items-center justify-center gap-3 w-full max-w-md mx-auto py-4"
            >
              <Loader2 size={22} className="text-blue-400 animate-spin" />
              <span className="text-white/70 text-sm font-medium">Отправка...</span>
            </motion.div>
          ) : (
            <motion.div
              key="controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between w-full max-w-md mx-auto relative"
            >
              {/* Left: Flash + Camera switch */}
              {!isCanvasMode && (
              <div className="flex flex-col items-center gap-2 z-10">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={toggleFlash}
                  className={`w-11 h-11 flex items-center justify-center rounded-full transition-all ${
                    flashOn ? "bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/10" : "bg-white/8 text-white/50 hover:bg-white/12"
                  }`}
                  aria-label={flashOn ? "Выключить вспышку" : "Включить вспышку"}
                >
                  {flashOn ? <Zap size={18} /> : <ZapOff size={18} />}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={toggleCamera}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/12 transition-colors text-white/50"
                  aria-label="Переключить камеру"
                >
                  <Camera size={18} />
                </motion.button>
              </div>
              )}


              {/* Center: Cancel hint (swipe left) */}
              <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none" style={{ bottom: "calc(100% + 18px)" }}>
                <AnimatePresence>
                  {recState === "RECORDING" && gestureMode !== "vertical" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{
                        opacity: isCancelZone ? 1 : Math.max(0.45, cancelProgress * 0.7),
                        y: 0,
                      }}
                      exit={{ opacity: 0, y: 6 }}
                      className="flex items-center gap-1.5"
                    >
                      <motion.div animate={{ x: isCancelZone ? -4 : 0 }} className="flex items-center gap-1.5">
                        <ChevronLeft
                          size={16}
                          className={isCancelZone ? "text-red-400" : "text-white/40"}
                        />
                        <span
                          className={`text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
                            isCancelZone ? "text-red-400" : "text-white/40"
                          }`}
                        >
                          {isCancelZone ? "Отпустите для отмены" : "← Влево — отмена"}
                        </span>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right: Lock destination + Record button */}
              <div className="flex flex-col items-center z-10 relative">
                <AnimatePresence>
                  {recState === "RECORDING" && gestureMode === "vertical" && !isLockZone && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
                      style={{ bottom: "calc(100% + 4px)" }}
                    >
                      <motion.div
                        className="w-8 h-8 rounded-full bg-white/12 backdrop-blur-md border border-white/15 flex items-center justify-center"
                        style={{
                          opacity: Math.min(0.85, lockProgress + 0.25),
                          transform: `translateY(${Math.max(lockOffset * 0.25, -12)}px)`,
                        }}
                      >
                        <Lock size={13} className="text-white/60" />
                      </motion.div>
                      <span className="text-[10px] text-white/35 font-medium">Вверх — закрепить</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {isLockZone && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0 }}
                      className="absolute flex flex-col items-center gap-0.5 pointer-events-none"
                      style={{ bottom: "calc(100% + 8px)" }}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#3390ec] flex items-center justify-center shadow-lg shadow-[#3390ec]/40">
                        <Lock size={18} className="text-white" />
                      </div>
                      <span className="text-xs text-[#3390ec] font-medium">Закреплено</span>
                    </motion.div>
                  )}
                </AnimatePresence>


                {/* Record button */}
                <motion.button
                  ref={btnRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  style={{
                    transform: `scale(${btnScale}) translateX(${slideOffset * 0.25}px) translateY(${lockOffset * 0.25}px)`,
                    touchAction: "none",
                    width: `${BTN_SIZE}px`,
                    height: `${BTN_SIZE}px`,
                  }}
                  whileTap={{ scale: 0.92 }}
                  className={`relative flex items-center justify-center rounded-full transition-all duration-200 ease-out ${
                    isCancelZone
                      ? "bg-red-500 shadow-lg shadow-red-500/50"
                      : isLockZone
                        ? "bg-[#3390ec] shadow-lg shadow-[#3390ec]/50"
                        : recState === "RECORDING"
                          ? "bg-red-500 shadow-lg shadow-red-500/50"
                          : "bg-white shadow-xl shadow-white/10 hover:shadow-white/20"
                  }`}
                  aria-label={recState === "RECORDING" ? "Запись..." : "Начать запись"}
                >
                  {recState === "RECORDING" && !isCancelZone && !isLockZone && (
                    <div className="absolute inset-[-6px] rounded-full border-[3px] border-red-500/30 animate-ping" />
                  )}

                  {recState === "RECORDING" && (
                    <svg
                      className="absolute inset-0 w-full h-full -rotate-90"
                      viewBox={`0 0 ${BTN_SIZE} ${BTN_SIZE}`}
                    >
                      <circle
                        cx={BTN_SIZE / 2}
                        cy={BTN_SIZE / 2}
                        r={BTN_SIZE / 2 - 2.5}
                        fill="none"
                        stroke={isCancelZone ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)"}
                        strokeWidth="3"
                      />
                      <circle
                        cx={BTN_SIZE / 2}
                        cy={BTN_SIZE / 2}
                        r={BTN_SIZE / 2 - 2.5}
                        fill="none"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * (BTN_SIZE / 2 - 2.5)}
                        strokeDashoffset={(1 - recordingTime / MAX_DURATION) * 2 * Math.PI * (BTN_SIZE / 2 - 2.5)}
                        className="transition-[stroke-dashoffset] duration-300 ease-linear"
                      />
                    </svg>
                  )}

                  <AnimatePresence mode="wait">
                    {isCancelZone ? (
                      <motion.div key="trash" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Trash2 size={32} className="text-white" />
                      </motion.div>
                    ) : isLockZone ? (
                      <motion.div key="lock" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Lock size={32} className="text-white" />
                      </motion.div>
                    ) : recState === "RECORDING" ? (
                      <motion.div key="rec" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <div className="w-8 h-8 rounded-lg bg-white" />
                      </motion.div>
                    ) : (
                      <motion.div key="video" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                        <Video size={34} className="text-zinc-800" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

const MemoizedVideoCircleRecorder = memo(VideoCircleRecorder);
export { MemoizedVideoCircleRecorder as VideoCircleRecorder };
