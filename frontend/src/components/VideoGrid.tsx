import type { PeerData, RemotePointer } from '../types';
import VideoTile from './VideoTile';

interface VideoGridProps {
  localStream: MediaStream | null;
  localParticipantId: string;
  localName: string;
  isLocalAudioEnabled: boolean;
  isLocalVideoEnabled: boolean;
  peers: Map<string, PeerData>;
  pointers: RemotePointer[];
  isScreenSharing: boolean;
  controllingPeerId?: string | null;
  onPointerEvent?: (peerId: string, x: number, y: number, clicking: boolean) => void;
}

export default function VideoGrid({
  localStream,
  localParticipantId,
  localName,
  isLocalAudioEnabled,
  isLocalVideoEnabled,
  peers,
  pointers,
  isScreenSharing,
  controllingPeerId = null,
  onPointerEvent,
}: VideoGridProps) {
  const peerList = Array.from(peers.values());
  const total = 1 + peerList.length;

  const gridClass = (() => {
    if (total === 1) return 'grid-cols-1 grid-rows-1';
    if (total === 2) return 'grid-cols-2 grid-rows-1';
    if (total <= 4) return 'grid-cols-2 grid-rows-2';
    if (total <= 6) return 'grid-cols-3 grid-rows-2';
    return 'grid-cols-4';
  })();

  return (
    <div className={`grid ${gridClass} gap-2 p-2 h-full`}>
      {/* Local video */}
      <VideoTile
        stream={localStream}
        participantId={localParticipantId}
        name={`${localName} (你)`}
        isAudioEnabled={isLocalAudioEnabled}
        isVideoEnabled={isLocalVideoEnabled}
        isMirror
        isLocal
        isScreenSharing={isScreenSharing}
        pointers={pointers.filter((p) => p.targetId === localParticipantId)}
        isBeingControlled={controllingPeerId === localParticipantId}
        onPointerEvent={controllingPeerId === localParticipantId && onPointerEvent
          ? (x, y, clicking) => onPointerEvent(localParticipantId, x, y, clicking)
          : undefined}
      />

      {/* Remote peers */}
      {peerList.map((peer) => (
        <VideoTile
          key={peer.participantId}
          stream={peer.stream}
          participantId={peer.participantId}
          name={peer.name}
          isAudioEnabled={peer.isAudioEnabled}
          isVideoEnabled={peer.isVideoEnabled}
          isMirror={false}
          isHost={peer.isHost}
          pointers={pointers.filter((p) => p.targetId === peer.participantId)}
          isBeingControlled={controllingPeerId === peer.participantId}
          onPointerEvent={controllingPeerId === peer.participantId && onPointerEvent
            ? (x, y, clicking) => onPointerEvent(peer.participantId, x, y, clicking)
            : undefined}
        />
      ))}
    </div>
  );
}
