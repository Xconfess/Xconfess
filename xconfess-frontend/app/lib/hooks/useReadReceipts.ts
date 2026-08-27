"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import apiClient from "@/app/lib/api/client";
import { getWsUrl } from "@/app/lib/config";

export type ReadReceiptConnectionState = "connected" | "reconnecting" | "disconnected";

export interface ReadReceipt {
  threadId: string;
  authorReadAt: string | null;
  senderReadAt: string | null;
}

export interface UseReadReceiptsOptions {
  threadId: string | null;
  /** How often to poll (ms) while the WebSocket is offline. Default: 10 000 */
  pollIntervalMs?: number;
  /** Called whenever read receipts are refreshed (via socket or poll). */
  onUpdate?: (receipt: ReadReceipt) => void;
}

export interface UseReadReceiptsReturn {
  receipt: ReadReceipt | null;
  connectionState: ReadReceiptConnectionState;
  /** True when the connection is not "connected" — caller can hide typing indicators. */
  isOffline: boolean;
}

function getSocketUrl() {
  return `${getWsUrl().replace(/\/$/, "")}/messages`;
}

async function fetchThread(threadId: string): Promise<ReadReceipt | null> {
  try {
    const res = await apiClient.get<{
      id: string;
      authorReadAt: string | null;
      senderReadAt: string | null;
    }>(`/messages/thread/${encodeURIComponent(threadId)}`);
    return {
      threadId,
      authorReadAt: res.data.authorReadAt,
      senderReadAt: res.data.senderReadAt,
    };
  } catch {
    return null;
  }
}

/**
 * Subscribes to real-time read-receipt updates for a message thread via a
 * Socket.IO connection. When the socket is unreachable (reconnecting or
 * disconnected), falls back to HTTP polling so the UI stays fresh.
 *
 * Exposes `isOffline` so callers can suppress typing indicators while offline.
 */
export function useReadReceipts({
  threadId,
  pollIntervalMs = 10_000,
  onUpdate,
}: UseReadReceiptsOptions): UseReadReceiptsReturn {
  const [receipt, setReceipt] = useState<ReadReceipt | null>(null);
  const [connectionState, setConnectionState] =
    useState<ReadReceiptConnectionState>("disconnected");

  const socketRef = useRef<Socket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const applyReceipt = useCallback((next: ReadReceipt) => {
    setReceipt(next);
    onUpdateRef.current?.(next);
  }, []);

  // Start / stop polling fallback
  const startPolling = useCallback(() => {
    if (pollRef.current || !threadId) return;
    pollRef.current = setInterval(async () => {
      const data = await fetchThread(threadId);
      if (data) applyReceipt(data);
    }, pollIntervalMs);
  }, [threadId, pollIntervalMs, applyReceipt]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!threadId) return;

    // Seed initial state via REST while socket connects
    fetchThread(threadId).then((data) => {
      if (data) applyReceipt(data);
    });

    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.3,
      withCredentials: true,
    });
    socketRef.current = socket;

    setConnectionState("reconnecting");
    startPolling(); // poll immediately until socket connects

    socket.on("connect", () => {
      setConnectionState("connected");
      stopPolling();
      socket.emit("subscribe:thread", { threadId });
    });

    socket.on("disconnect", () => {
      setConnectionState("reconnecting");
      startPolling();
    });

    socket.io.on("reconnect_attempt", () => {
      setConnectionState("reconnecting");
      startPolling();
    });

    socket.io.on("reconnect_failed", () => {
      setConnectionState("disconnected");
      startPolling();
    });

    socket.on("connect_error", () => {
      setConnectionState("reconnecting");
      startPolling();
    });

    socket.on(
      "read:receipt",
      (payload: { threadId: string; authorReadAt: string | null; senderReadAt: string | null }) => {
        if (payload.threadId !== threadId) return;
        applyReceipt({
          threadId: payload.threadId,
          authorReadAt: payload.authorReadAt,
          senderReadAt: payload.senderReadAt,
        });
      },
    );

    return () => {
      stopPolling();
      socket.emit("unsubscribe:thread", { threadId });
      socket.disconnect();
      setConnectionState("disconnected");
    };
  }, [threadId, applyReceipt, startPolling, stopPolling]);

  return {
    receipt,
    connectionState,
    isOffline: connectionState !== "connected",
  };
}
