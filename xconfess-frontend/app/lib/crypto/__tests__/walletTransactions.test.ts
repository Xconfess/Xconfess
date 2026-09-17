import { getWalletErrorMessage } from "../walletTransactions";

describe("wallet transaction error mapping", () => {
  it("maps invalid recipients without exposing SDK details", () => {
    expect(getWalletErrorMessage(new Error("Invalid destination public key"))).toBe(
      "Enter a valid Stellar recipient address.",
    );
  });

  it("maps network failures to a safe retry message", () => {
    expect(getWalletErrorMessage(new Error("fetch failed"))).toContain(
      "Stellar is temporarily unavailable",
    );
  });

  it("preserves safe local PIN lock messages", () => {
    expect(getWalletErrorMessage(new Error("Incorrect wallet PIN"))).toBe(
      "Incorrect wallet PIN",
    );
  });
});
