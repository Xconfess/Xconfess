import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletButton from "@/components/wallet/WalletButton";
import { WalletContext } from "@/lib/providers/WalletProvider";
import type { UseWalletReturn } from "@/lib/hooks/useWallet";
import {
  disconnectedWallet,
  connectedWallet,
  createWalletMock,
  walletNotInstalled,
} from "@/tests/mocks/wallet-fixtures";

function renderWithWalletContext(value: UseWalletReturn) {
  return render(
    <WalletContext.Provider value={value}>
      <WalletButton />
    </WalletContext.Provider>,
  );
}

describe("WalletButton", () => {
  const originalOpen = window.open;

  afterEach(() => {
    window.open = originalOpen;
    jest.restoreAllMocks();
  });

  it("connects wallet from the disconnected state", async () => {
    const user = userEvent.setup();
    const wallet = disconnectedWallet();
    renderWithWalletContext(wallet);

    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(wallet.connect).toHaveBeenCalledTimes(1);
  });

  it("opens Freighter install page when wallet is not installed", async () => {
    const user = userEvent.setup();
    const open = jest.fn();
    window.open = open;
    const wallet = createWalletMock({
      ...walletNotInstalled(),
      error: "Freighter wallet is not installed",
    });
    renderWithWalletContext(wallet);

    await user.click(screen.getByRole("button", { name: /install wallet/i }));

    expect(open).toHaveBeenCalledWith(
      "https://www.freighter.app/",
      "_blank",
      "noopener,noreferrer",
    );
    expect(wallet.connect).not.toHaveBeenCalled();
  });

  it("allows disconnecting from the wallet menu", async () => {
    const user = userEvent.setup();
    const wallet = createWalletMock({
      isConnected: true,
      isReady: true,
      publicKey: "GABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEF1234567890",
      network: "TESTNET",
    });
    renderWithWalletContext(wallet);

    await user.click(screen.getByRole("button", { name: /wallet menu/i }));
    await user.click(screen.getByRole("button", { name: /disconnect/i }));

    expect(wallet.disconnect).toHaveBeenCalledTimes(1);
  });

  it("renders connected state immediately for restored sessions", () => {
    const wallet = createWalletMock({
      isConnected: true,
      isReady: true,
      publicKey: "GRESTOREDSESSION1234567890ABCDEFGHIJKLMNOPQRSTUVWX",
    });
    renderWithWalletContext(wallet);

    expect(screen.queryByRole("button", { name: /connect wallet/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wallet menu/i })).toBeInTheDocument();
  });
});
