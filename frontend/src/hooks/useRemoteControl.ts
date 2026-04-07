import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../services/socket';
import type { DataChannelMessage, PeerData, RemoteControlState, RemotePointer } from '../types';

interface UseRemoteControlOptions {
  localParticipantId: string;
  localName: string;
  peers: Map<string, PeerData>;
  sendDataMessage: (targetId: string | 'all', msg: DataChannelMessage) => void;
}

export function useRemoteControl({
  localParticipantId,
  localName,
  peers,
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
  const lastRemoteInputAtRef = useRef(0);

  const updateRc = useCallback((partial: Partial<RemoteControlState>) => {
    setRcState((prev) => ({ ...prev, ...partial }));
  }, []);

  const clearPointerTimers = useCallback(() => {
    pointerTimeoutRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pointerTimeoutRef.current.clear();
  }, []);

  useEffect(() => clearPointerTimers, [clearPointerTimers]);

  const clampCoordinate = (value: number) => Math.max(0, Math.min(1, value));

  const emitRemoteInput = useCallback(
    (targetId: string, action: 'move' | 'click' | 'rightclick', x: number, y: number) => {
      const targetPeer = peers.get(targetId);
      if (!targetPeer?.agentEnabled) {
        return;
      }

      getSocket().emit('remote-input', {
        targetId,
        action,
        x: clampCoordinate(x),
        y: clampCoordinate(y),
      });
    },
    [peers]
  );

  // ── Request control (controller→host) ─────────────────────────────────────
  const requestControl = useCallback(
    (targetId: string) => {
      const targetPeer = peers.get(targetId);
      if (!targetPeer || targetId === localParticipantId) {
        return;
      }

      const socket = getSocket();
      const agentMode = targetPeer?.agentEnabled ?? false;
      updateRc({ lastRejectedId: null });
      socket.emit('remote-control-request', {
        targetId,
        fromId: localParticipantId,
        fromName: localName,
        agentMode,
      });
    },
    [localParticipantId, localName, peers]
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
      clearPointerTimers();
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
      const nextX = clampCoordinate(x);
      const nextY = clampCoordinate(y);

      sendDataMessage('all', {
        type: 'remote-pointer',
        payload: { participantId: localParticipantId, targetId, name: localName, x: nextX, y: nextY, clicking: false },
      });

      const now = Date.now();
      if (now - lastRemoteInputAtRef.current >= 33) {
        lastRemoteInputAtRef.current = now;
        emitRemoteInput(targetId, 'move', nextX, nextY);
      }
    },
    [emitRemoteInput, localParticipantId, localName, sendDataMessage]
  );

  const sendPointerClick = useCallback(
    (targetId: string, x: number, y: number) => {
      const nextX = clampCoordinate(x);
      const nextY = clampCoordinate(y);

      sendDataMessage('all', {
        type: 'remote-click',
        payload: { participantId: localParticipantId, targetId, name: localName, x: nextX, y: nextY, clicking: true },
      });

      emitRemoteInput(targetId, 'click', nextX, nextY);
    },
    [emitRemoteInput, localParticipantId, localName, sendDataMessage]
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
    ({ fromId, fromName, agentMode }: { fromId: string; fromName: string; agentMode?: boolean }) => {
      updateRc({ pendingRequest: { fromId, fromName, agentMode: agentMode ?? false } });
    },
    [updateRc]
  );

  const handleRemoteControlResponse = useCallback(
    ({ fromId, accepted }: { fromId: string; accepted: boolean }) => {
      if (accepted) {
        updateRc({
          isControlling: true,
          controllerId: fromId,
          controllerName: peers.get(fromId)?.name ?? null,
          lastRejectedId: null,
        });
      } else {
        updateRc({ isControlling: false, lastRejectedId: fromId });
      }
    },
    [peers, updateRc]
  );

  const handleRemoteControlEnd = useCallback(() => {
    clearPointerTimers();
    updateRc({
      isControlling: false,
      isBeingControlled: false,
      controllerId: null,
      controllerName: null,
      pointers: [],
    });
  }, [clearPointerTimers, updateRc]);

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
