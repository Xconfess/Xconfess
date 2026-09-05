import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TractionDashboard } from "../traction-dashboard";

const mockMetrics = {
  schemaVersion: 1,
  generatedAt: "2026-09-05T12:00:00.000Z",
  users: { totalRegistered: 12, dau: 3, wau: 7, mau: 10 },
  engagement: {
    confessionsCreated: 21,
    commentsCreated: 8,
    reactionsCreated: 44,
    messagesSent: 5,
  },
  stellar: {
    network: "testnet",
    walletsConnected: 2,
    submittedTransactions: 4,
    confirmedTransactions: 3,
    failedTransactions: 1,
    successfulTips: 3,
    tipVolumeByAsset: { XLM: "9.5" },
    sorobanEventsIndexed: 1,
    contracts: {
      confessionAnchorContractId: "CANCHOR123456789",
      reputationBadgesContractId: null,
      tippingSystemContractId: "CTIPPING123456789",
    },
  },
  reliability: { transactionSuccessRate: 75 },
};

describe("TractionDashboard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders aggregate metrics from the public traction endpoint", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockMetrics,
    } as Response);

    render(<TractionDashboard />);

    expect(await screen.findByText("Public traction")).toBeInTheDocument();
    expect(screen.getByText("Registered users")).toBeInTheDocument();

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Testnet")).toBeInTheDocument();
    expect(screen.getByText("9.5 XLM")).toBeInTheDocument();
    expect(screen.getByText("75.00%")).toBeInTheDocument();
    expect(screen.queryByText(/confession body/i)).not.toBeInTheDocument();
  });

  it("renders a retryable error state", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => mockMetrics } as Response);

    render(<TractionDashboard />);

    await waitFor(() =>
      expect(screen.getByText("Traction metrics are unavailable")).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(screen.getByText("9.5 XLM")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
