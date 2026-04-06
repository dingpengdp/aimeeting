import { useCallback, useRef, useState } from 'react';
import { getSocket } from '../services/socket';
import type { DataChannelMessage, RemoteControlState, RemotePointer } from '../types';

interface UseRemoteControlOptions {
  localParticipantId: string;
  localName: string;
  sendDataMessage: (targetId: string | 'all', msg: DataChannelMessage) => void;
}

export function useRemoteControl({
  localParticipantId,
  localName,
  sendDataMessage,
}: UseRemoteControlOptions) {
  const [rcState, setRcState] = useState<RemoteControlState>({
    controllerId: null,
    controllerName: null,
    isBeingControlled: false,
    isControlling: false,
    pendingRequest: null,
    lastRejectedId: null,
    pointers: [],
  });

  const pointerTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const updateRc = useCallback((partial: Partial<RemoteControlState>) => {
    setRcState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Request control (controller→host) ─────────────────────────────────────
  const requestControl = useCallback(
    (targetId: string) => {
      const socket = getSocket();
      socket.emit('remote-control-request', {
        targetId,
        fromId: localParticipantId,
        fromName: localName,
      });
    },
    [localParticipantId, localName]
  );

  // ── Respond to control request (host) ─────────────────────────────────────
  const respondToRequest = useCallback(
    (fromId: string, accepted: boolean) => {
      const socket = getSocket();
      socket.emit('remote-control-response', {
        targetId: fromId,
        fromId: localParticipantId,
        accepted,
      });

      if (accepted) {
        updateRc({
          isBeingControlled: true,
          controllerId: fromId,
          controllerName: rcState.pendingRequest?.fromName ?? null,
          pendingRequest: null,
        });
      } else {
        updateRc({ pendingRequest: null });
      }
    },
    [localParticipantId, rcState.pendingRequest, updateRc]
  );

  // ── Stop remote control ───────────────────────────────────────────────────
  const stopControl = useCallback(
    (targetId: string) => {
      const socket = getSocket();
      socket.emit('remote-control-end', { targetId, fromId: localParticipantId });
      updateRc({
        isControlling: false,
        controllerId: null,
        controllerName: null,
        isBeingControlled: false,
      });
    },
    [localParticipantId, updateRc]
  );

  // ── Send pointer position (controller→all via data channel) ──────────────
  const sendPointerMove = useCallback(
    (targetId: string, x: number, y: number) => {
      sendDataMessage('all', {
        type: 'remote-pointer',
        payload: { participantId: localParticipantId, targetId, name: localName, x, y, clicking: false },
      });
    },
    [localParticipantId, localName, sendDataMessage]
  );

  const sendPointerClick = useCallback(
    (targetId: string, x: number, y: number) => {
      sendDataMessage('all', {
        type: 'remote-click',
        payload: { participantId: localParticipantId, targetId, name: localName, x, y, clicking: true },
      });
    },
    [localParticipantId, localName, sendDataMessage]
  );

  // ── Handle incoming data-channel messages ─────────────────────────────────
  const handleDataMessage = useCallback(
    (fromId: string, msg: DataChannelMessage) => {
      if (msg.type === 'remote-pointer' || msg.type === 'remote-click') {
        const pointer = msg.payload as RemotePointer;

        setRcState((prev) => {
          const existing = prev.pointers.filter((p) => p.participantId !== pointer.participantId);
          return { ...prev, pointers: [...existing, pointer] };
        });

        // Clear pointer after 3s of inactivity
        const key = pointer.participantId;
        const existing = pointerTimeoutRef.current.get(key);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          setRcState((prev) => ({
            ...prev,
            pointers: prev.pointers.filter((p) => p.participantId !== key),
          }));
          pointerTimeoutRef.current.delete(key);
        }, 3000);
        pointerTimeoutRef.current.set(key, t);
      }
    },
    []
  );

  // ── Socket event handlers for RC signaling ────────────────────────────────
  const handleRemoteControlRequest = useCallback(
    ({ fromId, fromName }: { fromId: string; fromName: string }) => {
      updateRc({ pendingRequest: { fromId, fromName } });
    },
    [updateRc]
  );

  const handleRemoteControlResponse = useCallback(
    ({ fromId, accepted }: { fromId: string; accepted: boolean }) => {
      if (accepted) {
        updateRc({ isControlling: true, controllerId: fromId, lastRejectedId: null });
      } else {
        updateRc({ isControlling: false, lastRejectedId: fromId });
      }
    },
    [updateRc]
  );

  const handleRemoteControlEnd = useCallback(() => {
    updateRc({
      isControlling: false,
      isBeingControlled: false,
      controllerId: null,
      controllerName: null,
      pointers: [],
    });
  }, [updateRc]);

  return {
    rcState,
    requestControl,
    respondToRequest,
    stopControl,
    sendPointerMove,
    sendPointerClick,
    handleDataMessage,
    handleRemoteControlRequest,
    handleRemoteControlResponse,
    handleRemoteControlEnd,
  };
}
