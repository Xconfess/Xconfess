import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TipButton } from "@/app/components/confession/TipButton";
import { useWallet } from "@/lib/hooks/useWallet";
import {
  sendTip,
  verifyTip,
  getTipStats,
} from "@/lib/services/tipping.service";
import { connectedWallet } from "@/tests/mocks/wallet-fixtures";
import {
  successfulAnchorResult,
  rejectedAnchorResult,
  timeoutAnchorResult,
} from "@/tests/mocks/anchor-fixtures";

jest.mock("@/lib/hooks/useWallet", () => ({
  useWallet: jest.fn(),
}));

jest.mock("@/lib/services/tipping.service", () => ({
  sendTip: jest.fn(),
  verifyTip: jest.fn(),
  getTipStats: jest.fn(),
}));

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockSendTip = sendTip as jest.MockedFunction<typeof sendTip>;
const mockVerifyTip = verifyTip as jest.MockedFunction<typeof verifyTip>;
const mockGetTipStats = getTipStats as jest.MockedFunction<typeof getTipStats>;

function renderTipButton() {
  return render(
    <TipButton
      confessionId="confession-123"
      recipientAddress="GABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEFGHIJKLMNOPQRSTUV"
    />,
  );
}

describe("TipButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ successful: true }),
    }) as unknown as typeof fetch;
    mockUseWallet.mockReturnValue(connectedWallet());
    mockGetTipStats.mockResolvedValue({
      totalAmount: 0,
      totalCount: 0,
      averageAmount: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function confirmOnChain() {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
  }

  it("completes a successful tip and verification flow", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSendTip.mockResolvedValue(successfulAnchorResult);
    mockVerifyTip.mockResolvedValue({ success: true, tip: undefined });

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip confession/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));
    await confirmOnChain();

    await waitFor(() => {
      expect(mockSendTip).toHaveBeenCalledWith(
        "confession-123",
        0.1,
        "GABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEFGHIJKLMNOPQRSTUV",
      );
    });
    expect(mockVerifyTip).toHaveBeenCalledWith(
      "confession-123",
      successfulAnchorResult.txHash,
    );
    expect(
      await screen.findByText(/tip sent successfully/i),
    ).toBeInTheDocument();
  });

  it("stays verifying until confirmation and then refreshes tip totals", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    let confirmVerification!: (value: { success: true }) => void;
    const verification = new Promise<{ success: true }>((resolve) => {
      confirmVerification = resolve;
    });

    mockSendTip.mockResolvedValue(successfulAnchorResult);
    mockVerifyTip.mockReturnValue(verification);
    mockGetTipStats
      .mockResolvedValueOnce({
        totalAmount: 0,
        totalCount: 0,
        averageAmount: 0,
      })
      .mockResolvedValueOnce({
        totalAmount: 0.1,
        totalCount: 1,
        averageAmount: 0.1,
      });

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip confession/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));
    await confirmOnChain();

    expect(
      await screen.findByText("Verifying with backend…"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tip confirmed")).not.toBeInTheDocument();

    confirmVerification({ success: true });

    expect(await screen.findByText("Tip confirmed")).toBeInTheDocument();
    expect(await screen.findByText(/0.10 XLM total/)).toBeInTheDocument();
    expect(mockGetTipStats).toHaveBeenCalledTimes(2);
  });

  it("shows a clear rejection message when wallet signing is rejected", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSendTip.mockResolvedValue(rejectedAnchorResult);

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip confession/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));

    expect(
      await screen.findByText(/transaction was rejected in your wallet/i),
    ).toBeInTheDocument();
    expect(mockVerifyTip).not.toHaveBeenCalled();
  });

  it("shows timeout recovery guidance", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSendTip.mockResolvedValue(timeoutAnchorResult);

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip confession/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));

    expect(
      await screen.findByText(/wallet request timed out/i),
    ).toBeInTheDocument();
  });

  it("supports replay-safe verification retry without re-sending tip", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockSendTip.mockResolvedValue({ success: true, txHash: "tx-retry-1" });
    mockVerifyTip
      .mockResolvedValueOnce({
        success: false,
        error: "temporary backend timeout",
      })
      .mockResolvedValueOnce({ success: true, tip: undefined });

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip confession/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));
    await confirmOnChain();

    expect(
      await screen.findByText(/temporary backend timeout/i),
    ).toBeInTheDocument();
    expect(mockVerifyTip).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /retry verification/i }),
    );

    await waitFor(() => {
      expect(mockVerifyTip).toHaveBeenCalledTimes(2);
    });
    expect(mockSendTip).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/tip sent successfully/i),
    ).toBeInTheDocument();
  });

  it("prevents duplicate tip submissions while one is in-flight", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    let resolveSend: (value: any) => void;
    const sendPromise = new Promise((resolve) => {
      resolveSend = resolve;
    });

    mockSendTip.mockReturnValue(sendPromise);

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip/i }));
    const sendButton = screen.getByRole("button", {
      name: /send 0.1 xlm tip/i,
    });

    // First click
    await user.click(sendButton);
    expect(mockSendTip).toHaveBeenCalledTimes(1);

    // Verify button is disabled and multiple clicks don't trigger more requests
    expect(sendButton).toBeDisabled();
    await user.click(sendButton);
    await user.click(sendButton);

    expect(mockSendTip).toHaveBeenCalledTimes(1);

    // Resolve
    resolveSend!(successfulAnchorResult);
    mockVerifyTip.mockResolvedValue({ success: true, tip: undefined });
    await confirmOnChain();

    await waitFor(() => {
      expect(screen.getByText(/tip sent successfully/i)).toBeInTheDocument();
    });
  });

  it("prevents duplicate verification retries while one is in-flight", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Setup initial failed verification to show the retry button
    mockSendTip.mockResolvedValue({ success: true, txHash: "tx-verif-retry" });
    mockVerifyTip.mockResolvedValueOnce({ success: false, error: "pending" });

    renderTipButton();

    await user.click(screen.getByRole("button", { name: /tip/i }));
    await user.click(screen.getByRole("button", { name: /send 0.1 xlm tip/i }));
    await confirmOnChain();

    const retryButton = await screen.findByRole("button", {
      name: /retry verification/i,
    });

    // Setup deferred verify promise
    let resolveVerify: (value: any) => void;
    const verifyPromise = new Promise((resolve) => {
      resolveVerify = resolve;
    });

    mockVerifyTip.mockReturnValue(verifyPromise);

    // Click retry
    await user.click(retryButton);
    expect(mockVerifyTip).toHaveBeenCalledTimes(2); // Initial one + this retry

    // Multiple clicks should not trigger duplicate verification calls.
    await user.click(retryButton);

    expect(mockVerifyTip).toHaveBeenCalledTimes(2);

    // Resolve
    resolveVerify!({ success: true, tip: undefined });

    await waitFor(() => {
      expect(screen.getByText(/tip sent successfully/i)).toBeInTheDocument();
    });
  });
});
