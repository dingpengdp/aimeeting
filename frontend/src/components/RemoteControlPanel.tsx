import { useState } from 'react';
import { MousePointer2, X, UserCheck, UserX, MonitorPlay, Bot, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RemoteControlState, PeerData } from '../types';

interface RemoteControlPanelProps {
  rcState: RemoteControlState;
  peers: PeerData[];
  screenSharingPeerIds: string[];
  localAgentEnabled: boolean;
  onRequestControl: (targetId: string) => void;
  onStopControl: (targetId: string) => void;
  onClose: () => void;
}

export default function RemoteControlPanel({
  rcState,
  peers,
  screenSharingPeerIds,
  localAgentEnabled,
  onRequestControl,
  onStopControl,
  onClose,
}: RemoteControlPanelProps) {
  const { t } = useTranslation();
  const [requestingId, setRequestingId] = useState<string | null>(null);
  /** Peer for which we show the mode-confirm dialog, before actually sending request */
  const [confirmPeer, setConfirmPeer] = useState<PeerData | null>(null);

  // Clear requesting state when response arrives
  if (requestingId && (rcState.isControlling || rcState.lastRejectedId)) {
    setRequestingId(null);
  }

  const openConfirm = (peer: PeerData) => setConfirmPeer(peer);

  const confirmRequest = () => {
    if (!confirmPeer) return;
    setRequestingId(confirmPeer.participantId);
    onRequestControl(confirmPeer.participantId);
    setConfirmPeer(null);
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

        {/* Mode-confirm dialog (before sending request) */}
        {confirmPeer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-meeting-surface border border-meeting-border rounded-2xl p-5 w-80 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2">
                {confirmPeer.agentEnabled
                  ? <Bot className="w-5 h-5 text-green-400 shrink-0" />
                  : <Eye className="w-5 h-5 text-yellow-400 shrink-0" />}
                <p className="text-white font-semibold text-sm">
                  {confirmPeer.agentEnabled
                    ? t('remoteControlPanel.confirmFullTitle')
                    : t('remoteControlPanel.confirmPointerTitle')}
                </p>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                {confirmPeer.agentEnabled
                  ? t('remoteControlPanel.confirmFullDesc')
                  : t('remoteControlPanel.confirmPointerDesc')}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmPeer(null)}
                  className="flex-1 py-2 rounded-xl border border-meeting-border text-slate-300
                             hover:bg-meeting-border text-sm transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={confirmRequest}
                  className="flex-1 py-2 rounded-xl bg-meeting-accent hover:bg-blue-500
                             text-white text-sm font-medium transition-colors"
                >
                  {t('remoteControlPanel.requestControl')}
                </button>
              </div>
            </div>
          </div>
        )}

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
            {/* Show what mode is active */}
            <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs
              ${localAgentEnabled
                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300'}`}
            >
              {localAgentEnabled
                ? <><Bot className="w-3.5 h-3.5" />{t('remoteControlPanel.modeFullActive')}</>
                : <><Eye className="w-3.5 h-3.5" />{t('remoteControlPanel.modePointerActive')}</>}
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

        {/* Pending request (shown to the controlled user) */}
        {rcState.pendingRequest && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              {rcState.pendingRequest.agentMode
                ? <><Bot className="w-3.5 h-3.5 text-green-400" />{t('remoteControlPanel.requestModeFull')}</>
                : <><Eye className="w-3.5 h-3.5 text-yellow-400" />{t('remoteControlPanel.requestModePointer')}</>}
            </div>
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
            {/* Show active mode */}
            {peers.find((p) => p.participantId === rcState.controllerId)?.agentEnabled && (
              <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-1.5 text-xs text-green-300">
                <Bot className="w-3.5 h-3.5" />
                {t('remoteControlPanel.modeFullActive')}
              </div>
            )}
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
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                              <span className="text-xs text-green-400">sharing</span>
                            </div>
                            {/* Agent badge */}
                            {peer.agentEnabled
                              ? (
                                <span className="flex items-center gap-0.5 text-xs text-green-300 bg-green-500/10 border border-green-500/20 rounded px-1 py-0.5">
                                  <Bot className="w-3 h-3" />
                                  {t('remoteControlPanel.agentActive')}
                                </span>
                              )
                              : (
                                <span className="flex items-center gap-0.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-1 py-0.5">
                                  <Eye className="w-3 h-3" />
                                  {t('remoteControlPanel.agentNone')}
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          onClick={() => !isRequesting && openConfirm(peer)}
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
