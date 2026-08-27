import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnchorButton } from "@/app/components/confession/AnchorButton";
import { TipButton } from "@/app/components/confession/TipButton";
import { useWallet, type UseWalletReturn } from "@/lib/hooks/useWallet";
import { useStellarWallet } from "@/lib/hooks/useStellarWallet";
import {
  walletNotInstalled,
  disconnectedWallet,
  connectedWallet,
  wrongNetworkWallet,
  connectedNotReadyWallet,
} from "@/tests/mocks/wallet-fixtures";

jest.mock("@/lib/hooks/useWallet", () => ({ useWallet: jest.fn() }));
jest.mock("@/lib/hooks/useStellarWallet", () => ({ useStellarWallet: jest.fn() }));
jest.mock("@/lib/services/tipping.service", () => ({
  sendTip: jest.fn(),
  verifyTip: jest.fn(),
  getTipStats: jest.fn().mockResolvedValue({ totalAmount: 0, totalCount: 0, averageAmount: 0 }),
}));

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockUseStellarWallet = useStellarWallet as jest.MockedFunction<typeof useStellarWallet>;

function toStellarWalletReturn(w: UseWalletReturn) {
  return {
    isAvailable: w.isFreighterInstalled,
    isConnected: w.isConnected,
    publicKey: w.publicKey,
    network: w.network,
    isLoading: w.isLoading,
    error: w.error,
    isReady: w.isReady,
    readinessError: w.readinessError,
    connect: w.connect,
    anchor: jest.fn().mockResolvedValue({ success: true, txHash: "tx-abc" }),
  };
}

function setup(fixture: UseWalletReturn) {
  mockUseWallet.mockReturnValue(fixture);
  mockUseStellarWallet.mockReturnValue(toStellarWalletReturn(fixture));
}

function renderBoth() {
  return render(
    <div>
      <div data-testid="anchor-section">
        <AnchorButton confessionId="c1" confessionContent="test" />
      </div>
      <div data-testid="tip-section">
        <TipButton
          confessionId="c1"
          recipientAddress="GABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEFGHIJKLMNOPQRSTUV"
        />
      </div>
    </div>,
  );
}

describe("Wallet readiness parity – AnchorButton vs TipButton", () => {
  afterEach(() => jest.resetAllMocks());

  it("not-installed: both show install guidance and disable action buttons", async () => {
    const user = userEvent.setup();
    setup(walletNotInstalled());
    renderBoth();

    const anchorSection = screen.getByTestId("anchor-section");
    expect(anchorSection).toHaveTextContent(/Freighter browser extension/i);

    const tipSection = screen.getByTestId("tip-section");
    const tipToggle = within(tipSection).getByRole("button");
    await user.click(tipToggle);

    expect(tipSection).toHaveTextContent(/Freighter browser extension/i);
    const tipAction = within(tipSection).getByRole("button", { name: /wallet required.*install freighter/i });
    expect(tipAction).toBeDisabled();
  });

  it("not-connected: both show Connect Wallet copy with enabled buttons", async () => {
    const user = userEvent.setup();
    setup(disconnectedWallet());
    renderBoth();

    const anchorSection = screen.getByTestId("anchor-section");
    const anchorBtn = within(anchorSection).getByRole("button");
    expect(anchorBtn).not.toBeDisabled();
    expect(anchorBtn).toHaveTextContent(/Connect Wallet to Anchor/i);

    const tipSection = screen.getByTestId("tip-section");
    await user.click(within(tipSection).getByRole("button"));

    const tipAction = within(tipSection).getByRole("button", { name: /connect wallet to tip/i });
    expect(tipAction).not.toBeDisabled();
    expect(tipAction).toHaveTextContent(/Connect Wallet to Tip/i);
  });

  it("wrong-network: both disable action buttons and show readinessError", async () => {
    const user = userEvent.setup();
    setup(wrongNetworkWallet());
    renderBoth();

    const anchorSection = screen.getByTestId("anchor-section");
    const anchorBtn = within(anchorSection).getByRole("button");
    expect(anchorBtn).toBeDisabled();
    expect(anchorSection).toHaveTextContent(/wrong network/i);

    const tipSection = screen.getByTestId("tip-section");
    await user.click(within(tipSection).getByRole("button"));

    const tipAction = within(tipSection).getByRole("button", { name: /send.*xlm tip/i });
    expect(tipAction).toBeDisabled();
    expect(tipSection).toHaveTextContent(/wrong network/i);
  });

  it("connected-not-ready: both disable action buttons and show guidance", async () => {
    const user = userEvent.setup();
    setup(connectedNotReadyWallet());
    renderBoth();

    const anchorSection = screen.getByTestId("anchor-section");
    const anchorBtn = within(anchorSection).getByRole("button");
    expect(anchorBtn).toBeDisabled();
    expect(anchorSection).toHaveTextContent(/not ready/i);

    const tipSection = screen.getByTestId("tip-section");
    await user.click(within(tipSection).getByRole("button"));

    const tipAction = within(tipSection).getByRole("button", { name: /send.*xlm tip/i });
    expect(tipAction).toBeDisabled();
    expect(tipSection).toHaveTextContent(/not ready/i);
  });

  it("ready: both enable action buttons with no guidance text", async () => {
    const user = userEvent.setup();
    setup(connectedWallet());
    renderBoth();

    const anchorSection = screen.getByTestId("anchor-section");
    const anchorBtn = within(anchorSection).getByRole("button");
    expect(anchorBtn).not.toBeDisabled();
    expect(anchorSection).not.toHaveTextContent(/Install Freighter/i);
    expect(anchorSection).not.toHaveTextContent(/wrong network/i);

    const tipSection = screen.getByTestId("tip-section");
    await user.click(within(tipSection).getByRole("button"));

    const tipAction = within(tipSection).getByRole("button", { name: /send.*xlm tip/i });
    expect(tipAction).not.toBeDisabled();
    expect(tipSection).not.toHaveTextContent(/Install Freighter/i);
    expect(tipSection).not.toHaveTextContent(/wrong network/i);
  });
});
