import { act, renderHook, waitFor } from "@testing-library/react";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import {
  fetchDrafts,
  patchDraft,
  createDraft,
} from "@/app/lib/api/drafts";

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: () => ({ token: "test-token", isAuthenticated: true }),
}));

const mockEnqueueWrite = jest.fn().mockResolvedValue(undefined);
jest.mock("@/app/lib/utils/syncQueue", () => ({
  enqueueWrite: (...args: unknown[]) => mockEnqueueWrite(...args),
}));

jest.mock("@/app/lib/api/drafts", () => {
  const actual = jest.requireActual("@/app/lib/api/drafts");
  return {
    __esModule: true,
    ...actual,
    fetchDrafts: jest.fn(),
    patchDraft: jest.fn(),
    createDraft: jest.fn(),
    deleteDraftRemote: jest.fn(),
    clearDraftsRemote: jest.fn(),
  };
});

const { DraftApiError } = jest.requireActual("@/app/lib/api/drafts");

const mockFetchDrafts = fetchDrafts as jest.MockedFunction<typeof fetchDrafts>;
const mockPatchDraft = patchDraft as jest.MockedFunction<typeof patchDraft>;
const mockCreateDraft = createDraft as jest.MockedFunction<typeof createDraft>;

const LOCAL_DRAFT = {
  id: "d1",
  body: "local text",
  version: 5,
  savedAt: 1000,
  characterCount: 10,
};

async function mountWithOneDraft() {
  const view = renderHook(() => useDrafts());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  await waitFor(() => expect(view.result.current.drafts).toHaveLength(1));
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchDrafts.mockResolvedValue([{ ...LOCAL_DRAFT }]);
});

describe("useDrafts – offline sync conflict handling", () => {
  it("sends the last-observed version and applies a matched update", async () => {
    mockPatchDraft.mockResolvedValue({
      ...LOCAL_DRAFT,
      body: "edited",
      version: 6,
      savedAt: 2000,
    });

    const { result } = await mountWithOneDraft();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateDraft("d1", { body: "edited" });
    });

    expect(ok).toBe(true);
    expect(mockPatchDraft).toHaveBeenCalledWith(
      "test-token",
      "d1",
      expect.objectContaining({ body: "edited", version: 5 }),
    );
    expect(result.current.drafts[0].body).toBe("edited");
    expect(result.current.conflicts).toHaveLength(0);
  });

  it("represents a remote_updated 409 as a conflict without overwriting local content or retrying", async () => {
    mockPatchDraft.mockRejectedValue(
      new DraftApiError("changed elsewhere", 409, {
        reason: "remote_updated",
        currentVersion: 7,
        currentDraft: { id: "d1", content: "their text", version: 7 },
      }),
    );

    const { result } = await mountWithOneDraft();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateDraft("d1", { body: "my offline text" });
    });

    expect(ok).toBe(false);
    expect(mockPatchDraft).toHaveBeenCalledTimes(1); // no automatic retry
    expect(result.current.drafts[0].body).toBe("local text"); // not overwritten

    expect(result.current.conflicts).toHaveLength(1);
    const conflict = result.current.conflicts[0];
    expect(conflict.reason).toBe("remote_updated");
    expect(conflict.local.body).toBe("my offline text"); // recoverable
    expect(conflict.remote?.body).toBe("their text");
    expect(result.current.error).toMatch(/changed elsewhere while you were offline/i);
  });

  it("represents a remote_deleted 409 as a conflict and keeps the local draft", async () => {
    mockPatchDraft.mockRejectedValue(
      new DraftApiError("deleted remotely", 409, {
        reason: "remote_deleted",
        draftId: "d1",
      }),
    );

    const { result } = await mountWithOneDraft();

    await act(async () => {
      await result.current.updateDraft("d1", { body: "my offline text" });
    });

    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].reason).toBe("remote_deleted");
    expect(result.current.conflicts[0].remote).toBeUndefined();
    expect(result.current.conflicts[0].local.body).toBe("my offline text");
    expect(result.current.drafts.find((d) => d.id === "d1")?.body).toBe(
      "local text",
    );
  });

  it("resolveConflict('keep-remote') adopts the server copy and clears the conflict", async () => {
    mockPatchDraft.mockRejectedValue(
      new DraftApiError("changed elsewhere", 409, {
        reason: "remote_updated",
        currentVersion: 7,
        currentDraft: { id: "d1", content: "their text", version: 7 },
      }),
    );

    const { result } = await mountWithOneDraft();
    await act(async () => {
      await result.current.updateDraft("d1", { body: "my offline text" });
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resolveConflict("d1", "keep-remote");
    });

    expect(ok).toBe(true);
    expect(result.current.conflicts).toHaveLength(0);
    expect(result.current.drafts[0].body).toBe("their text");
    expect(result.current.drafts[0].version).toBe(7);
  });

  it("resolveConflict('keep-local') re-creates a remotely deleted draft from the local content", async () => {
    mockPatchDraft.mockRejectedValue(
      new DraftApiError("deleted remotely", 409, {
        reason: "remote_deleted",
        draftId: "d1",
      }),
    );
    mockCreateDraft.mockResolvedValue({
      id: "d2",
      body: "my offline text",
      version: 1,
      savedAt: 3000,
      characterCount: 15,
    });

    const { result } = await mountWithOneDraft();
    await act(async () => {
      await result.current.updateDraft("d1", { body: "my offline text" });
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resolveConflict("d1", "keep-local");
    });

    expect(ok).toBe(true);
    expect(mockCreateDraft).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ body: "my offline text" }),
    );
    expect(result.current.conflicts).toHaveLength(0);
    expect(result.current.drafts.some((d) => d.id === "d2")).toBe(true);
  });

  it("keeps a transient network failure retryable and queues it instead of raising a conflict", async () => {
    mockPatchDraft.mockRejectedValue(new Error("network down"));

    const { result } = await mountWithOneDraft();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateDraft("d1", { body: "offline edit" });
    });

    expect(ok).toBe(false);
    expect(result.current.conflicts).toHaveLength(0);
    expect(mockEnqueueWrite).toHaveBeenCalledTimes(1);
    expect(mockEnqueueWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/confessions/drafts/d1",
        method: "PATCH",
      }),
    );
    expect(result.current.error).toMatch(/offline/i);
  });
});
