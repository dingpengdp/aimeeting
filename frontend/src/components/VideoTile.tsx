import { useEffect, useRef, useState } from 'react';
import { MicOff, Crown } from 'lucide-react';
import type { RemotePointer } from '../types';

/**
 * Compute the object-cover rendered rect in container-local pixels.
 * Returns left/top offsets (can be negative = cropped) and rendered width/height.
 */
function computeCoverRect(cw: number, ch: number, vw: number, vh: number) {
  if (!vw || !vh || !cw || !ch) return { left: 0, top: 0, width: cw || 1, height: ch || 1 };
  const ca = cw / ch;
  const va = vw / vh;
  if (ca > va) {
    // container wider → fill width, crop top/bottom
    const renderH = cw / va;
    return { left: 0, top: (ch - renderH) / 2, width: cw, height: renderH };
  } else {
    // container taller → fill height, crop left/right
    const renderW = ch * va;
    return { left: (cw - renderW) / 2, top: 0, width: renderW, height: ch };
  }
}

interface VideoTileProps {
  stream: MediaStream | null;
  participantId: string;
  name: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isMirror?: boolean;
  isLocal?: boolean;
  isHost?: boolean;
  isScreenSharing?: boolean;
  pointers?: RemotePointer[];
  isBeingControlled?: boolean;
  onPointerEvent?: (x: number, y: number, clicking: boolean) => void;
  className?: string;
}

export default function VideoTile({
  stream,
  participantId,
  name,
  isAudioEnabled,
  isVideoEnabled,
  isMirror = false,
  isLocal = false,
  isHost = false,
  isScreenSharing = false,
  pointers = [],
  isBeingControlled = false,
  onPointerEvent,
  className = '',
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track intrinsic video size so pointer rendering updates when video loads
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isBeingControlled || !onPointerEvent || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vr = computeCoverRect(rect.width, rect.height, videoRef.current?.videoWidth ?? 0, videoRef.current?.videoHeight ?? 0);
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - vr.left) / vr.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - vr.top) / vr.height));
    onPointerEvent(x, y, false);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isBeingControlled || !onPointerEvent || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vr = computeCoverRect(rect.width, rect.height, videoRef.current?.videoWidth ?? 0, videoRef.current?.videoHeight ?? 0);
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left - vr.left) / vr.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top - vr.top) / vr.height));
    onPointerEvent(x, y, true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  // Keep videoSize in sync so pointer overlay re-renders with correct cover rect
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoSize({ w: video.videoWidth, h: video.videoHeight });
      }
    };
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('resize', update);
    if (video.videoWidth) update();
    return () => {
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('resize', update);
    };
  }, [stream]);

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hasLiveVideoTrack = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'));
  const shouldShowVideo = hasLiveVideoTrack && isVideoEnabled;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      className={`relative bg-meeting-surface rounded-xl overflow-hidden flex items-center justify-center${isBeingControlled ? ' cursor-crosshair ring-2 ring-meeting-accent' : ''} ${className}`}
    >
      {/* Video element — always in DOM so srcObject binding survives toggle */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${isMirror ? 'scale-x-[-1]' : ''} ${
          shouldShowVideo ? '' : 'hidden'
        }`}
      />

      {/* Avatar shown when video is off */}
      {!shouldShowVideo && (
        <div className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-[120px]">
          <div className="w-16 h-16 rounded-full bg-meeting-accent/20 flex items-center justify-center">
            <span className="text-2xl font-bold text-meeting-accent">{initials}</span>
          </div>
          <span className="text-slate-400 text-sm">{name}</span>
        </div>
      )}

      {/* Name tag */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-lg px-2 py-1 backdrop-blur-sm">
        {isHost && <Crown className="w-3 h-3 text-yellow-400" />}
        {isScreenSharing && (
          <span className="text-xs text-meeting-accent">屏幕共享</span>
        )}
        <span className="text-white text-xs font-medium max-w-[100px] truncate">{name}</span>
        {!isAudioEnabled && <MicOff className="w-3 h-3 text-meeting-danger flex-shrink-0" />}
      </div>

      {/* Speaking indicator */}
      {isAudioEnabled && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-meeting-success opacity-0 audio-indicator" />
      )}

      {/* Remote control pointers — only shown on remote tiles, not local (webcam ≠ screen share) */}
      {!isLocal && pointers.map((pointer) => {
        const cw = containerRef.current?.offsetWidth ?? 0;
        const ch = containerRef.current?.offsetHeight ?? 0;
        const vr = computeCoverRect(cw, ch, videoSize.w, videoSize.h);
        // Convert to percentage of container for CSS positioning
        const leftPct = cw > 0 ? ((vr.left + pointer.x * vr.width) / cw) * 100 : 50;
        const topPct = ch > 0 ? ((vr.top + pointer.y * vr.height) / ch) * 100 : 50;
        return (
          <div
            key={pointer.participantId}
            className="absolute pointer-events-none z-10"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {pointer.clicking && (
              <div className="absolute w-8 h-8 rounded-full border-2 border-yellow-400 -translate-x-1/2 -translate-y-1/2 animate-ping" />
            )}
            <div className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-white shadow-lg" />
            <div className="absolute top-5 left-5 bg-yellow-400 text-black text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-medium shadow">
              {pointer.name}
            </div>
          </div>
        );
      })}

      {/* Muted overlay badge */}
      {!isAudioEnabled && (
        <div className="absolute top-2 right-2 bg-meeting-danger/90 rounded-full p-1">
          <MicOff className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Participant ID (hidden, used for ref) */}
      <span className="hidden" data-participant-id={participantId} />
    </div>
  );
}
