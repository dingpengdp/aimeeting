import { MousePointer2, X, Monitor, MonitorOff, UserCheck, UserX } from 'lucide-react';
import type { RemoteControlState, PeerData } from '../types';

interface RemoteControlPanelProps {
  rcState: RemoteControlState;
  peers: PeerData[];
  localParticipantId: string;
  isScreenSharing: boolean;
  onRequestControl: (targetId: string) => void;
  onStopControl: (targetId: string) => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onClose: () => void;
}

export default function RemoteControlPanel({
  rcState,
  peers,
  localParticipantId,
  isScreenSharing,
  onRequestControl,
  onStopControl,
  onStartScreenShare,
  onStopScreenShare,
  onClose,
}: RemoteControlPanelProps) {
  const isIdle = !rcState.isControlling && !rcState.isBeingControlled;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border">
        <div className="flex items-center gap-2 text-white font-medium">
          <MousePointer2 className="w-4 h-4 text-meeting-accent" />
          远程控制
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* How it works */}
        <div className="bg-meeting-bg border border-meeting-border rounded-xl p-3">
          <p className="text-slate-400 text-xs leading-relaxed">
            <span className="text-meeting-accent font-medium">远程控制</span>：
            请求控制后，对方屏幕共享画面上会实时显示您的鼠标指针。
            对方可接受或拒绝控制请求。
          </p>
        </div>

        {/* Currently being controlled */}
        {rcState.isBeingControlled && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-yellow-400" />
              <p className="text-yellow-300 text-sm font-medium">
                {rcState.controllerName} 正在控制您的屏幕
              </p>
            </div>
            <button
              onClick={() => rcState.controllerId && onStopControl(rcState.controllerId)}
              className="w-full flex items-center justify-center gap-2 bg-meeting-danger hover:bg-red-600
                         text-white text-sm font-medium py-2 rounded-xl transition-colors"
            >
              <UserX className="w-4 h-4" />
              结束控制会话
            </button>
          </div>
        )}

        {/* Currently controlling */}
        {rcState.isControlling && (
          <div className="bg-meeting-accent/10 border border-meeting-accent/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MousePointer2 className="w-4 h-4 text-meeting-accent" />
              <p className="text-meeting-accent text-sm font-medium">
                您正在控制 {rcState.controllerName ?? '对方'} 的屏幕
              </p>
            </div>
            <p className="text-slate-400 text-xs">
              移动鼠标到对方的屏幕共享视图上，您的鼠标位置将实时显示给对方。
            </p>
            <button
              onClick={() => rcState.controllerId && onStopControl(rcState.controllerId)}
              className="w-full flex items-center justify-center gap-2 bg-meeting-surface border border-meeting-border
                         hover:bg-meeting-border text-white text-sm py-2 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
              停止控制
            </button>
          </div>
        )}

        {/* Screen share section */}
        {isIdle && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">我的屏幕共享</p>
            {!isScreenSharing ? (
              <button
                onClick={onStartScreenShare}
                className="w-full flex items-center justify-center gap-2 bg-meeting-surface border border-meeting-border
                           hover:bg-meeting-border text-slate-300 hover:text-white text-sm py-2.5 rounded-xl transition-colors"
              >
                <Monitor className="w-4 h-4" />
                开始共享屏幕
              </button>
            ) : (
              <button
                onClick={onStopScreenShare}
                className="w-full flex items-center justify-center gap-2 bg-meeting-accent/20 border border-meeting-accent/50
                           text-meeting-accent text-sm py-2.5 rounded-xl transition-colors"
              >
                <MonitorOff className="w-4 h-4" />
                停止共享屏幕
              </button>
            )}
          </div>
        )}

        {/* Request control from participants */}
        {isIdle && peers.length > 0 && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">请求控制参会者屏幕</p>
            <p className="text-slate-500 text-xs">对方需要先开启屏幕共享，并接受您的控制请求</p>
            <div className="space-y-2">
              {peers.map((peer) => (
                <div
                  key={peer.participantId}
                  className="flex items-center justify-between bg-meeting-bg border border-meeting-border rounded-xl px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-meeting-accent/20 flex items-center justify-center">
                      <span className="text-xs text-meeting-accent font-bold">
                        {peer.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-slate-300 text-sm">{peer.name}</span>
                    {peer.isHost && (
                      <span className="text-xs text-yellow-500">主持人</span>
                    )}
                  </div>
                  <button
                    onClick={() => onRequestControl(peer.participantId)}
                    className="bg-meeting-accent/20 hover:bg-meeting-accent border border-meeting-accent/50
                               text-meeting-accent hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    申请控制
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {isIdle && peers.length === 0 && (
          <div className="text-center py-6">
            <MousePointer2 className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-slate-500 text-sm">暂无其他参会者</p>
            <p className="text-slate-600 text-xs mt-1">等待他人加入后可申请远程控制</p>
          </div>
        )}
      </div>
    </div>
  );
}
