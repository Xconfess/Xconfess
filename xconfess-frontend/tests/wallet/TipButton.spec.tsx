import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TipButton } from "@/app/components/confession/TipButton";

jest.mock("@/lib/services/tipping.service", () => ({
  sendTip: jest.fn(),
  verifyTip: jest.fn(),
  getTipStats: jest.fn(),
}));

jest.mock("@/lib/hooks/useWallet", () => ({
  useWallet: jest.fn(),
}));

jest.mock("@/lib/hooks/useWalletCTAState", () => ({
  getWalletCTAState: jest.fn(),
}));

jest.mock("@/app/lib/store/activity.store", () => ({
  useActivityStore: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "test-activity-id"),
}));

import { sendTip, verifyTip, getTipStats } from "@/lib/services/tipping.service";
import { useWallet } from "@/lib/hooks/useWallet";
import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import { useActivityStore } from "@/app/lib/store/activity.store";

const mockSendTip = sendTip as jest.Mock;
const mockVerifyTip = verifyTip as jest.Mock;
const mockGetTipStats = getTipStats as jest.Mock;
const mockUseWallet = useWallet as jest.Mock;
const mockWalletCTA = getWalletCTAState as jest.Mock;
const mockAddActivity = jest.fn();
const mockUpdateActivity = jest.fn();
const mockUseActivityStore = useActivityStore as unknown as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ successful: true }),
  }) as unknown as typeof fetch;

  mockUseWallet.mockReturnValue({
    isConnected: true,
    connect: jest.fn(),
    wallet: {},
  });

  mockWalletCTA.mockReturnValue({
    status: "connected",
    disabled: false,
    guidance: "",
  });

  mockUseActivityStore.mockImplementation((selector: (state: any) => any) => {
    const state = {
      addActivity: mockAddActivity,
      updateActivity: mockUpdateActivity,
    };
    return selector(state);
  });

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

describe("TipButton", () => {
  const defaultProps = {
    confessionId: "confession-1",
    recipientAddress: "GBVXZHTLP3PFTIQYKQJQAZCQVKTQSQFM23R2PI7F3VGHKJJUXQWVYUHH",
  };

  it("renders tip button with stats", async () => {
    render(<TipButton {...defaultProps} />);
    const button = screen.getByLabelText("Tip confession");
    expect(button).toBeInTheDocument();
  });

  it("opens tip panel on click", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));
    expect(screen.getByText("Send Tip")).toBeInTheDocument();
    expect(screen.getByLabelText("Tip amount in XLM")).toBeInTheDocument();
  });

  it("shows confirmed state with amount and explorer link on success", async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      txHash: "a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1",
    });
    mockVerifyTip.mockResolvedValue({ success: true });
    mockGetTipStats.mockResolvedValue({
      totalAmount: 0.5,
      totalCount: 1,
      averageAmount: 0.5,
    });

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "0.5" } });

    const sendButton = screen.getByText("Tip 0.5 XLM");
    fireEvent.click(sendButton);
    await confirmOnChain();

    await waitFor(() => {
      expect(screen.getByText("Tip confirmed")).toBeInTheDocument();
    });

    expect(screen.getByText("0.5 XLM sent")).toBeInTheDocument();
    const explorerLink = screen.getByText("View on testnet.steexp.com");
    expect(explorerLink).toHaveAttribute("href");
    expect(explorerLink).toHaveAttribute("target", "_blank");
  });

  it("shows pending verification state when verification takes time", async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      txHash: "a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1",
    });
    mockVerifyTip.mockResolvedValue({ success: false });

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "0.5" } });

    fireEvent.click(screen.getByText("Tip 0.5 XLM"));
    await confirmOnChain();

    await waitFor(() => {
      expect(screen.getByText("Verification failed")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry Verification")).toBeInTheDocument();
    expect(screen.getByText("View on Explorer")).toBeInTheDocument();
  });

  it("shows error state with dismiss on failure", async () => {
    mockSendTip.mockResolvedValue({
      success: false,
      error: "Insufficient XLM balance",
    });

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "0.5" } });

    fireEvent.click(screen.getByText("Tip 0.5 XLM"));

    await waitFor(() => {
      expect(screen.getByText("Insufficient XLM balance")).toBeInTheDocument();
    });

    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("shows guidance for wallet connection state", async () => {
    mockWalletCTA.mockReturnValue({
      status: "not-connected",
      disabled: false,
      guidance: "Connect your Freighter wallet to send tips",
    });

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    expect(screen.getByText("Connect Wallet to Tip")).toBeInTheDocument();
  });

  it("disables send button while sending", async () => {
    mockSendTip.mockImplementation(
      () => new Promise(() => {}),
    );

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    fireEvent.click(screen.getByText(`Tip ${0.1} XLM`));

    await waitFor(() => {
      const sendButton = screen.getByRole("button", { name: "Sending…" });
      expect(sendButton).toBeInTheDocument();
      expect(sendButton).toBeDisabled();
    });
  });

  it("shows validation guidance for tip amount precision and unit", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    expect(
      screen.getByText(/Enter amount in XLM with 0.1 precision/i),
    ).toBeInTheDocument();
  });

  it("prevents sending for empty tip amount", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "" } });

    fireEvent.click(screen.getByText(/Tip\s*XLM/));

    await waitFor(() => {
      expect(screen.getAllByText(/Enter a tip amount in XLM/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("prevents sending for zero tip amount", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "0" } });

    fireEvent.click(screen.getByText("Tip 0 XLM"));

    await waitFor(() => {
      expect(screen.getAllByText(/greater than zero/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("prevents sending for negative tip amount", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "-1" } });

    fireEvent.click(screen.getByText("Tip -1 XLM"));

    await waitFor(() => {
      expect(screen.getAllByText(/cannot be negative/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("prevents sending for nonnumeric tip amount", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "abc" } });

    fireEvent.click(screen.getByText("Tip abc XLM"));

    await waitFor(() => {
      expect(screen.getAllByText(/Enter a valid numeric amount/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("shows minimum tip error for amounts below threshold", async () => {
    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    const input = screen.getByLabelText("Tip amount in XLM");
    fireEvent.change(input, { target: { value: "0.01" } });

    fireEvent.click(screen.getByText("Tip 0.01 XLM"));

    await waitFor(() => {
      expect(screen.getAllByText(/Minimum tip/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mockSendTip).not.toHaveBeenCalled();
  });

  it("displays tip stats in footer", async () => {
    mockGetTipStats.mockResolvedValue({
      totalAmount: 10.5,
      totalCount: 5,
      averageAmount: 2.1,
    });

    render(<TipButton {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Tip confession"));

    await waitFor(() => {
      expect(screen.getByText(/10.50 XLM total/)).toBeInTheDocument();
      expect(screen.getByText(/5 tips/)).toBeInTheDocument();
    });
  });
});
