import { io, Socket } from 'socket.io-client';
import { getStoredToken } from './session';
import { getServerUrl } from '../lib/config';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket {
  const currentToken = getStoredToken();

  if (!socket || socketToken !== currentToken) {
    socket?.disconnect();
    socketToken = currentToken;
    socket = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: currentToken ? { token: currentToken } : undefined,
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
}
