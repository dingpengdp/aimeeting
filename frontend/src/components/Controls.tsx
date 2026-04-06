import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  MessageSquare, Circle, Sparkles, MousePointer2, PhoneOff, Shield, UserPlus,
} from 'lucide-react';

type PanelKey = 'chat' | 'recording' | 'minutes' | 'remote' | 'invite' | 'security' | null;

interface ControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  unreadChat: number;
  activePanelKey: PanelKey;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleRecording: () => void;
  onToggleMinutes: () => void;
  onToggleRemoteControl: () => void;
  onToggleInvite: () => void;
  onToggleSecurity: () => void;
  onLeave: () => void;
}

interface ControlBtnProps {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  recording?: boolean;
  label: string;
  badge?: number;
  children: React.ReactNode;
}

function ControlBtn({ onClick, active, danger, recording, label, badge, children }: ControlBtnProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all
        ${danger
          ? 'bg-meeting-danger hover:bg-red-600 text-white'
          : active
          ? 'bg-meeting-accent/20 text-meeting-accent border border-meeting-accent/50'
          : recording
          ? 'bg-red-500/20 text-red-400 border border-red-500/50'
          : 'bg-meeting-surface hover:bg-meeting-border text-slate-300 hover:text-white border border-meeting-border'
        }`}
    >
      {children}
      <span className="hidden sm:block">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-meeting-accent text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

export default function Controls({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isRecording,
  unreadChat,
  activePanelKey,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleRecording,
  onToggleMinutes,
  onToggleRemoteControl,
  onToggleInvite,
  onToggleSecurity,
  onLeave,
}: ControlsProps) {
  return (
    <div className="flex-shrink-0 bg-meeting-surface border-t border-meeting-border px-4 py-3">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* Audio */}
        <ControlBtn onClick={onToggleAudio} active={!isAudioEnabled} label={isAudioEnabled ? '静音' : '取消静音'}>
          {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </ControlBtn>

        {/* Video */}
        <ControlBtn onClick={onToggleVideo} active={!isVideoEnabled} label={isVideoEnabled ? '关闭摄像头' : '开启摄像头'}>
          {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </ControlBtn>

        {/* Screen share */}
        <ControlBtn onClick={onToggleScreenShare} active={isScreenSharing} label={isScreenSharing ? '停止共享' : '共享屏幕'}>
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </ControlBtn>

        <div className="w-px h-8 bg-meeting-border mx-1" />

        {/* Chat */}
        <ControlBtn onClick={onToggleChat} active={activePanelKey === 'chat'} label="聊天" badge={unreadChat}>
          <MessageSquare className="w-5 h-5" />
        </ControlBtn>

        {/* Recording */}
        <ControlBtn
          onClick={onToggleRecording}
          active={activePanelKey === 'recording'}
          recording={isRecording}
          label={isRecording ? '录制中' : '录制'}
        >
          <Circle className={`w-5 h-5 ${isRecording ? 'fill-current' : ''}`} />
        </ControlBtn>

        {/* AI Minutes */}
        <ControlBtn onClick={onToggleMinutes} active={activePanelKey === 'minutes'} label="AI纪要">
          <Sparkles className="w-5 h-5" />
        </ControlBtn>

        {/* Remote control */}
        <ControlBtn onClick={onToggleRemoteControl} active={activePanelKey === 'remote'} label="远程控制">
          <MousePointer2 className="w-5 h-5" />
        </ControlBtn>

        <ControlBtn onClick={onToggleInvite} active={activePanelKey === 'invite'} label="邀请">
          <UserPlus className="w-5 h-5" />
        </ControlBtn>

        <ControlBtn onClick={onToggleSecurity} active={activePanelKey === 'security'} label="权限">
          <Shield className="w-5 h-5" />
        </ControlBtn>

        <div className="w-px h-8 bg-meeting-border mx-1" />

        {/* Leave */}
        <ControlBtn onClick={onLeave} danger label="离开">
          <PhoneOff className="w-5 h-5" />
        </ControlBtn>
      </div>
    </div>
  );
}
