/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentSection } from "../CommentSection";
import { useCommentsQuery, useCreateCommentMutation } from "@/app/lib/hooks/useComments";
import { AppError } from "@/app/lib/utils/errorHandler";

jest.mock("@/app/lib/hooks/useComments", () => ({
  useCommentsQuery: jest.fn(),
  useCreateCommentMutation: jest.fn(),
}));

jest.mock("../CommentItem", () => ({
  CommentItem: () => <div data-testid="comment-item" />,
}));

jest.mock("../LoadingSkeleton", () => ({
  CommentSectionSkeleton: () => <div data-testid="skeleton" />,
}));

const mockMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  (useCommentsQuery as jest.Mock).mockReturnValue({
    comments: [],
    error: null,
    fetchNextPage: jest.fn(),
    hasMore: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    loading: false,
    refetch: jest.fn(),
  });

  (useCreateCommentMutation as jest.Mock).mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
});

function renderSection() {
  return render(
    <CommentSection confessionId="test-confession" isAuthenticated />
  );
}

describe("CommentSection — duplicate submission prevention", () => {
  it("disables the submit button while mutation is pending", () => {
    (useCreateCommentMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });

    renderSection();

    expect(screen.getByRole("button", { name: /posting/i })).toBeDisabled();
  });

  it("does not call mutateAsync a second time when mutation is still pending", async () => {
    const user = userEvent.setup();
    let resolveFirst!: () => void;
    mockMutateAsync.mockReturnValueOnce(
      new Promise<void>((resolve) => { resolveFirst = resolve; })
    );

    const { rerender } = renderSection();

    await user.type(screen.getByRole("textbox"), "hello world");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    // Simulate pending state
    (useCreateCommentMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    });
    rerender(<CommentSection confessionId="test-confession" isAuthenticated />);

    // Button is now disabled so a second click does nothing
    expect(screen.getByRole("button", { name: /posting/i })).toBeDisabled();
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);

    resolveFirst();
  });
});

describe("CommentSection — 429 rate limit handling", () => {
  it("shows a wait-time message when the API returns 429 with retryAfter", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValueOnce(
      new AppError("Too many requests", "TOO_MANY_REQUESTS", 429, { retryAfter: 15 })
    );

    renderSection();

    await user.type(screen.getByRole("textbox"), "some content here");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/please wait 15 seconds/i)
      ).toBeInTheDocument();
    });
  });

  it("shows a generic rate-limit message when retryAfter is absent", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValueOnce(
      new AppError("Too many requests", "TOO_MANY_REQUESTS", 429)
    );

    renderSection();

    await user.type(screen.getByRole("textbox"), "some content here");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/commenting too quickly/i)
      ).toBeInTheDocument();
    });
  });

  it("restores the submit button after a 429 error so the user can retry", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValueOnce(
      new AppError("Too many requests", "TOO_MANY_REQUESTS", 429, { retryAfter: 5 })
    );

    (useCreateCommentMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    renderSection();

    await user.type(screen.getByRole("textbox"), "some content here");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    await waitFor(() => {
      expect(screen.getByText(/please wait/i)).toBeInTheDocument();
    });

    // Button should be re-enabled (isPending is false after rejection)
    expect(screen.getByRole("button", { name: /post comment/i })).not.toBeDisabled();
  });

  it("does not trigger automatic retries on 429", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockRejectedValue(
      new AppError("Too many requests", "TOO_MANY_REQUESTS", 429, { retryAfter: 60 })
    );

    renderSection();

    await user.type(screen.getByRole("textbox"), "some content here");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    await waitFor(() => {
      expect(screen.getByText(/commenting too quickly/i)).toBeInTheDocument();
    });

    // mutateAsync was called exactly once — no automatic retry
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  });
});
