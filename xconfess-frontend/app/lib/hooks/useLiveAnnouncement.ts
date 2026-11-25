"use client";

import { useEffect, useRef, useState } from "react";

export interface FeedAnnouncementState {
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  resultCount?: number;
}

function countAnnouncement(count?: number): string {
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return "Feed updated.";
  }
  const normalized = Math.max(0, Math.floor(count));
  if (normalized === 0) return "No confessions found.";
  if (normalized === 1) return "1 confession available.";
  return `${normalized} confessions available.`;
}

export function useLiveAnnouncement({
  isLoading,
  isFetching,
  isFetchingNextPage,
  isError,
  resultCount,
}: FeedAnnouncementState): string {
  const [message, setMessage] = useState("");
  const lastMessageRef = useRef("");
  const wasFetchingRef = useRef(false);

  useEffect(() => {
    let next = "";

    if (isLoading) {
      next = "Loading feed...";
    } else if (isError) {
      next = "Unable to load feed.";
    } else if (isFetchingNextPage) {
      next = "Loading more confessions...";
    } else if (isFetching) {
      next = "Updating feed contents...";
    } else if (wasFetchingRef.current) {
      next = countAnnouncement(resultCount);
    }

    wasFetchingRef.current = isFetching || isFetchingNextPage;

    if (next && next !== lastMessageRef.current) {
      lastMessageRef.current = next;
      setMessage(next);
    } else if (!next && lastMessageRef.current) {
      lastMessageRef.current = "";
    }
  }, [isLoading, isFetching, isFetchingNextPage, isError, resultCount]);

  return message;
}
