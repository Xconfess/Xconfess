import { renderHook, act } from "@testing-library/react";
import {
  useDraftConflictResolver,
  preservePrivateDraftContent,
} from "../useDraftConflictResolver";
import type { DraftConflict } from "@/app/lib/types/draft";

describe("useDraftConflictResolver", () => {
  const mockConflict: DraftConflict = {
    draftId: "draft-1",
    reason: "remote_updated",
    detectedAt: Date.now(),
    local: {
      body: "Local draft content",
      title: "Local Title",
      gender: "prefer-not-to-say",
    },
    baseVersion: 1,
    remote: {
      id: "draft-1",
      body: "Remote draft content",
      title: "Remote Title",
      savedAt: Date.now(),
      characterCount: 20,
    },
  };

  it("initializes with no active conflict", () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    expect(result.current.activeConflict).toBeNull();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.resolutions).toEqual([]);
  });

  it("shows conflict and opens dialog", () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    act(() => {
      result.current.showConflict(mockConflict);
    });

    expect(result.current.activeConflict).toEqual(mockConflict);
    expect(result.current.isOpen).toBe(true);
  });

  it("resolves conflict with keep-local", async () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    act(() => {
      result.current.showConflict(mockConflict);
    });

    await act(async () => {
      await result.current.resolveConflict("keep-local");
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeConflict).toBeNull();
    expect(result.current.resolutions).toContainEqual({
      draftId: "draft-1",
      resolution: "keep-local",
      timestamp: expect.any(Number),
    });
  });

  it("resolves conflict with keep-remote", async () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    act(() => {
      result.current.showConflict(mockConflict);
    });

    await act(async () => {
      await result.current.resolveConflict("keep-remote");
    });

    expect(result.current.resolutions).toContainEqual({
      draftId: "draft-1",
      resolution: "keep-remote",
      timestamp: expect.any(Number),
    });
  });

  it("resolves conflict with review", async () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    act(() => {
      result.current.showConflict(mockConflict);
    });

    await act(async () => {
      await result.current.resolveConflict("review");
    });

    expect(result.current.resolutions).toContainEqual({
      draftId: "draft-1",
      resolution: "review",
      timestamp: expect.any(Number),
    });
  });

  it("cancels conflict resolution", () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    act(() => {
      result.current.showConflict(mockConflict);
    });

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.cancelConflict();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.activeConflict).toBeNull();
  });

  it("tracks multiple conflict resolutions", async () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    const conflict1: DraftConflict = { ...mockConflict, draftId: "draft-1" };
    const conflict2: DraftConflict = { ...mockConflict, draftId: "draft-2" };

    act(() => {
      result.current.showConflict(conflict1);
    });

    await act(async () => {
      await result.current.resolveConflict("keep-local");
    });

    act(() => {
      result.current.showConflict(conflict2);
    });

    await act(async () => {
      await result.current.resolveConflict("keep-remote");
    });

    expect(result.current.resolutions).toHaveLength(2);
    expect(result.current.resolutions[0].draftId).toBe("draft-1");
    expect(result.current.resolutions[1].draftId).toBe("draft-2");
  });

  it("timestamps resolutions accurately", async () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    const beforeResolve = Date.now();

    act(() => {
      result.current.showConflict(mockConflict);
    });

    await act(async () => {
      await result.current.resolveConflict("keep-local");
    });

    const afterResolve = Date.now();
    const resolution = result.current.resolutions[0];

    expect(resolution.timestamp).toBeGreaterThanOrEqual(beforeResolve);
    expect(resolution.timestamp).toBeLessThanOrEqual(afterResolve);
  });

  it("preserves private draft content", () => {
    const draftContent = {
      body: "Very personal draft",
      title: "Private Title",
      gender: "prefer-not-to-say",
    };

    const preserved = preservePrivateDraftContent(draftContent);

    expect(preserved.body).toBe("Very personal draft");
    expect(preserved.title).toBe("Private Title");
    expect(preserved.gender).toBe("prefer-not-to-say");
  });

  it("preserves partial draft content", () => {
    const draftContent = {
      body: "Draft body only",
    };

    const preserved = preservePrivateDraftContent(draftContent);

    expect(preserved.body).toBe("Draft body only");
    expect(preserved.title).toBeUndefined();
    expect(preserved.gender).toBeUndefined();
  });

  it("handles empty draft body", () => {
    const draftContent = {
      body: "",
      title: "Title Only",
    };

    const preserved = preservePrivateDraftContent(draftContent);

    expect(preserved.body).toBe("");
    expect(preserved.title).toBe("Title Only");
  });

  it("handles undefined draft properties", () => {
    const draftContent = {
      body: "Some content",
    };

    const preserved = preservePrivateDraftContent(draftContent);

    expect(preserved).toEqual({
      body: "Some content",
      title: undefined,
      gender: undefined,
    });
  });

  it("supports replacing active conflict", () => {
    const { result } = renderHook(() => useDraftConflictResolver());

    const conflict1: DraftConflict = { ...mockConflict, draftId: "draft-1" };
    const conflict2: DraftConflict = { ...mockConflict, draftId: "draft-2" };

    act(() => {
      result.current.showConflict(conflict1);
    });

    expect(result.current.activeConflict?.draftId).toBe("draft-1");

    act(() => {
      result.current.showConflict(conflict2);
    });

    expect(result.current.activeConflict?.draftId).toBe("draft-2");
  });
});
