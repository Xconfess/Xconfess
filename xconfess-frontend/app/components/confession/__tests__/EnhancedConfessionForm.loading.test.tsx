import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnhancedConfessionForm } from "../EnhancedConfessionForm";
import apiClient from "@/app/lib/api/client";
import { useGlobalToast } from "@/app/components/common/Toast";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import { useAuth } from "@/app/lib/hooks/useAuth";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/app/lib/utils/validation", () => {
  const actual = jest.requireActual("@/app/lib/utils/validation");
  return {
    ...actual,
    validateConfessionForm: jest.fn(() => ({})),
  };
});

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

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  (useAuth as jest.Mock).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "user-1" },
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
  (apiClient.post as jest.Mock).mockReturnValue(
    new Promise(() => {
      // Intentionally pending so we can assert the loading state.
    })
  );
});

describe("EnhancedConfessionForm loading state", () => {
  it("shows a stable loading state while the submission is in flight", async () => {
    const user = userEvent.setup();
    render(<EnhancedConfessionForm />);

    await user.click(screen.getByRole("button", { name: /publish confession/i }));

    const loadingButton = screen.getByRole("button", {
      name: /publishing confession/i,
    });

    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Publishing confession...")).toBeInTheDocument();

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /publishing confession/i })).toBeDisabled()
    );
  });
});
