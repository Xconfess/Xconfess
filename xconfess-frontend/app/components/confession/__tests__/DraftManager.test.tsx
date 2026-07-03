import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftManager } from "../DraftManager";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import type { Draft } from "@/app/lib/types/draft";

jest.mock("@/app/lib/hooks/useDrafts", () => ({
  useDrafts: jest.fn(),
}));

jest.mock("@/app/components/common/Toast", () => ({
  useGlobalToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

jest.mock("@/app/components/ui/modal", () => ({
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? (
      <section aria-label={title}>
        <h2>{title}</h2>
        {children}
      </section>
    ) : null,
}));

jest.mock("@/app/components/admin/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

jest.mock("lucide-react", () => ({
  Trash2: () => <span data-testid="trash-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
  FileText: () => <span data-testid="file-icon" />,
}));

const savedDraft: Draft = {
  id: "remote-1",
  title: "Saved title",
  body: "Saved server draft",
  gender: "female",
  savedAt: Date.now(),
  characterCount: 18,
};

function mockDrafts(overrides: Partial<ReturnType<typeof useDrafts>> = {}) {
  (useDrafts as jest.Mock).mockReturnValue({
    drafts: [],
    isLoading: false,
    error: null,
    isRemote: true,
    saveDraft: jest.fn().mockResolvedValue("new-draft"),
    updateDraft: jest.fn().mockResolvedValue(true),
    deleteDraft: jest.fn().mockResolvedValue(undefined),
    clearDrafts: jest.fn().mockResolvedValue(undefined),
    loadDraft: jest.fn(),
    ...overrides,
  });
}

describe("DraftManager conflict recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("offers keep local, use saved draft, and discard local choices when drafts conflict", async () => {
    const onLoadDraft = jest.fn();
    mockDrafts({
      drafts: [savedDraft],
      loadDraft: jest.fn().mockReturnValue(undefined),
    });

    render(
      <DraftManager
        currentDraft={{ title: "Local title", body: "Unsaved local draft" }}
        onLoadDraft={onLoadDraft}
        autoSaveInterval={60_000}
      />,
    );

    expect(screen.getByText("Draft conflict detected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep local/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use saved draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard local/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /use saved draft/i }));

    expect(onLoadDraft).toHaveBeenCalledWith(savedDraft);
    expect(screen.queryByText("Draft conflict detected")).not.toBeInTheDocument();
  });

  it("clears the composer when the user discards the local conflict", async () => {
    const onLoadDraft = jest.fn();
    mockDrafts({
      drafts: [savedDraft],
      loadDraft: jest.fn().mockReturnValue(undefined),
    });

    render(
      <DraftManager
        currentDraft={{ body: "Unsaved local draft" }}
        onLoadDraft={onLoadDraft}
        autoSaveInterval={60_000}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /discard local/i }));

    expect(onLoadDraft).toHaveBeenCalledWith(
      expect.objectContaining({ body: "", characterCount: 0 }),
    );
    expect(screen.queryByText("Draft conflict detected")).not.toBeInTheDocument();
  });

  it("keeps the local draft without loading the saved draft", async () => {
    const onLoadDraft = jest.fn();
    mockDrafts({
      drafts: [savedDraft],
      loadDraft: jest.fn().mockReturnValue(undefined),
    });

    render(
      <DraftManager
        currentDraft={{ body: "Unsaved local draft" }}
        onLoadDraft={onLoadDraft}
        autoSaveInterval={60_000}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /keep local/i }));

    expect(onLoadDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Draft conflict detected")).not.toBeInTheDocument();
  });

  it("shows a retryable failure state when autosave fails", async () => {
    const saveDraft = jest.fn().mockResolvedValue(null);
    mockDrafts({
      error: "Remote save failed.",
      saveDraft,
      loadDraft: jest.fn().mockReturnValue(undefined),
    });

    render(
      <DraftManager
        currentDraft={{ body: "Draft that should autosave" }}
        onLoadDraft={jest.fn()}
        autoSaveInterval={1}
      />,
    );

    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(await screen.findByText(/remote save failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
