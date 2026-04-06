import { io, Socket } from 'socket.io-client';
import { getStoredToken } from './session';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string | undefined;
// In dev, Vite proxies /socket.io to localhost:3001 — so we can use same origin.
const url = BACKEND_URL ?? '';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket {
  const currentToken = getStoredToken();

  if (!socket || socketToken !== currentToken) {
    socket?.disconnect();
    socketToken = currentToken;
    socket = io(url, {
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
