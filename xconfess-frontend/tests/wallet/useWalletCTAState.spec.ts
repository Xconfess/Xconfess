import { getWalletCTAState } from "@/lib/hooks/useWalletCTAState";
import {
  walletNotInstalled,
  disconnectedWallet,
  connectedWallet,
  wrongNetworkWallet,
  loadingWallet,
  connectedNotReadyWallet,
} from "@/tests/mocks/wallet-fixtures";

describe("getWalletCTAState", () => {
  it("returns loading state", () => {
    expect(getWalletCTAState(loadingWallet())).toEqual({
      status: "loading",
      disabled: true,
      guidance: null,
    });
  });

  it("returns not-installed state", () => {
    expect(getWalletCTAState(walletNotInstalled())).toEqual({
      status: "not-installed",
      disabled: true,
      guidance: "Create an XConfess Wallet or connect an external Stellar wallet to perform on-chain actions.",
    });
  });

  it("returns not-connected state", () => {
    expect(getWalletCTAState(disconnectedWallet())).toEqual({
      status: "not-connected",
      disabled: false,
      guidance: "Create an XConfess Wallet or connect an external Stellar wallet to perform on-chain actions.",
    });
  });

  it("returns not-ready state for wrong network", () => {
    expect(getWalletCTAState(wrongNetworkWallet())).toEqual({
      status: "not-ready",
      disabled: true,
      guidance: "Wrong network. Please switch to TESTNET_SOROBAN",
    });
  });

  it("returns not-ready state for connected but not ready wallet", () => {
    expect(getWalletCTAState(connectedNotReadyWallet())).toEqual({
      status: "not-ready",
      disabled: true,
      guidance: "Wallet not ready for transactions",
    });
  });

  it("treats the native embedded wallet as ready without Freighter", () => {
    expect(getWalletCTAState({ ...connectedWallet(), isFreighterInstalled: false, isEmbeddedWallet: true })).toEqual({
      status: "ready",
      disabled: false,
      guidance: null,
    });
  });

  it("returns ready state", () => {
    expect(getWalletCTAState(connectedWallet())).toEqual({
      status: "ready",
      disabled: false,
      guidance: null,
    });
  });

  it("respects extraDisabled when ready", () => {
    expect(
      getWalletCTAState(connectedWallet(), { extraDisabled: true }),
    ).toEqual({
      status: "ready",
      disabled: true,
      guidance: null,
    });
  });

  it("ignores extraDisabled when not ready", () => {
    expect(
      getWalletCTAState(wrongNetworkWallet(), { extraDisabled: false }).disabled,
    ).toBe(true);
  });
});
