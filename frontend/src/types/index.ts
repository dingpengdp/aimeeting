export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface RoomSummary {
  roomId: string;
  title: string;
  participantCount: number;
  isLocked: boolean;
  hasPasscode: boolean;
  ownerUserId: string;
  createdAt: string;
  invitedEmails: string[];
  roomType: 'instant' | 'scheduled';
  scheduledAt?: string;
}

export interface ClientConfig {
  iceServers: RTCIceServer[];
}

export interface AiServiceConfig {
  asrBaseUrl: string;
  asrModel: string;
  /** `'***set***'` when an API key is configured; `''` when not set. */
  asrApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;  /** HuggingFace token for downloading gated models. Masked when set. */
  hfToken: string;}

export interface RoomInviteResponse {
  room: RoomSummary;
  inviteLink: string;
  invitedEmails: string[];
  deliveredEmails?: string[];
  previewLinks?: string[];
}

// ── Participants ──────────────────────────────────────────────────────────────
export interface Participant {
  participantId: string;
  name: string;
  isHost: boolean;
}

// ── Peer ──────────────────────────────────────────────────────────────────────
export interface PeerData {
  participantId: string;
  name: string;
  isHost: boolean;
  connection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

// ── Chat ──────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  fromId: string;
  fromName: string;
  message: string;
  timestamp: number;
}

// ── Remote Control ────────────────────────────────────────────────────────────
export type RemoteControlEventType = 'move' | 'click' | 'rightclick';

export interface RemoteControlEvent {
  type: RemoteControlEventType;
  x: number; // 0–1 relative to video element
  y: number;
}

export interface RemotePointer {
  participantId: string;
  name: string;
  x: number;
  y: number;
  clicking: boolean;
}

export interface RemoteControlState {
  /** ID of the participant currently controlling (null if none) */
  controllerId: string | null;
  controllerName: string | null;
  /** This user is the one being controlled */
  isBeingControlled: boolean;
  /** This user is the active controller */
  isControlling: boolean;
  /** Pending request shown to host */
  pendingRequest: { fromId: string; fromName: string } | null;
  pointers: RemotePointer[];
}

// ── Recording ─────────────────────────────────────────────────────────────────
export interface RecordingState {
  isRecording: boolean;
  duration: number;
  /** File ID on the server after recording is saved. */
  serverFileId: string | null;
  /** Server is transcribing the recording. */
  isTranscribing: boolean;
  transcription: string | null;
  /** Server auto-generating minutes or local re-generate in progress. */
  isGeneratingMinutes: boolean;
  minutes: string | null;
  error: string | null;
}

// ── Data-channel messages ─────────────────────────────────────────────────────
export type DataChannelMessageType =
  | 'remote-pointer'
  | 'remote-click'
  | 'media-state'
  | 'screen-share-state';

export interface DataChannelMessage {
  type: DataChannelMessageType;
  payload: unknown;
}

export interface MediaStatePayload {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

export interface ScreenShareStatePayload {
  isSharing: boolean;
}
