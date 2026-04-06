import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingState } from '../types';
import { apiFetch } from '../services/api';
import { getSocket } from '../services/socket';
import { getStoredToken } from '../services/session';

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

interface UseRecordingOptions {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: MediaStream[];
  remotePresenterStream: MediaStream | null;
}

export function useRecording({ localStream, screenStream, remoteStreams, remotePresenterStream }: UseRecordingOptions) {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    duration: 0,
    serverFileId: null,
    isTranscribing: false,
    transcription: null,
    isGeneratingMinutes: false,
    minutes: null,
    error: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const videoElemsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Keep latest stream refs so the RAF loop always uses current values
  const localStreamRef = useRef(localStream);
  const screenStreamRef = useRef(screenStream);
  const remoteStreamsRef = useRef(remoteStreams);
  const remotePresenterStreamRef = useRef(remotePresenterStream);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);
  useEffect(() => { remoteStreamsRef.current = remoteStreams; }, [remoteStreams]);
  useEffect(() => { remotePresenterStreamRef.current = remotePresenterStream; }, [remotePresenterStream]);

  const update = useCallback((partial: Partial<RecordingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Socket event listeners for server-side recording results ────────────
  useEffect(() => {
    const socket = getSocket();

    socket.on('recording-saved', ({ fileId, duration }: { fileId: string; duration: number }) => {
      update({ serverFileId: fileId, duration, isTranscribing: true });
    });

    socket.on('recording-transcribed', ({ transcription }: { transcription: string }) => {
      update({ transcription, isTranscribing: false, isGeneratingMinutes: true });
    });

    socket.on('recording-minutes', ({ minutes }: { minutes: string }) => {
      update({ minutes, isGeneratingMinutes: false });
    });

    socket.on('recording-minutes-error', ({ message }: { message: string }) => {
      update({ isGeneratingMinutes: false, error: `纪要生成失败: ${message}` });
    });

    socket.on('recording-error', ({ message }: { message: string }) => {
      update({ isTranscribing: false, isGeneratingMinutes: false, error: `服务端处理失败: ${message}` });
    });

    return () => {
      socket.off('recording-saved');
      socket.off('recording-transcribed');
      socket.off('recording-minutes');
      socket.off('recording-minutes-error');
      socket.off('recording-error');
    };
  }, [update]);

  const getVideoElem = useCallback((id: string, stream: MediaStream): HTMLVideoElement => {
    let el = videoElemsRef.current.get(id);
    if (!el) {
      el = document.createElement('video');
      el.autoplay = true;
      el.muted = true;
      el.playsInline = true;
      el.srcObject = stream;
      el.play().catch(() => {});
      videoElemsRef.current.set(id, el);
    } else if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
    return el;
  }, []);

  const cleanupCanvas = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    videoElemsRef.current.forEach((el) => { el.srcObject = null; });
    videoElemsRef.current.clear();
  }, []);

  const buildMixedStream = useCallback((): MediaStream => {
    const W = 1280;
    const H = 720;

    // ── Audio: mix all participant streams ────────────────────────────────
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const audioDest = audioCtx.createMediaStreamDestination();

    const addAudio = (stream: MediaStream) => {
      if (stream.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(stream).connect(audioDest);
      }
    };
    if (localStream) addAudio(localStream);
    remoteStreams.forEach(addAudio);
    // Note: screen share audio (system audio) is included if the user granted it
    if (screenStream) addAudio(screenStream);

    // ── Video: canvas compositor ──────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx2d = canvas.getContext('2d')!;

    const drawFrame = () => {
      const ls = localStreamRef.current;
      const ss = screenStreamRef.current;
      const rs = remoteStreamsRef.current;
      const rps = remotePresenterStreamRef.current;

      ctx2d.fillStyle = '#0f172a';
      ctx2d.fillRect(0, 0, W, H);

      const hasScreenVideo = ss && ss.active && ss.getVideoTracks().length > 0;
      const hasRemotePresenter = !hasScreenVideo && rps && rps.active && rps.getVideoTracks().length > 0;

      if (hasScreenVideo) {
        // ── Screen share mode: screen fills frame, local cam as PiP ──────
        const screenEl = getVideoElem('screen', ss!);
        if (screenEl.readyState >= 2) {
          ctx2d.drawImage(screenEl, 0, 0, W, H);
        }
        if (ls && ls.getVideoTracks().length > 0) {
          const pipW = 240;
          const pipH = 135;
          const pipX = W - pipW - 16;
          const pipY = H - pipH - 16;
          const camEl = getVideoElem('local', ls);
          if (camEl.readyState >= 2) {
            ctx2d.drawImage(camEl, pipX, pipY, pipW, pipH);
            ctx2d.strokeStyle = '#3b82f6';
            ctx2d.lineWidth = 2;
            ctx2d.strokeRect(pipX, pipY, pipW, pipH);
          }
        }
      } else if (hasRemotePresenter) {
        // ── Remote presenter mode: remote screen/control fills frame, local cam as PiP ──
        const presenterEl = getVideoElem('remote-presenter', rps!);
        if (presenterEl.readyState >= 2) {
          ctx2d.drawImage(presenterEl, 0, 0, W, H);
        }
        if (ls && ls.getVideoTracks().length > 0) {
          const pipW = 240;
          const pipH = 135;
          const pipX = W - pipW - 16;
          const pipY = H - pipH - 16;
          const camEl = getVideoElem('local', ls);
          if (camEl.readyState >= 2) {
            ctx2d.drawImage(camEl, pipX, pipY, pipW, pipH);
            ctx2d.strokeStyle = '#3b82f6';
            ctx2d.lineWidth = 2;
            ctx2d.strokeRect(pipX, pipY, pipW, pipH);
          }
        }
      } else {
        // ── Camera grid mode ──────────────────────────────────────────────
        const sources: Array<{ id: string; stream: MediaStream }> = [];
        if (ls && ls.getVideoTracks().length > 0) {
          sources.push({ id: 'local', stream: ls });
        }
        rs.forEach((s, i) => {
          if (s.getVideoTracks().length > 0) {
            sources.push({ id: `remote-${i}`, stream: s });
          }
        });

        const count = sources.length;
        if (count === 0) {
          ctx2d.fillStyle = '#334155';
          ctx2d.font = 'bold 20px sans-serif';
          ctx2d.textAlign = 'center';
          ctx2d.textBaseline = 'middle';
          ctx2d.fillText('AiMeeting · 录制中', W / 2, H / 2);
        } else if (count === 1) {
          const el = getVideoElem(sources[0].id, sources[0].stream);
          if (el.readyState >= 2) ctx2d.drawImage(el, 0, 0, W, H);
        } else {
          const cols = count <= 4 ? 2 : 3;
          const rows = Math.ceil(count / cols);
          const cellW = Math.floor(W / cols);
          const cellH = Math.floor(H / rows);
          sources.forEach((src, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const el = getVideoElem(src.id, src.stream);
            if (el.readyState >= 2) {
              ctx2d.drawImage(el, col * cellW, row * cellH, cellW, cellH);
            }
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const canvasStream = canvas.captureStream(30);
    return new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);
  }, [localStream, screenStream, remoteStreams, remotePresenterStream, getVideoElem]);

  const startRecording = useCallback(() => {
    if (state.isRecording) return;

    const mixedStream = buildMixedStream();
    const mimeType = pickMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const socket = getSocket();

    try {
      const recorder = new MediaRecorder(mixedStream, options);
      recorderRef.current = recorder;

      socket.emit('recording-start', { mimeType });

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const buffer = await e.data.arrayBuffer();
          socket.emit('recording-chunk', buffer);
        }
      };

      recorder.onstop = () => {
        socket.emit('recording-stop');
        cleanupCanvas();
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        update({ isRecording: false, isTranscribing: true });
      };

      recorder.start(1000);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        update({ duration: Math.floor((Date.now() - startTimeRef.current) / 1000) });
      }, 1000);

      update({
        isRecording: true,
        duration: 0,
        serverFileId: null,
        isTranscribing: false,
        transcription: null,
        isGeneratingMinutes: false,
        minutes: null,
        error: null,
      });
    } catch (err) {
      cleanupCanvas();
      update({ error: `录制启动失败: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [state.isRecording, buildMixedStream, cleanupCanvas, update]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const downloadRecording = useCallback(async () => {
    if (!state.serverFileId) return;
    try {
      const token = getStoredToken();
      const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
      const res = await fetch(`${BACKEND_URL}/api/recordings/${encodeURIComponent(state.serverFileId)}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore download errors
    }
  }, [state.serverFileId]);

  const generateMinutes = useCallback(async () => {
    if (!state.transcription) return;
    update({ isGeneratingMinutes: true, error: null });

    try {
      const { minutes } = await apiFetch<{ minutes: string }>('/api/recordings/minutes', {
        method: 'POST',
        body: JSON.stringify({ transcription: state.transcription }),
      });
      update({ isGeneratingMinutes: false, minutes });
    } catch (err) {
      update({
        isGeneratingMinutes: false,
        error: `生成纪要失败: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [state.transcription, update]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
      cleanupCanvas();
      audioCtxRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cleanupCanvas]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    ...state,
    startRecording,
    stopRecording,
    downloadRecording,
    generateMinutes,
    formatDuration,
  };
}
