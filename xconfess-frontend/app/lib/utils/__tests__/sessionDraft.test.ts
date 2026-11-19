import {
  SESSION_DRAFT_TTL_MS,
  clearSessionDraft,
  loadSessionDraft,
  saveSessionDraft,
} from "@/app/lib/utils/sessionDraft";

describe("sessionDraft", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    jest.useRealTimers();
  });

  it("restores a draft after navigating away and back in the same session", () => {
    saveSessionDraft({ title: "t", body: "unsent confession" });
    expect(loadSessionDraft()).toMatchObject({ title: "t", body: "unsent confession" });
  });

  it("keeps drafts in sessionStorage only (per tab, never localStorage)", () => {
    saveSessionDraft({ title: "", body: "tab A draft" });
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(1);
  });

  it("clears the draft after a successful submission", () => {
    saveSessionDraft({ title: "", body: "about to send" });
    clearSessionDraft();
    expect(loadSessionDraft()).toBeNull();
  });

  it("does not persist empty drafts", () => {
    saveSessionDraft({ title: " ", body: "   " });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("drops drafts older than the TTL", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveSessionDraft({ title: "", body: "old draft" });
    jest.setSystemTime(Date.now() + SESSION_DRAFT_TTL_MS + 1);
    expect(loadSessionDraft()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("drops corrupted drafts", () => {
    window.sessionStorage.setItem("xconfess.sessionDraft.v1", "{not json");
    expect(loadSessionDraft()).toBeNull();
  });
});
