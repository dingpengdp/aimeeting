import { useState } from 'react';
import { MousePointer2, X, UserCheck, UserX, MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RemoteControlState, PeerData } from '../types';

interface RemoteControlPanelProps {
  rcState: RemoteControlState;
  peers: PeerData[];
  screenSharingPeerIds: string[];
  onRequestControl: (targetId: string) => void;
  onStopControl: (targetId: string) => void;
  onClose: () => void;
}

export default function RemoteControlPanel({
  rcState,
  peers,
  screenSharingPeerIds,
  onRequestControl,
  onStopControl,
  onClose,
}: RemoteControlPanelProps) {
  const { t } = useTranslation();
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // Clear requesting state when response arrives
  if (requestingId && (rcState.isControlling || rcState.lastRejectedId)) {
    setRequestingId(null);
  }

  const handleRequest = (peerId: string) => {
    setRequestingId(peerId);
    onRequestControl(peerId);
  };

  const sharingPeers = peers.filter((p) => screenSharingPeerIds.includes(p.participantId));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border">
        <div className="flex items-center gap-2 text-white font-medium">
          <MousePointer2 className="w-4 h-4 text-meeting-accent" />
          {t('remoteControlPanel.title')}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">

        {/* Description */}
        {!rcState.isControlling && !rcState.isBeingControlled && (
          <div className="bg-meeting-bg border border-meeting-border rounded-xl p-3">
            <p className="text-slate-400 text-xs leading-relaxed">
              <span className="text-meeting-accent font-medium">{t('remoteControlPanel.title')}</span>
              {'：'}
              {t('remoteControlPanel.desc')}
            </p>
          </div>
        )}

        {/* Currently being controlled */}
        {rcState.isBeingControlled && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-yellow-400" />
              <p className="text-yellow-300 text-sm font-medium">
                <span className="font-bold">{rcState.controllerName}</span>
                {' '}
                {t('remoteControlPanel.beingControlled')}
              </p>
            </div>
            <button
              onClick={() => rcState.controllerId && onStopControl(rcState.controllerId)}
              className="w-full flex items-center justify-center gap-2 bg-meeting-danger hover:bg-red-600
                         text-white text-sm font-medium py-2 rounded-xl transition-colors"
            >
              <UserX className="w-4 h-4" />
              {t('remoteControlPanel.stopControl')}
            </button>
          </div>
        )}

        {/* Currently controlling */}
        {rcState.isControlling && (
          <div className="bg-meeting-accent/10 border border-meeting-accent/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MousePointer2 className="w-4 h-4 text-meeting-accent" />
              <p className="text-meeting-accent text-sm font-medium">
                {t('remoteControlPanel.controlling')}
                {' '}
                <span className="font-bold">
                  {peers.find((p) => p.participantId === rcState.controllerId)?.name ?? rcState.controllerName ?? '…'}
                </span>
              </p>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              {t('remoteControlPanel.controlHint')}
            </p>
            <button
              onClick={() => rcState.controllerId && onStopControl(rcState.controllerId)}
              className="w-full flex items-center justify-center gap-2 bg-meeting-surface border border-meeting-border
                         hover:bg-meeting-border text-white text-sm py-2 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              {t('remoteControlPanel.stopControl')}
            </button>
          </div>
        )}

        {/* Screen-sharing peers list */}
        {!rcState.isControlling && !rcState.isBeingControlled && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              {t('remoteControlPanel.screenSharingPeers')}
            </p>

            {sharingPeers.length === 0 ? (
              <div className="text-center py-8">
                <MonitorPlay className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-500 text-sm">{t('remoteControlPanel.noSharingPeers')}</p>
                <p className="text-slate-600 text-xs mt-1">{t('remoteControlPanel.noSharingHint')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sharingPeers.map((peer) => {
                  const isRequesting = requestingId === peer.participantId;
                  return (
                    <div
                      key={peer.participantId}
                      className="flex items-center justify-between bg-meeting-bg border border-meeting-border rounded-xl px-3 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-meeting-accent/20 flex items-center justify-center">
                          <span className="text-xs text-meeting-accent font-bold">
                            {peer.name[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-300 text-sm">{peer.name}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-xs text-green-400">sharing</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => !isRequesting && handleRequest(peer.participantId)}
                          disabled={isRequesting}
                          className="bg-meeting-accent/20 hover:bg-meeting-accent border border-meeting-accent/50
                                     text-meeting-accent hover:text-white text-xs px-3 py-1.5 rounded-lg
                                     transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {isRequesting ? t('remoteControlPanel.requesting') : t('remoteControlPanel.requestControl')}
                        </button>
                        {rcState.lastRejectedId === peer.participantId && (
                          <span className="text-xs text-red-400">{t('remoteControlPanel.rejected')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
