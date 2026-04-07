import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { RoomManager, Participant } from './rooms';
import type { PublicUser } from './auth';
import { aiService } from './aiService';

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

interface JoinRoomPayload {
  roomId: string;
  participantId: string;
  name: string;
  passcode?: string;
}

interface SignalPayload {
  targetId: string;
  fromId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface ChatPayload {
  roomId: string;
  message: string;
  fromId: string;
  fromName: string;
}

interface RemoteControlPayload {
  targetId: string;
  fromId: string;
  fromName?: string;
  accepted?: boolean;
}

type RemoteInputAction = 'move' | 'click' | 'rightclick';

interface RemoteControlSession {
  roomId: string;
  controllerId: string;
  targetId: string;
  agentMode: boolean;
}

interface RoomLockPayload {
  roomId: string;
  locked: boolean;
}

interface KickParticipantPayload {
  participantId: string;
}

interface TransferHostPayload {
  participantId: string;
}

// Minimal browser type stubs for the server-side
declare global {
  interface RTCSessionDescriptionInit { type: string; sdp?: string }
  interface RTCIceCandidateInit { candidate?: string; sdpMLineIndex?: number | null; sdpMid?: string | null }
}

function resolveSocket(io: Server, room: ReturnType<RoomManager['getRoom']>, targetId: string): string | null {
  if (!room) return null;
  const participant = room.participants.get(targetId);
  return participant?.socketId ?? null;
}

// ── Agent socket registry (persists across connections) ────────────────────────
/** userId → agent socketId */
const agentByUserId = new Map<string, string>();
/** agent socketId → userId (reverse lookup) */
const agentSocketToUser = new Map<string, string>();

function isAgentEnabled(userId: string): boolean {
  return agentByUserId.has(userId);
}

function getRemoteControlSessionKey(roomId: string, targetId: string): string {
  return `${roomId}:${targetId}`;
}

function setRemoteControlSession(session: RemoteControlSession): void {
  for (const [key, existing] of remoteControlSessions.entries()) {
    if (existing.roomId !== session.roomId) continue;
    if (
      existing.controllerId === session.controllerId
      || existing.targetId === session.targetId
      || existing.controllerId === session.targetId
      || existing.targetId === session.controllerId
    ) {
      remoteControlSessions.delete(key);
    }
  }

  remoteControlSessions.set(getRemoteControlSessionKey(session.roomId, session.targetId), session);
}

function clearRemoteControlSession(roomId: string, targetId: string): RemoteControlSession | null {
  const key = getRemoteControlSessionKey(roomId, targetId);
  const session = remoteControlSessions.get(key) ?? null;
  remoteControlSessions.delete(key);
  return session;
}

function findRemoteControlSessionBetween(roomId: string, participantA: string, participantB: string): RemoteControlSession | null {
  for (const session of remoteControlSessions.values()) {
    if (session.roomId !== roomId) continue;
    const sameParticipants = session.controllerId === participantA && session.targetId === participantB;
    const reverseParticipants = session.controllerId === participantB && session.targetId === participantA;
    if (sameParticipants || reverseParticipants) {
      return session;
    }
  }
  return null;
}

function clearRemoteControlSessionsForParticipant(roomId: string, participantId: string): RemoteControlSession[] {
  const removed: RemoteControlSession[] = [];
  for (const [key, session] of remoteControlSessions.entries()) {
    if (session.roomId !== roomId) continue;
    if (session.controllerId === participantId || session.targetId === participantId) {
      remoteControlSessions.delete(key);
      removed.push(session);
    }
  }
  return removed;
}

function isValidNormalizedCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRemoteInputAction(value: unknown): value is RemoteInputAction {
  return value === 'move' || value === 'click' || value === 'rightclick';
}

const remoteControlSessions = new Map<string, RemoteControlSession>();

export function setupSocketHandlers(io: Server, roomManager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    const currentUser = socket.data.user as PublicUser | undefined;
    if (!currentUser) {
      socket.disconnect(true);
      return;
    }

    console.log(`[connected] ${socket.id} (${currentUser.email})`);

    // ── Per-socket recording state ─────────────────────────────────────────
    interface RecordingSession {
      fileId: string;
      filePath: string;
      writeStream: fs.WriteStream;
      startTime: number;
    }
    let currentRecording: RecordingSession | null = null;

    const endRecordingSession = () => {
      if (currentRecording) {
        currentRecording.writeStream.end();
        currentRecording = null;
      }
    };

    // ── Recording via Socket.IO ────────────────────────────────────────────
    socket.on('recording-start', (_payload: unknown) => {
      endRecordingSession();
      const fileId = `rec-${Date.now()}-${socket.id.replace(/[^a-z0-9]/gi, '').substring(0, 8)}.webm`;
      const filePath = path.join(uploadsDir, fileId);
      const writeStream = fs.createWriteStream(filePath);
      currentRecording = { fileId, filePath, writeStream, startTime: Date.now() };
      console.log(`[recording] started ${fileId} for ${currentUser.email}`);
    });

    socket.on('recording-chunk', (data: Buffer) => {
      if (!currentRecording) return;
      if (!Buffer.isBuffer(data)) return;
      currentRecording.writeStream.write(data);
    });

    socket.on('recording-stop', async () => {
      if (!currentRecording) return;
      const rec = currentRecording;
      currentRecording = null;

      await new Promise<void>((resolve) => rec.writeStream.end(resolve));
      const duration = Math.floor((Date.now() - rec.startTime) / 1000);
      console.log(`[recording] saved ${rec.fileId} (${duration}s)`);
      socket.emit('recording-saved', { fileId: rec.fileId, duration });

      try {
        const transcription = await aiService.transcribe(rec.filePath);
        console.log(`[recording] transcribed ${rec.fileId}`);
        socket.emit('recording-transcribed', { transcription });

        try {
          const minutes = await aiService.generateMinutes(transcription);
          console.log(`[recording] minutes generated ${rec.fileId}`);
          socket.emit('recording-minutes', { minutes });
        } catch (minutesErr) {
          console.error('[recording] minutes error:', minutesErr);
          socket.emit('recording-minutes-error', {
            message: minutesErr instanceof Error ? minutesErr.message : '会议纪要生成失败',
          });
        }
      } catch (transcribeErr) {
        console.error('[recording] transcribe error:', transcribeErr);
        socket.emit('recording-error', {
          message: transcribeErr instanceof Error ? transcribeErr.message : '转录失败，请检查 ASR 服务配置',
        });
      }
    });

    socket.on('join-room', ({ roomId, participantId, name, passcode }: JoinRoomPayload) => {
      if (!roomId || !participantId) return;

      const access = roomManager.validateJoin(roomId, currentUser.id, currentUser.email, passcode);
      if (!access.allowed || !access.room) {
        socket.emit('room-error', { message: access.error ?? '加入会议失败' });
        return;
      }

      const participant: Participant = {
        id: participantId,
        userId: currentUser.id,
        socketId: socket.id,
        name: (name.trim() || currentUser.name).substring(0, 50),
        isHost: false,
      };

      const room = roomManager.joinRoom(roomId, participant);
      if (!room) {
        socket.emit('room-error', { message: '会议室不存在' });
        return;
      }

      socket.join(roomId);

      // Tell existing participants a new one arrived
      socket.to(roomId).emit('participant-joined', {
        participantId,
        name: participant.name,
        isHost: participant.isHost,
        agentEnabled: isAgentEnabled(currentUser.id),
      });

      // Send current participant list to the new joiner
      const existingParticipants = roomManager
        .getRoomParticipants(roomId)
        .filter((p) => p.id !== participantId)
        .map((p) => ({
          participantId: p.id,
          name: p.name,
          isHost: p.isHost,
          agentEnabled: isAgentEnabled(p.userId),
        }));

      socket.emit('room-joined', {
        roomId,
        participants: existingParticipants,
        isHost: participant.isHost,
        hostId: room.hostId,
        room: roomManager.toRoomSummary(room),
      });

      console.log(`[join] ${name} (${participantId}) → room ${roomId}`);
    });

    // ── WebRTC Signaling ───────────────────────────────────────────────────
    socket.on('offer', ({ targetId, offer, fromId }: SignalPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      const targetSocket = resolveSocket(io, room, targetId);
      if (targetSocket) io.to(targetSocket).emit('offer', { fromId: found.participant.id, offer });
    });

    socket.on('answer', ({ targetId, answer, fromId }: SignalPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      const targetSocket = resolveSocket(io, room, targetId);
      if (targetSocket) io.to(targetSocket).emit('answer', { fromId: found.participant.id, answer });
    });

    socket.on('ice-candidate', ({ targetId, candidate, fromId }: SignalPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      const targetSocket = resolveSocket(io, room, targetId);
      if (targetSocket) io.to(targetSocket).emit('ice-candidate', { fromId: found.participant.id, candidate });
    });

    // ── Remote Control ─────────────────────────────────────────────────────
    socket.on('remote-control-request', ({ targetId, fromId, fromName, agentMode }: RemoteControlPayload & { agentMode?: boolean }) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      if (!room || targetId === found.participant.id) return;

      const targetParticipant = room.participants.get(targetId);
      if (!targetParticipant) return;

      const targetSocket = resolveSocket(io, room, targetId);
      const effectiveAgentMode = Boolean(agentMode && isAgentEnabled(targetParticipant.userId));
      if (targetSocket) io.to(targetSocket).emit('remote-control-request', {
        fromId: found.participant.id,
        fromName: found.participant.name,
        agentMode: effectiveAgentMode,
      });
    });

    // ── Agent registration ──────────────────────────────────────────
    socket.on('agent-register', ({ roomId }: { roomId: string }) => {
      const found = roomManager.findParticipantByRoomAndUser(roomId, currentUser.id);
      if (!found) return;
      agentByUserId.set(currentUser.id, socket.id);
      agentSocketToUser.set(socket.id, currentUser.id);
      io.to(roomId).emit('participant-agent-state', {
        participantId: found.id,
        agentEnabled: true,
      });
      console.log(`[agent] registered for ${currentUser.email} in room ${roomId}`);
    });

    // ── Remote input (forwarded to agent) ─────────────────────────
    socket.on('remote-input', ({ targetId, x, y, action }: {
      targetId: string; x: number; y: number; action: RemoteInputAction;
    }) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      if (!room) return;
      if (!isValidNormalizedCoordinate(x) || !isValidNormalizedCoordinate(y) || !isRemoteInputAction(action)) {
        return;
      }

      const targetParticipant = room.participants.get(targetId);
      if (!targetParticipant) return;

      const session = remoteControlSessions.get(getRemoteControlSessionKey(found.roomId, targetId));
      if (!session || session.controllerId !== found.participant.id || !session.agentMode) {
        return;
      }

      const agentSocketId = agentByUserId.get(targetParticipant.userId);
      if (!agentSocketId) return;
      io.to(agentSocketId).emit('remote-input', { x, y, action });
    });

    socket.on('remote-control-response', ({ targetId, fromId, accepted }: RemoteControlPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      if (!room) return;

      const requester = room.participants.get(targetId);
      if (!requester) return;

      if (accepted) {
        setRemoteControlSession({
          roomId: found.roomId,
          controllerId: requester.id,
          targetId: found.participant.id,
          agentMode: isAgentEnabled(found.participant.userId),
        });
      } else {
        const session = findRemoteControlSessionBetween(found.roomId, found.participant.id, targetId);
        if (session) {
          clearRemoteControlSession(session.roomId, session.targetId);
        }
      }

      const targetSocket = resolveSocket(io, room, targetId);
      if (targetSocket) io.to(targetSocket).emit('remote-control-response', {
        fromId: found.participant.id,
        accepted,
      });
    });

    socket.on('remote-control-end', ({ targetId, fromId }: RemoteControlPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      const room = roomManager.getRoom(found.roomId);
      if (!room) return;

      const session = findRemoteControlSessionBetween(found.roomId, found.participant.id, targetId);
      const counterpartId = session
        ? (session.controllerId === found.participant.id ? session.targetId : session.controllerId)
        : targetId;

      if (session) {
        clearRemoteControlSession(session.roomId, session.targetId);
      }

      const targetSocket = resolveSocket(io, room, counterpartId);
      if (targetSocket) io.to(targetSocket).emit('remote-control-end', { fromId: found.participant.id });
    });

    // ── Chat ───────────────────────────────────────────────────────────────
    socket.on('chat-message', ({ roomId, message, fromId, fromName }: ChatPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      if (!message || message.trim().length === 0) return;
      io.to(found.roomId).emit('chat-message', {
        fromId: found.participant.id,
        fromName: found.participant.name,
        message: message.substring(0, 2000),
        timestamp: Date.now(),
      });
    });

    // ── Room Permissions ───────────────────────────────────────────────────
    socket.on('toggle-room-lock', ({ roomId, locked }: RoomLockPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found || found.roomId !== roomId) return;
      if (!found.participant.isHost) {
        socket.emit('room-error', { message: '只有主持人可以修改会议权限' });
        return;
      }

      const room = roomManager.setRoomLocked(roomId, locked);
      if (!room) return;
      io.to(roomId).emit('room-locked-state', { isLocked: room.isLocked });
    });

    socket.on('kick-participant', ({ participantId }: KickParticipantPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      if (!found.participant.isHost) {
        socket.emit('room-error', { message: '只有主持人可以移除参会者' });
        return;
      }
      if (participantId === found.participant.id) {
        return;
      }

      const targetParticipant = roomManager.getParticipant(found.roomId, participantId);
      if (!targetParticipant) return;

      const targetSocket = io.sockets.sockets.get(targetParticipant.socketId);
      roomManager.leaveRoom(found.roomId, participantId);

      targetSocket?.emit('participant-kicked', { roomId: found.roomId });
      io.to(found.roomId).emit('participant-left', { participantId });
      targetSocket?.disconnect(true);
    });

    socket.on('transfer-host', ({ participantId }: TransferHostPayload) => {
      const found = roomManager.findParticipantBySocketId(socket.id);
      if (!found) return;
      if (!found.participant.isHost) {
        socket.emit('room-error', { message: '只有主持人可以移交主持权限' });
        return;
      }
      if (participantId === found.participant.id) {
        return;
      }

      const targetParticipant = roomManager.getParticipant(found.roomId, participantId);
      if (!targetParticipant) {
        socket.emit('room-error', { message: '目标参会者不存在' });
        return;
      }

      roomManager.setHost(found.roomId, participantId);
      io.to(found.roomId).emit('host-changed', { participantId });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      endRecordingSession();

      // If this was an agent socket, clean up and notify room
      const agentUserId = agentSocketToUser.get(socket.id);
      if (agentUserId) {
        agentByUserId.delete(agentUserId);
        agentSocketToUser.delete(socket.id);
        for (const [rid, room] of roomManager.getAllRooms()) {
          for (const [, p] of room.participants) {
            if (p.userId === agentUserId) {
              const session = clearRemoteControlSession(rid, p.id);
              if (session?.agentMode) {
                const controllerSocket = resolveSocket(io, room, session.controllerId);
                if (controllerSocket) {
                  io.to(controllerSocket).emit('remote-control-end', { fromId: p.id });
                }
                io.to(p.socketId).emit('remote-control-end', { fromId: session.controllerId });
              }
              io.to(rid).emit('participant-agent-state', { participantId: p.id, agentEnabled: false });
              console.log(`[agent] disconnected for ${agentUserId}`);
            }
          }
        }
      }

      const found = roomManager.findParticipantBySocketId(socket.id);
      if (found) {
        const { participant, roomId } = found;
        const room = roomManager.getRoom(roomId);
        for (const session of clearRemoteControlSessionsForParticipant(roomId, participant.id)) {
          const counterpartId = session.controllerId === participant.id ? session.targetId : session.controllerId;
          const counterpartSocket = resolveSocket(io, room, counterpartId);
          if (counterpartSocket) {
            io.to(counterpartSocket).emit('remote-control-end', { fromId: participant.id });
          }
        }
        const leaveResult = roomManager.leaveRoom(roomId, participant.id);
        socket.to(roomId).emit('participant-left', { participantId: participant.id });
        if (leaveResult.nextHostId) {
          io.to(roomId).emit('host-changed', { participantId: leaveResult.nextHostId });
        }
        console.log(`[leave] ${participant.name} ← room ${roomId}`);
      }
      console.log(`[disconnected] ${socket.id}`);
    });
  });
}
