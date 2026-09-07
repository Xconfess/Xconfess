import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnhancedConfessionForm } from "../EnhancedConfessionForm";
import apiClient from "@/app/lib/api/client";
import { useGlobalToast } from "@/app/components/common/Toast";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import { useAuth } from "@/app/lib/hooks/useAuth";
import {
  pendingConfessionStorageKey,
  savePendingConfession,
} from "@/app/lib/utils/pendingConfession";

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@/app/lib/api/client", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@/app/components/common/Toast", () => ({
  useGlobalToast: jest.fn(),
}));

jest.mock("@/lib/hooks/useStellarWallet", () => ({
  useStellarWallet: jest.fn(),
}));

jest.mock("@/app/lib/hooks/useDrafts", () => ({
  useDrafts: jest.fn(),
}));

jest.mock("@/app/lib/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("../FormattingToolbar", () => ({
  FormattingToolbar: () => <div data-testid="formatting-toolbar" />,
}));

jest.mock("../PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="preview-panel" />,
}));

jest.mock("../DraftManager", () => ({
  DraftManager: () => <div data-testid="draft-manager" />,
}));

jest.mock("../StellarAnchorToggle", () => ({
  StellarAnchorToggle: () => <div data-testid="stellar-anchor-toggle" />,
}));

const toast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

function renderComposer() {
  return render(<EnhancedConfessionForm />);
}

function getForm(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) {
    throw new Error("Expected confession form to be rendered");
  }
  return form;
}

beforeEach(() => {
  const storage = new Map<string, string>();
  jest.clearAllMocks();
  (window.localStorage.setItem as jest.Mock).mockImplementation((key, value) => {
    storage.set(key, value);
  });
  (window.localStorage.getItem as jest.Mock).mockImplementation((key) => {
    return storage.get(key) ?? null;
  });
  (window.localStorage.removeItem as jest.Mock).mockImplementation((key) => {
    storage.delete(key);
  });
  (window.localStorage.clear as jest.Mock).mockImplementation(() => {
    storage.clear();
  });
  window.localStorage.clear();
  (useAuth as jest.Mock).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "user-1", username: "alice" },
  });
  (useGlobalToast as jest.Mock).mockReturnValue(toast);
  (useStellarWallet as jest.Mock).mockReturnValue({
    anchor: jest.fn(),
    isAvailable: true,
    isConnected: false,
    publicKey: null,
    isLoading: false,
    error: null,
    connect: jest.fn(),
  });
  (useDrafts as jest.Mock).mockReturnValue({
    drafts: [],
    saveDraft: jest.fn(),
    updateDraft: jest.fn(),
    deleteDraft: jest.fn(),
    clearDrafts: jest.fn(),
    loadDraft: jest.fn(),
  });
  (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
});

describe("EnhancedConfessionForm", () => {
  it("shows specific validation guidance when submit is blocked", async () => {
    const user = userEvent.setup();
    const { container } = renderComposer();

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "a".repeat(201) },
    });
    await user.type(
      screen.getByRole("textbox", { name: /^confession/i }),
      "short"
    );

    fireEvent.submit(getForm(container));

    expect(
      await screen.findByText("Please review the highlighted fields and try again.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Title cannot exceed 200 characters")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Confession must be at least 10 characters")
    ).toBeInTheDocument();
  });

  it("shows a user-safe message for API failures", async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 500,
        data: { message: "Database exploded" },
      },
    });

    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByRole("textbox", { name: /^confession/i }), "A valid confession body.");
    await user.click(screen.getByRole("button", { name: /publish confession/i }));

    expect(
      await screen.findByText(
        "We could not publish your confession right now. Please try again later."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Database exploded")).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "We could not publish your confession right now. Please try again later."
    );
  });

  it("resets the composer after a successful submission", async () => {
    const user = userEvent.setup();
    renderComposer();

    const titleInput = screen.getByLabelText(/title/i);
    const bodyInput = screen.getByRole("textbox", { name: /^confession/i });

    await user.type(titleInput, "Quiet apology");
    await user.type(bodyInput, "This is a valid confession body.");
    await user.click(screen.getByRole("button", { name: /publish confession/i }));

    await waitFor(() =>
      expect(screen.getByText("Confession submitted successfully!")).toBeInTheDocument()
    );

    await waitFor(() => expect(titleInput).toHaveValue(""));
    await waitFor(() => expect(bodyInput).toHaveValue(""));
    expect(screen.queryByText("Please review the highlighted fields and try again.")).not.toBeInTheDocument();
  });

  it("saves a valid pending confession and redirects guests to login", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText(/title/i), "Almost posted");
    await user.type(
      screen.getByRole("textbox", { name: /^confession/i }),
      "This should survive login.",
    );
    await user.click(screen.getByRole("button", { name: /publish confession/i }));

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/login?next=%2F%23composer");
    await waitFor(() =>
      expect(window.localStorage.getItem(pendingConfessionStorageKey())).toBeTruthy(),
    );
    expect(
      JSON.parse(window.localStorage.getItem(pendingConfessionStorageKey()) || "{}"),
    ).toEqual(
      expect.objectContaining({
        title: "Almost posted",
        body: "This should survive login.",
      }),
    );
  });

  it("restores a pending confession after authentication", async () => {
    savePendingConfession({
      title: "Saved before login",
      body: "This intended post returns after signup.",
      gender: undefined,
      enableStellarAnchor: false,
    });
    expect(window.localStorage.getItem(pendingConfessionStorageKey())).toBeTruthy();

    renderComposer();

    expect(await screen.findByDisplayValue("Saved before login")).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue("This intended post returns after signup."),
    ).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(
      "Your confession draft is restored. Review it, then publish when ready.",
    );
  });
});
