import { Crown, Lock, Shield, Unlock, UserRoundX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PeerData } from '../types';

interface SecurityPanelProps {
  isHost: boolean;
  roomTitle: string;
  roomLocked: boolean;
  peers: PeerData[];
  onToggleLock: () => void;
  onKickParticipant: (participantId: string) => void;
  onTransferHost: (participantId: string) => void;
  onClose: () => void;
}

export default function SecurityPanel({
  isHost,
  roomTitle,
  roomLocked,
  peers,
  onToggleLock,
  onKickParticipant,
  onTransferHost,
  onClose,
}: SecurityPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border">
        <div className="flex items-center gap-2 text-white font-medium">
          <Shield className="w-4 h-4 text-meeting-accent" />
          {t('security.title')}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="bg-meeting-bg border border-meeting-border rounded-xl p-4 space-y-2">
          <p className="text-white font-medium">{roomTitle}</p>
          <p className="text-slate-400 text-sm">{t('security.currentStatus')}{roomLocked ? t('security.statusLocked') : t('security.statusOpen')}</p>
        </div>

        <div className="space-y-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('security.entryControl')}</p>
          {isHost ? (
            <button
              onClick={onToggleLock}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                roomLocked
                  ? 'bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20'
                  : 'bg-meeting-accent/10 border border-meeting-accent/30 text-meeting-accent hover:bg-meeting-accent/20'
              }`}
            >
              {roomLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {roomLocked ? t('security.unlock') : t('security.lock')}
            </button>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-300 leading-relaxed">
              {t('security.noHostPermission')}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('security.participantManagement')}</p>
          {peers.length === 0 && (
            <div className="bg-meeting-bg border border-meeting-border rounded-xl p-4 text-sm text-slate-500">
              {t('security.noParticipants')}
            </div>
          )}

          {peers.map((peer) => (
            <div
              key={peer.participantId}
              className="flex items-center justify-between bg-meeting-bg border border-meeting-border rounded-xl px-3 py-3"
            >
              <div>
                <p className="text-white text-sm font-medium">{peer.name}</p>
                <p className="text-slate-500 text-xs">{peer.isHost ? t('security.host') : t('security.participant')}</p>
              </div>
              {isHost ? (
                <div className="flex items-center gap-2">
                  {peer.isHost ? (
                    <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-lg px-3 py-2 text-xs">
                      <Crown className="w-3.5 h-3.5" />
                      {t('security.currentHost')}
                    </span>
                  ) : (
                    <button
                      onClick={() => onTransferHost(peer.participantId)}
                      className="bg-meeting-accent/10 border border-meeting-accent/30 hover:bg-meeting-accent/20 text-meeting-accent rounded-lg px-3 py-2 text-xs transition-colors flex items-center gap-1.5"
                    >
                      <Crown className="w-3.5 h-3.5" />
                      {t('security.setHost')}
                    </button>
                  )}
                  {!peer.isHost && (
                    <button
                      onClick={() => onKickParticipant(peer.participantId)}
                      className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 rounded-lg px-3 py-2 text-xs transition-colors flex items-center gap-1.5"
                    >
                      <UserRoundX className="w-3.5 h-3.5" />
                      {t('security.remove')}
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-slate-500 text-xs">{t('security.readOnly')}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}