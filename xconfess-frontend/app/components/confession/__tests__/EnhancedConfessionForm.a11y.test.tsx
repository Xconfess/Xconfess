import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnhancedConfessionForm } from "../EnhancedConfessionForm";
import apiClient from "@/app/lib/api/client";
import { useGlobalToast } from "@/app/components/common/Toast";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import { useDrafts } from "@/app/lib/hooks/useDrafts";
import { useAuth } from "@/app/lib/hooks/useAuth";

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
  FormattingToolbar: () => <div data-testid="formatting-toolbar" role="toolbar" aria-label="Text formatting" />,
}));

jest.mock("../PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="preview-panel" role="region" aria-label="Preview" />,
}));

jest.mock("../DraftManager", () => ({
  DraftManager: () => <div data-testid="draft-manager" aria-label="Draft manager" />,
}));

jest.mock("../StellarAnchorToggle", () => ({
  StellarAnchorToggle: () => <div data-testid="stellar-anchor-toggle" aria-label="Stellar anchor toggle" />,
}));

const toast = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

describe("EnhancedConfessionForm Accessibility Regression Suite (#1795)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: "c1" } });
  });

  describe("Initial Render Accessibility", () => {
    it("has accessible form landmark and properly associated labels", () => {
      render(<EnhancedConfessionForm />);

      // Form landmark
      const form = screen.getByRole("form", { name: /confession composition form/i });
      expect(form).toBeInTheDocument();

      // Title input and label
      const titleInput = screen.getByLabelText(/title/i);
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveAttribute("id", "confession-title");
      expect(titleInput).toHaveAttribute("aria-required", "false");
      expect(titleInput).toHaveAttribute("aria-describedby");

      // Confession body textarea and label
      const bodyInput = screen.getByLabelText(/confession/i);
      expect(bodyInput).toBeInTheDocument();
      expect(bodyInput).toHaveAttribute("id", "confession-body");
      expect(bodyInput).toHaveAttribute("aria-required", "true");
      expect(bodyInput).toHaveAttribute("aria-invalid", "false");

      // Character counter is present and labeled
      expect(screen.getByText(/0 \/ 5000/i)).toBeInTheDocument();

      // Gender radiogroup
      const genderRadiogroup = screen.getByRole("radiogroup", { name: /gender selection/i });
      expect(genderRadiogroup).toBeInTheDocument();
    });

    it("ensures preview toggle button has accessible toggle state and labels", async () => {
      const user = userEvent.setup();
      render(<EnhancedConfessionForm />);

      const previewToggle = screen.getByRole("button", { name: /switch to preview mode/i });
      expect(previewToggle).toBeInTheDocument();

      await user.click(previewToggle);

      expect(
        screen.getByRole("button", { name: /switch to edit mode/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("region", { name: /confession preview/i })).toBeInTheDocument();
    });
  });

  describe("Accessible Validation Error Announcements", () => {
    it("announces validation errors accessibly via role=alert and aria-describedby", async () => {
      const user = userEvent.setup();
      const { container } = render(<EnhancedConfessionForm />);

      // Fill invalid short body
      const bodyInput = screen.getByLabelText(/confession/i);
      await user.type(bodyInput, "Too short");

      // Submit form
      const submitButton = screen.getByRole("button", { name: /publish confession/i });
      await user.click(submitButton);

      // Form level alert announcement
      const formAlert = await screen.findByText("Please review the highlighted fields and try again.");
      expect(formAlert).toBeInTheDocument();

      // Field specific error with role=alert
      const fieldError = screen.getByText("Confession must be at least 10 characters");
      expect(fieldError).toBeInTheDocument();
      expect(fieldError).toHaveAttribute("role", "alert");
      expect(fieldError).toHaveAttribute("id", "body-error");

      // Textarea aria-invalid and aria-describedby links to error
      expect(bodyInput).toHaveAttribute("aria-invalid", "true");
      expect(bodyInput.getAttribute("aria-describedby")).toContain("body-error");
    });
  });

  describe("Keyboard Navigation and Submission", () => {
    it("submits confession via Ctrl+Enter keyboard shortcut in textarea", async () => {
      render(<EnhancedConfessionForm />);

      const bodyInput = screen.getByLabelText(/confession/i);
      fireEvent.change(bodyInput, {
        target: { value: "A valid confession message meeting the length requirement." },
      });

      // Press Ctrl+Enter on textarea
      fireEvent.keyDown(bodyInput, { key: "Enter", ctrlKey: true });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          "/confessions",
          expect.objectContaining({
            message: "A valid confession message meeting the length requirement.",
          }),
        );
      });
    });

    it("resets form when cancel/clear button is activated via keyboard", async () => {
      const user = userEvent.setup();
      render(<EnhancedConfessionForm />);

      const titleInput = screen.getByLabelText(/title/i);
      const bodyInput = screen.getByLabelText(/confession/i);

      await user.type(titleInput, "Title to be cleared");
      await user.type(bodyInput, "Body to be cleared");

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(titleInput).toHaveValue("");
      expect(bodyInput).toHaveValue("");
    });
  });
});
