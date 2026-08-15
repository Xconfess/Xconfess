import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WalletButton from "@/components/wallet/WalletButton";
import { WalletContext } from "@/lib/providers/WalletProvider";
import type { UseWalletReturn } from "@/lib/hooks/useWallet";
import { disconnectedWallet, connectedWallet, createWalletMock } from "@/tests/mocks/wallet-fixtures";

function renderWithWalletContext(value: UseWalletReturn) {
  return render(
    <WalletContext.Provider value={value}>
      <WalletButton />
    </WalletContext.Provider>,
  );
}

describe("WalletButton", () => {
  it("connects wallet from the disconnected state", async () => {
    const user = userEvent.setup();
    const wallet = disconnectedWallet();
    renderWithWalletContext(wallet);

    await user.click(screen.getByRole("button", { name: /connect wallet/i }));

    expect(wallet.connect).toHaveBeenCalledTimes(1);
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
