"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "xconfess_message_drafts";

/**
 * Drafts are scoped to the browser tab session: `sessionStorage` is cleared
 * when the tab is closed, so unsent message text never leaks into another
 * session or another user's device.
 */
export type ConversationDrafts = Record<string, string>;

export interface UseConversationDraftsResult {
  /** Every draft currently held, keyed by conversation. */
  drafts: ConversationDrafts;
  /** The draft for a conversation, or an empty string when there is none. */
  getDraft: (conversationKey: string) => string;
  /** Stores (or overwrites) the draft for a conversation. */
  setDraft: (conversationKey: string, value: string) => void;
  /** Drops the draft for a single conversation. */
  clearDraft: (conversationKey: string) => void;
  /** Drops every draft. */
  clearAllDrafts: () => void;
  /** True when the conversation has a non-blank draft. */
  hasDraft: (conversationKey: string) => boolean;
}

function readStoredDrafts(): ConversationDrafts {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const drafts: ConversationDrafts = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") drafts[key] = value;
    }
    return drafts;
  } catch {
    return {};
  }
}

function writeStoredDrafts(drafts: ConversationDrafts) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Quota exceeded or storage disabled: drafts stay in memory only.
  }
}

/**
 * Keeps one unsent message draft per conversation.
 *
 * The inbox renders a single composer, so switching conversations used to
 * throw away whatever the user had typed. Drafts are stored per
 * conversation key and kept for the lifetime of the browser tab session, so
 * the composer can be re-hydrated with the right text whenever the selected
 * conversation changes.
 *
 * A draft is only removed when the user explicitly discards it or after the
 * message has been sent successfully.
 */
export function useConversationDrafts(): UseConversationDraftsResult {
  const [drafts, setDrafts] = useState<ConversationDrafts>(() => readStoredDrafts());

  // Mirrors `drafts` so `getDraft`/`hasDraft` can read the latest value
  // without being re-created on every keystroke.
  const draftsRef = useRef<ConversationDrafts>(drafts);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const commit = useCallback((next: ConversationDrafts) => {
    draftsRef.current = next;
    setDrafts(next);
    writeStoredDrafts(next);
  }, []);

  const getDraft = useCallback((conversationKey: string) => {
    return draftsRef.current[conversationKey] ?? "";
  }, []);

  const setDraft = useCallback(
    (conversationKey: string, value: string) => {
      if (!conversationKey) return;

      const current = draftsRef.current;
      if (current[conversationKey] === value) return;

      const next: ConversationDrafts = { ...current };
      if (value) {
        next[conversationKey] = value;
      } else {
        delete next[conversationKey];
      }
      commit(next);
    },
    [commit],
  );

  const clearDraft = useCallback(
    (conversationKey: string) => {
      if (!conversationKey) return;
      const current = draftsRef.current;
      if (!(conversationKey in current)) return;

      const next: ConversationDrafts = { ...current };
      delete next[conversationKey];
      commit(next);
    },
    [commit],
  );

  const clearAllDrafts = useCallback(() => {
    commit({});
  }, [commit]);

  const hasDraft = useCallback((conversationKey: string) => {
    const value = draftsRef.current[conversationKey];
    return typeof value === "string" && value.trim().length > 0;
  }, []);

  return {
    drafts,
    getDraft,
    setDraft,
    clearDraft,
    clearAllDrafts,
    hasDraft,
  };
}

export default useConversationDrafts;
