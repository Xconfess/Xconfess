/**
 * Tests for tipping service — verifies that verifyTip() and getTipStats()
 * call through /api proxy routes and never contact the backend host directly.
 */

// Mock Stellar SDK to avoid Node.js environment issues
jest.mock("@stellar/stellar-sdk", () => ({
  Networks: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
  Horizon: { Server: jest.fn() },
  Keypair: { fromPublicKey: jest.fn() },
  TransactionBuilder: jest.fn(),
  Operation: { payment: jest.fn() },
  Asset: { native: jest.fn() },
  BASE_FEE: "100",
}));

// Mock Freighter adapter
jest.mock("@/lib/wallet/freighterAdapter", () => ({
  isFreighterInstalled: jest.fn().mockReturnValue(false),
  freighterGetPublicKey: jest.fn(),
  freighterSignTransaction: jest.fn(),
}));

import { verifyTip, getTipStats } from "@/lib/services/tipping.service";

describe("tipping.service — proxy routing", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("verifyTip", () => {
    it("calls /api/confessions/:id/tips/verify proxy route, not the backend directly", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ tip: { id: "tip-1" } }), { status: 200 }),
      );

      await verifyTip("confession-123", "abc123txhash");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe("/api/confessions/confession-123/tips/verify");
      expect(calledUrl).not.toMatch(/localhost:5000|localhost:3001|BACKEND_URL/);
    });

    it("sends POST with the transaction hash in the body", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      await verifyTip("confession-42", "deadbeeftxhash");

      const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe("POST");
      expect(JSON.parse(calledOptions.body as string)).toEqual({
        txId: "deadbeeftxhash",
      });
    });

    it("returns success=true on 200", async () => {
      const mockTip = {
        id: "tip-99",
        confessionId: "c-1",
        amount: 1,
        txId: "hash",
        senderAddress: null,
        createdAt: "",
      };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ tip: mockTip }), { status: 200 }),
      );

      const result = await verifyTip("c-1", "hash");
      expect(result.success).toBe(true);
      expect(result.tip).toEqual(mockTip);
    });

    it("returns success=true for idempotent 409 (already verified)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "already verified" }), {
          status: 409,
        }),
      );

      const result = await verifyTip("c-1", "hash");
      expect(result.success).toBe(true);
      expect(result.isIdempotent).toBe(true);
    });

    it("returns success=false on non-retryable 400 error", async () => {
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ message: "Bad request" }), {
          status: 400,
        }),
      );

      const result = await verifyTip("c-1", "badhash");
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe("getTipStats", () => {
    it("calls /api/confessions/:id/tips/stats proxy route, not the backend directly", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ totalAmount: 10, totalCount: 2, averageAmount: 5 }),
          { status: 200 },
        ),
      );

      await getTipStats("confession-abc");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe("/api/confessions/confession-abc/tips/stats");
      expect(calledUrl).not.toMatch(/localhost:5000|localhost:3001|BACKEND_URL/);
    });

    it("returns the stats object on 200", async () => {
      const stats = { totalAmount: 5.5, totalCount: 3, averageAmount: 1.83 };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(stats), { status: 200 }),
      );

      const result = await getTipStats("c-2");
      expect(result).toEqual(stats);
    });

    it("returns null on non-ok response", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 404 }),
      );

      const result = await getTipStats("c-missing");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));

      const result = await getTipStats("c-offline");
      expect(result).toBeNull();
    });
  });
});
