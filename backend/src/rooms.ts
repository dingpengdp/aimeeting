import bcrypt from 'bcryptjs';

export interface Participant {
  id: string;
  userId: string;
  socketId: string;
  name: string;
  isHost: boolean;
}

export interface Room {
  id: string;
  title: string;
  ownerUserId: string;
  participants: Map<string, Participant>;
  createdAt: string;
  hostId: string | null;
  isLocked: boolean;
  passcodeHash: string | null;
  invitedEmails: string[];
  roomType: 'instant' | 'scheduled';
  scheduledAt?: string;
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

export interface JoinAccessResult {
  allowed: boolean;
  status: number;
  error?: string;
  room?: Room;
}

interface CreateRoomInput {
  id: string;
  title: string;
  ownerUserId: string;
  passcodeHash?: string | null;
  invitedEmails?: string[];
  roomType?: 'instant' | 'scheduled';
  scheduledAt?: string;
}

interface LeaveRoomResult {
  roomDeleted: boolean;
  nextHostId: string | null;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom({ id, title, ownerUserId, passcodeHash = null, invitedEmails = [], roomType = 'instant', scheduledAt }: CreateRoomInput): Room {
    if (this.rooms.has(id)) {
      throw new Error('ROOM_EXISTS');
    }

    const room: Room = {
      id,
      title,
      ownerUserId,
      participants: new Map(),
      createdAt: new Date().toISOString(),
      hostId: null,
      isLocked: false,
      passcodeHash,
      invitedEmails,
      roomType,
      scheduledAt,
    };

    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  toRoomSummary(room: Room): RoomSummary {
    return {
      roomId: room.id,
      title: room.title,
      participantCount: room.participants.size,
      isLocked: room.isLocked,
      hasPasscode: Boolean(room.passcodeHash),
      ownerUserId: room.ownerUserId,
      createdAt: room.createdAt,
      invitedEmails: [...room.invitedEmails],
      roomType: room.roomType,
      scheduledAt: room.scheduledAt,
    };
  }

  validateJoin(roomId: string, userId: string, userEmail: string, passcode?: string): JoinAccessResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { allowed: false, status: 404, error: '会议室不存在' };
    }

    const alreadyInRoom = Array.from(room.participants.values()).some((participant) => participant.userId === userId);
    const isOwner = room.ownerUserId === userId;
    const normalizedEmail = userEmail.trim().toLowerCase();
    const isInvited = room.invitedEmails.includes(normalizedEmail);

    if (room.isLocked && !alreadyInRoom && !isOwner && !isInvited) {
      return { allowed: false, status: 423, error: '会议已锁定，暂不允许新的参会者加入' };
    }

    if (room.passcodeHash && !alreadyInRoom && !isOwner && !isInvited) {
      if (!passcode || !bcrypt.compareSync(passcode, room.passcodeHash)) {
        return { allowed: false, status: 403, error: '会议口令不正确' };
      }
    }

    return { allowed: true, status: 200, room };
  }

  joinRoom(roomId: string, participant: Participant): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    if (room.participants.size === 0) {
      participant.isHost = true;
      room.hostId = participant.id;
    }

    room.participants.set(participant.id, participant);
    return room;
  }

  leaveRoom(roomId: string, participantId: string): LeaveRoomResult {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { roomDeleted: false, nextHostId: null };
    }

    room.participants.delete(participantId);

    if (room.participants.size === 0) {
      this.rooms.delete(roomId);
      return { roomDeleted: true, nextHostId: null };
    }

    if (room.hostId === participantId) {
      const nextHost = room.participants.values().next().value as Participant | undefined;
      if (nextHost) {
        this.setHost(roomId, nextHost.id);
        return { roomDeleted: false, nextHostId: nextHost.id };
      }
    }

    return { roomDeleted: false, nextHostId: null };
  }

  getRoomParticipants(roomId: string): Participant[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  getParticipant(roomId: string, participantId: string): Participant | undefined {
    return this.rooms.get(roomId)?.participants.get(participantId);
  }

  isHostParticipant(roomId: string, participantId: string): boolean {
    return this.rooms.get(roomId)?.hostId === participantId;
  }

  isHostUser(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.hostId) {
      return false;
    }

    const host = room.participants.get(room.hostId);
    return host?.userId === userId;
  }

  setRoomLocked(roomId: string, locked: boolean): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.isLocked = locked;
    return room;
  }

  setHost(roomId: string, participantId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    room.hostId = participantId;
    for (const participant of room.participants.values()) {
      participant.isHost = participant.id === participantId;
    }

    return room;
  }

  addInvitedEmails(roomId: string, emails: string[]): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) {
      return undefined;
    }

    room.invitedEmails = Array.from(new Set([
      ...room.invitedEmails,
      ...emails.map((email) => email.trim().toLowerCase()),
    ]));

    return room;
  }

  findParticipantBySocketId(socketId: string): { participant: Participant; roomId: string } | null {
    for (const [roomId, room] of this.rooms) {
      for (const participant of room.participants.values()) {
        if (participant.socketId === socketId) {
          return { participant, roomId };
        }
      }
    }
    return null;
  }
}
