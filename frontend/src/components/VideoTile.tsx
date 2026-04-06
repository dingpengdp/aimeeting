import { useEffect, useRef } from 'react';
import { MicOff, Crown } from 'lucide-react';
import type { RemotePointer } from '../types';

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
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      ref={containerRef}
      className="relative bg-meeting-surface rounded-xl overflow-hidden flex items-center justify-center"
    >
      {/* Video element */}
      {stream && isVideoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isMirror ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
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

      {/* Remote control pointers */}
      {pointers.map((pointer) => (
        <div
          key={pointer.participantId}
          className="absolute pointer-events-none z-10"
          style={{
            left: `${pointer.x * 100}%`,
            top: `${pointer.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Outer ring for click effect */}
          {pointer.clicking && (
            <div className="absolute w-8 h-8 rounded-full border-2 border-yellow-400 -translate-x-1/2 -translate-y-1/2 animate-ping" />
          )}
          {/* Cursor dot */}
          <div className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-white shadow-lg" />
          {/* Name label */}
          <div className="absolute top-5 left-5 bg-yellow-400 text-black text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-medium shadow">
            {pointer.name}
          </div>
        </div>
      ))}

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
