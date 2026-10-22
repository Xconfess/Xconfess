/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { useConversationDrafts } from "../useConversationDrafts";

const STORAGE_KEY = "xconfess_message_drafts";

function readStoredDrafts(): Record<string, string> {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("useConversationDrafts — per conversation drafts", () => {
  it("keeps one draft per conversation", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("confession-1_sender-1", "hello there");
      result.current.setDraft("confession-2_sender-2", "a different draft");
    });

    expect(result.current.getDraft("confession-1_sender-1")).toBe("hello there");
    expect(result.current.getDraft("confession-2_sender-2")).toBe(
      "a different draft",
    );
    expect(result.current.drafts).toEqual({
      "confession-1_sender-1": "hello there",
      "confession-2_sender-2": "a different draft",
    });
  });

  it("keeps the draft of the conversation that is left when another one is selected", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "draft for A");
    });

    // The user switches to another conversation ...
    act(() => {
      result.current.setDraft("thread-b", "draft for B");
    });

    // ... and back again: the first draft is still there.
    expect(result.current.getDraft("thread-a")).toBe("draft for A");
    expect(result.current.getDraft("thread-b")).toBe("draft for B");
  });

  it("returns an empty string for a conversation without a draft", () => {
    const { result } = renderHook(() => useConversationDrafts());

    expect(result.current.getDraft("unknown")).toBe("");
    expect(result.current.hasDraft("unknown")).toBe(false);
  });

  it("ignores a blank draft", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "   ");
    });

    expect(result.current.hasDraft("thread-a")).toBe(false);
    expect(result.current.getDraft("thread-a")).toBe("   ");
  });
});

describe("useConversationDrafts — clearing drafts", () => {
  it("clears only the requested conversation", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "draft A");
      result.current.setDraft("thread-b", "draft B");
    });

    act(() => {
      result.current.clearDraft("thread-a");
    });

    expect(result.current.getDraft("thread-a")).toBe("");
    expect(result.current.getDraft("thread-b")).toBe("draft B");
  });

  it("removes the draft when it is emptied", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "draft A");
    });

    act(() => {
      result.current.setDraft("thread-a", "");
    });

    expect(result.current.getDraft("thread-a")).toBe("");
    expect(result.current.drafts).toEqual({});
  });

  it("clears every draft at once", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "draft A");
      result.current.setDraft("thread-b", "draft B");
    });

    act(() => {
      result.current.clearAllDrafts();
    });

    expect(result.current.drafts).toEqual({});
  });
});

describe("useConversationDrafts — session persistence", () => {
  it("writes the drafts to sessionStorage", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("thread-a", "draft A");
    });

    expect(readStoredDrafts()).toEqual({ "thread-a": "draft A" });
  });

  it("restores the drafts that were stored earlier in the session", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "thread-a": "draft A", "thread-b": "draft B" }),
    );

    const { result } = renderHook(() => useConversationDrafts());

    expect(result.current.getDraft("thread-a")).toBe("draft A");
    expect(result.current.getDraft("thread-b")).toBe("draft B");
  });

  it("ignores corrupted stored drafts", () => {
    sessionStorage.setItem(STORAGE_KEY, "not json at all");

    const { result } = renderHook(() => useConversationDrafts());

    expect(result.current.drafts).toEqual({});
  });

  it("does not persist anything for a conversation without a key", () => {
    const { result } = renderHook(() => useConversationDrafts());

    act(() => {
      result.current.setDraft("", "orphan draft");
    });

    expect(result.current.drafts).toEqual({});
    expect(readStoredDrafts()).toEqual({});
  });
});
