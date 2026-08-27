import { verifyTip } from "@/lib/services/tipping.service";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("tipping.service verifyTip", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("treats duplicate/replay verify responses as success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ message: "Tip already verified for this tx" }, 409),
    );

    const result = await verifyTip("confession-1", "tx-dup-1");

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries transient backend errors and succeeds", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse({ message: "Temporary service unavailable" }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "tip-1",
          confessionId: "confession-1",
          amount: 0.2,
          txId: "tx-1",
          senderAddress: "GSENDER",
          createdAt: new Date().toISOString(),
        }),
      );

    const result = await verifyTip("confession-1", "tx-1");

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns actionable error when verification ultimately fails", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ message: "Gateway timeout" }, 503))
      .mockResolvedValueOnce(jsonResponse({ message: "Gateway timeout" }, 503));

    const result = await verifyTip("confession-1", "tx-timeout-1");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/gateway timeout/i);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
