import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Maximize2, Minimize2, Monitor } from 'lucide-react';
import type { PeerData, RemotePointer } from '../types';
import VideoTile from './VideoTile';

interface TileData {
  id: string;
  name: string;
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isMirror: boolean;
  isLocal: boolean;
  isHost: boolean;
  isScreenSharing: boolean;
}

interface VideoGridProps {
  localStream: MediaStream | null;
  localParticipantId: string;
  localName: string;
  isLocalAudioEnabled: boolean;
  isLocalVideoEnabled: boolean;
  peers: Map<string, PeerData>;
  pointers: RemotePointer[];
  isScreenSharing: boolean;
  screenSharingPeerIds: Set<string>;
  controllingPeerId?: string | null;
  onPointerEvent?: (peerId: string, x: number, y: number, clicking: boolean) => void;
}

type LayoutMode = 'spotlight' | 'grid';

export default function VideoGrid({
  localStream,
  localParticipantId,
  localName,
  isLocalAudioEnabled,
  isLocalVideoEnabled,
  peers,
  pointers,
  isScreenSharing,
  screenSharingPeerIds,
  controllingPeerId = null,
  onPointerEvent,
}: VideoGridProps) {
  const peerList = Array.from(peers.values());

  // Build tile list
  const localTile: TileData = {
    id: localParticipantId,
    name: `${localName} (你)`,
    stream: localStream,
    isAudioEnabled: isLocalAudioEnabled,
    isVideoEnabled: isLocalVideoEnabled,
    isMirror: true,
    isLocal: true,
    isHost: false,
    isScreenSharing,
  };
  const remoteTiles: TileData[] = peerList.map((p) => ({
    id: p.participantId,
    name: p.name,
    stream: p.stream,
    isAudioEnabled: p.isAudioEnabled,
    isVideoEnabled: p.isVideoEnabled,
    isMirror: false,
    isLocal: false,
    isHost: p.isHost,
    isScreenSharing: screenSharingPeerIds.has(p.participantId),
  }));
  const allTiles = [localTile, ...remoteTiles];

  // Determine whether anyone is sharing
  const anySharing = isScreenSharing || screenSharingPeerIds.size > 0;

  // Default spotlight ID: prefer the sharer, else first tile
  const defaultSpotlightId = (() => {
    if (isScreenSharing) return localParticipantId;
    for (const id of screenSharingPeerIds) return id;
    return allTiles[0]?.id ?? localParticipantId;
  })();

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!spotlightRef.current) return;
    if (!document.fullscreenElement) {
      spotlightRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Auto-switch to spotlight when sharing starts/stops
  useEffect(() => {
    if (anySharing) {
      setLayoutMode('spotlight');
      setPinnedId(null); // reset pin so sharer is auto-focused
    } else {
      setLayoutMode('grid');
      setPinnedId(null);
    }
  }, [anySharing]);

  const spotlightId = pinnedId ?? defaultSpotlightId;
  const spotlightTile = allTiles.find((t) => t.id === spotlightId) ?? allTiles[0];
  const thumbTiles = allTiles.filter((t) => t.id !== spotlightTile?.id);

  const total = allTiles.length;
  const gridClass = (() => {
    if (total === 1) return 'grid-cols-1';
    if (total === 2) return 'grid-cols-2';
    if (total <= 4) return 'grid-cols-2 grid-rows-2';
    if (total <= 6) return 'grid-cols-3 grid-rows-2';
    return 'grid-cols-4';
  })();

  const renderTile = (tile: TileData, className = '') => (
    <VideoTile
      key={tile.id}
      stream={tile.stream}
      participantId={tile.id}
      name={tile.name}
      isAudioEnabled={tile.isAudioEnabled}
      isVideoEnabled={tile.isVideoEnabled}
      isMirror={tile.isMirror}
      isLocal={tile.isLocal}
      isHost={tile.isHost}
      isScreenSharing={tile.isScreenSharing}
      pointers={pointers.filter((p) => p.targetId === tile.id)}
      isBeingControlled={controllingPeerId === tile.id}
      onPointerEvent={controllingPeerId === tile.id && onPointerEvent
        ? (x, y, clicking) => onPointerEvent(tile.id, x, y, clicking)
        : undefined}
      className={className}
    />
  );

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Layout toggle button — only show when there are multiple tiles */}
      {allTiles.length > 1 && (
        <div className="absolute top-3 right-3 z-20 flex gap-1 bg-black/50 rounded-lg p-1 backdrop-blur-sm">
          <button
            title="演讲者视图"
            onClick={() => setLayoutMode('spotlight')}
            className={`p-1.5 rounded-md transition-colors ${layoutMode === 'spotlight' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            title="网格视图"
            onClick={() => setLayoutMode('grid')}
            className={`p-1.5 rounded-md transition-colors ${layoutMode === 'grid' ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Spotlight layout ── */}
      {layoutMode === 'spotlight' && spotlightTile ? (
        <div className="flex h-full gap-2 p-2">
          {/* Main spotlight */}
          <div ref={spotlightRef} className={`flex-1 min-w-0 relative bg-meeting-bg ${isFullscreen ? 'flex items-center justify-center' : ''}`}>
            {renderTile(spotlightTile, isFullscreen ? 'w-full h-full' : 'w-full h-full')}
            {/* Pin indicator */}
            {pinnedId && !isFullscreen && (
              <button
                onClick={() => setPinnedId(null)}
                className="absolute top-2 left-2 z-10 text-xs bg-black/60 text-white px-2 py-1 rounded-lg hover:bg-black/80"
              >
                取消固定
              </button>
            )}
            {/* Fullscreen toggle — only shown when controlling */}
            {controllingPeerId && (
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? '退出全屏' : '全屏'}
                className="absolute top-2 right-2 z-20 p-1.5 bg-black/60 rounded-lg text-white hover:bg-black/80 transition-colors"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Thumbnail strip — only when there are others */}
          {thumbTiles.length > 0 && (
            <div className="flex flex-col gap-2 w-44 flex-shrink-0 overflow-y-auto">
              {thumbTiles.map((tile) => (
                <div
                  key={tile.id}
                  onClick={() => setPinnedId(tile.id)}
                  className={`relative flex-shrink-0 h-28 cursor-pointer rounded-xl overflow-hidden ring-2 transition-all hover:ring-meeting-accent ${
                    pinnedId === tile.id ? 'ring-meeting-accent' : 'ring-transparent'
                  }`}
                >
                  {renderTile(tile, 'w-full h-full')}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Grid layout ── */
        <div className={`grid ${gridClass} gap-2 p-2 h-full`}>
          {allTiles.map((tile) => renderTile(tile))}
        </div>
      )}
    </div>
  );
}
