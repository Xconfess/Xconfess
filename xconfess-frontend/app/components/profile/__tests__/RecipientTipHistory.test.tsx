/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { profileAPI } from "@/app/lib/api/profile";
import { RecipientTipHistory } from "../RecipientTipHistory";

jest.mock("@/app/lib/api/profile", () => ({
  profileAPI: { getUserTips: jest.fn() },
}));

const getUserTips = jest.mocked(profileAPI.getUserTips);

const receivedTip = {
  id: "tip-1",
  amount: 2.5,
  confessionId: "confession-1",
  confessionPreview: "private confession text",
  senderUsername: "kind-sender",
  createdAt: "2026-10-21T12:00:00.000Z",
  type: "received" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RecipientTipHistory", () => {
  it("shows a content-shaped accessible skeleton while loading", () => {
    getUserTips.mockReturnValue(new Promise(() => undefined));

    render(<RecipientTipHistory userId="user-1" />);

    expect(screen.getByRole("status", { name: "Loading recipient tip history" })).toBeInTheDocument();
  });

  it("shows received tips but does not expose confession previews", async () => {
    getUserTips.mockResolvedValue([
      receivedTip,
      { ...receivedTip, id: "tip-2", type: "sent" },
    ]);

    render(<RecipientTipHistory userId="user-1" />);

    expect(await screen.findByText("From kind-sender")).toBeInTheDocument();
    expect(screen.getByText("2.5 XLM")).toBeInTheDocument();
    expect(screen.queryByText("private confession text")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows an empty state when there are no received tips", async () => {
    getUserTips.mockResolvedValue([]);

    render(<RecipientTipHistory userId="user-1" />);

    expect(await screen.findByText("No tips received yet.")).toBeInTheDocument();
  });

  it("uses a safe error and retries after a failed response", async () => {
    getUserTips
      .mockRejectedValueOnce(new Error("private backend response"))
      .mockResolvedValueOnce([receivedTip]);

    render(<RecipientTipHistory userId="user-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tip history is unavailable right now.");
    expect(screen.queryByText("private backend response")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("From kind-sender")).toBeInTheDocument());
    expect(getUserTips).toHaveBeenCalledTimes(2);
  });
});