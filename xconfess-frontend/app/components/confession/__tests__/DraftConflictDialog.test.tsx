import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftConflictDialog } from "../DraftConflictDialog";
import type { DraftConflict } from "@/app/lib/types/draft";

describe("DraftConflictDialog", () => {
  const mockConflict: DraftConflict = {
    draftId: "draft-1",
    reason: "remote_updated",
    detectedAt: Date.now(),
    local: {
      body: "My local draft content",
      title: "My Title",
      gender: "prefer-not-to-say",
    },
    baseVersion: 1,
    remote: {
      id: "draft-1",
      body: "Updated content from another device",
      title: "Updated Title",
      savedAt: Date.now(),
      characterCount: 30,
    },
  };

  const mockOnResolve = jest.fn().mockResolvedValue(undefined);
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={false}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("renders dialog when open", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("Draft Conflict")).toBeInTheDocument();
  });

  it("displays conflict reason for remote_updated", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByText("This draft was edited on another device")
    ).toBeInTheDocument();
  });

  it("displays conflict reason for remote_deleted", () => {
    const deletedConflict: DraftConflict = {
      ...mockConflict,
      reason: "remote_deleted",
      remote: undefined,
    };

    render(
      <DraftConflictDialog
        conflict={deletedConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByText("This draft was deleted on another device")
    ).toBeInTheDocument();
  });

  it("displays local draft content", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(/My local draft content/)).toBeInTheDocument();
  });

  it("displays remote draft content", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByText(/Updated content from another device/)
    ).toBeInTheDocument();
  });

  it("displays resolution options", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("Keep my draft")).toBeInTheDocument();
    expect(screen.getByText("Use server version")).toBeInTheDocument();
    expect(screen.getByText("Review manually")).toBeInTheDocument();
  });

  it("resolves conflict with keep-local option", async () => {
    const user = userEvent.setup();

    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const keepLocalRadio = screen.getByDisplayValue("keep-local");
    await user.click(keepLocalRadio);
    await user.click(screen.getByText("Resolve Conflict"));

    await waitFor(() => {
      expect(mockOnResolve).toHaveBeenCalledWith("keep-local");
    });
  });

  it("resolves conflict with keep-remote option", async () => {
    const user = userEvent.setup();

    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const keepRemoteRadio = screen.getByDisplayValue("keep-remote");
    await user.click(keepRemoteRadio);
    await user.click(screen.getByText("Resolve Conflict"));

    await waitFor(() => {
      expect(mockOnResolve).toHaveBeenCalledWith("keep-remote");
    });
  });

  it("resolves conflict with review option", async () => {
    const user = userEvent.setup();

    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const reviewRadio = screen.getByDisplayValue("review");
    await user.click(reviewRadio);
    await user.click(screen.getByText("Resolve Conflict"));

    await waitFor(() => {
      expect(mockOnResolve).toHaveBeenCalledWith("review");
    });
  });

  it("sets review as default resolution option", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const reviewRadio = screen.getByDisplayValue("review") as HTMLInputElement;
    expect(reviewRadio.checked).toBe(true);
  });

  it("cancels conflict resolution", async () => {
    const user = userEvent.setup();

    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    await user.click(screen.getByText("Cancel"));

    expect(mockOnCancel).toHaveBeenCalled();
    expect(mockOnResolve).not.toHaveBeenCalled();
  });

  it("displays timestamp of conflict detection", () => {
    const now = new Date();
    const conflict: DraftConflict = {
      ...mockConflict,
      detectedAt: now.getTime(),
    };

    render(
      <DraftConflictDialog
        conflict={conflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const dateString = now.toLocaleString();
    expect(screen.getByText(dateString)).toBeInTheDocument();
  });

  it("preserves private draft content labels", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("Your Local Draft (preserved)")).toBeInTheDocument();
  });

  it("disables buttons while resolving", async () => {
    const user = userEvent.setup();
    const slowResolve = jest.fn(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    const { rerender } = render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={slowResolve}
        onCancel={mockOnCancel}
      />
    );

    const resolveButton = screen.getByText("Resolve Conflict");
    const cancelButton = screen.getByText("Cancel");

    await user.click(resolveButton);

    expect(resolveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it("displays explanation text for each resolution option", () => {
    render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(
      screen.getByText("Your local changes are preserved")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Replace with the version from your other device"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Both versions are preserved for manual review")
    ).toBeInTheDocument();
  });

  it("handles deleted remote draft gracefully", () => {
    const deletedConflict: DraftConflict = {
      ...mockConflict,
      reason: "remote_deleted",
      remote: undefined,
    };

    render(
      <DraftConflictDialog
        conflict={deletedConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText("(deleted)")).toBeInTheDocument();
  });

  it("is accessible with proper ARIA attributes", () => {
    const { container } = render(
      <DraftConflictDialog
        conflict={mockConflict}
        isOpen={true}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toHaveAttribute("aria-label");
  });
});
