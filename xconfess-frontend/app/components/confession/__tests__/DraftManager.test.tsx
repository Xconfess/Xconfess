import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DraftManager } from "../DraftManager";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import {
  createConfessionDraft,
  deleteConfessionDraft,
  listConfessionDrafts,
} from "@/app/lib/api/confessionDrafts";

jest.mock("@/app/lib/hooks/useDrafts", () => ({
  useDrafts: jest.fn(),
}));

let mockAuthState = { isAuthenticated: true };

jest.mock("@/app/lib/store/authStore", () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

jest.mock("@/app/lib/api/confessionDrafts", () => ({
  createConfessionDraft: jest.fn(),
  updateConfessionDraft: jest.fn(),
  deleteConfessionDraft: jest.fn(),
  listConfessionDrafts: jest.fn(),
}));

jest.mock("@/app/components/common/Toast", () => ({
  useGlobalToast: () => ({
    success: jest.fn(),
  }),
}));

jest.mock("@/app/components/ui/modal", () => ({
  Modal: ({ isOpen, title, children }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) => (isOpen ? <section aria-label={title}>{children}</section> : null),
}));

jest.mock("@/app/components/admin/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

const mockUseDrafts = useDrafts as jest.MockedFunction<typeof useDrafts>;
const mockCreateDraft = createConfessionDraft as jest.MockedFunction<
  typeof createConfessionDraft
>;
const mockDeleteDraft = deleteConfessionDraft as jest.MockedFunction<
  typeof deleteConfessionDraft
>;
const mockListDrafts = listConfessionDrafts as jest.MockedFunction<
  typeof listConfessionDrafts
>;

const localDraftStore = {
  saveDraft: jest.fn(() => "local-draft-1"),
  updateDraft: jest.fn(() => true),
  deleteDraft: jest.fn(),
  clearDrafts: jest.fn(),
  loadDraft: jest.fn(),
};

function renderDraftManager(props: Partial<React.ComponentProps<typeof DraftManager>> = {}) {
  return render(
    <DraftManager
      currentDraft={{ title: "A title", body: "This draft should autosave." }}
      onLoadDraft={jest.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuthState = { isAuthenticated: true };

  localDraftStore.saveDraft.mockReturnValue("local-draft-1");
  localDraftStore.updateDraft.mockReturnValue(true);
  localDraftStore.loadDraft.mockReturnValue(undefined);

  mockUseDrafts.mockReturnValue({
    drafts: [],
    ...localDraftStore,
  });

  mockListDrafts.mockResolvedValue({ ok: true, data: [] });
  mockCreateDraft.mockResolvedValue({
    ok: true,
    data: {
      id: "remote-draft-1",
      content: "This draft should autosave.",
      version: 1,
      updatedAt: "2026-06-18T00:00:00.000Z",
    },
  });
  mockDeleteDraft.mockResolvedValue({ ok: true, data: { message: "Draft deleted" } });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("DraftManager autosave", () => {
  it("autosaves authenticated drafts to the backend within the debounce window", async () => {
    renderDraftManager();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(localDraftStore.saveDraft).toHaveBeenCalledWith({
        title: "A title",
        body: "This draft should autosave.",
        gender: undefined,
      });
      expect(mockCreateDraft).toHaveBeenCalledWith({
        content: "This draft should autosave.",
      });
    });

    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
  });

  it("keeps the local draft and shows retry when cloud sync fails", async () => {
    mockCreateDraft.mockResolvedValue({
      ok: false,
      error: { message: "Backend offline", code: "NETWORK_ERROR" },
    });

    renderDraftManager();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(
      await screen.findByText("Saved on this device. Cloud sync failed.", {
        exact: false,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });

    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(2));
  });

  it("restores the latest cloud draft on mount when the composer is empty", async () => {
    const onLoadDraft = jest.fn();
    mockListDrafts.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "remote-draft-older",
          content: "Older cloud draft",
          version: 1,
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
        {
          id: "remote-draft-newer",
          content: "Latest cloud draft",
          version: 3,
          updatedAt: "2026-06-18T00:00:00.000Z",
        },
      ],
    });

    renderDraftManager({
      currentDraft: { body: "" },
      onLoadDraft,
    });

    await waitFor(() => {
      expect(onLoadDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "remote-draft-newer",
          body: "Latest cloud draft",
          characterCount: "Latest cloud draft".length,
        }),
      );
    });
  });

  it("clears the saved local and cloud draft after successful submission", async () => {
    const { rerender } = renderDraftManager();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));

    rerender(
      <DraftManager
        currentDraft={{ title: "", body: "" }}
        onLoadDraft={jest.fn()}
        submittedAt={1}
      />,
    );

    await waitFor(() => {
      expect(localDraftStore.deleteDraft).toHaveBeenCalledWith("local-draft-1");
      expect(mockDeleteDraft).toHaveBeenCalledWith("remote-draft-1");
    });
  });
});
