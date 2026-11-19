"use client";

import { useEffect, useRef, useState } from "react";

export interface FeedAnnouncementState {
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  errorMessage?: string;
}

/**
 * Derives a single aria-live announcement string for an async feed, deduping
 * consecutive identical messages so screen readers aren't spammed on every
 * render (react-query re-renders far more often than the state actually
 * changes in a way worth announcing).
 */
export function useLiveAnnouncement({
  isLoading,
  isFetching,
  isFetchingNextPage,
  isError,
  errorMessage,
}: FeedAnnouncementState): string {
  const [message, setMessage] = useState("");
  const lastMessageRef = useRef("");
  const wasFetchingRef = useRef(false);

  useEffect(() => {
    let next = "";

    if (isLoading) {
      next = "Loading feed...";
    } else if (isError) {
      next = errorMessage ? `Unable to load feed: ${errorMessage}` : "Unable to load feed.";
    } else if (isFetchingNextPage) {
      next = "Loading more confessions...";
    } else if (isFetching) {
      next = "Updating feed contents...";
    } else if (wasFetchingRef.current) {
      // A background refresh just finished successfully.
      next = "Feed updated.";
    }

    wasFetchingRef.current = isFetching || isFetchingNextPage;

    if (next && next !== lastMessageRef.current) {
      lastMessageRef.current = next;
      setMessage(next);
    } else if (!next && lastMessageRef.current) {
      // Clear once the transition has been announced so the next identical
      // state (e.g. "Updating feed contents..." again) re-announces.
      lastMessageRef.current = "";
    }
  }, [isLoading, isFetching, isFetchingNextPage, isError, errorMessage]);

  return message;
}
