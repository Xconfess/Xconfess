/**
 * @jest-environment jsdom
 *
 * Note: this repo's global jest.setup.ts touches `window`, so all route
 * tests here run under jsdom rather than node — even though this handler
 * only ever executes server-side in production. Because jsdom always
 * defines `window`, `getApiBaseUrl()` resolves via its client-side branch
 * (NEXT_PUBLIC_API_URL) in this test, not the server branch (BACKEND_API_URL)
 * it uses in production. That's a test-environment artifact, not something
 * this test is trying to verify — what matters here is that the route
 * forwards the confession id, method, and body correctly, and passes every
 * backend response state through unmodified.
 *
 * Route-handler tests for POST /api/confessions/[id]/tips/verify (issue #1687).
 *
 * This route is a thin server-side proxy: browser code must never call the
 * backend directly. These tests verify the proxy forwards the request
 * correctly and passes through each typed backend response state
 * (verified / duplicate / pending / stale / failed / conflict) unmodified,
 * plus the backend-unreachable fallback.
 */
process.env.NEXT_PUBLIC_API_URL = "http://localhost:3001/api";
process.env.BACKEND_API_URL = "http://localhost:5000";

import { POST } from "../route";
import { cookies } from "next/headers";

jest.mock("next/headers");
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({ data, status: init?.status ?? 200 })),
  },
}));

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as any;
}

describe("POST /api/confessions/[id]/tips/verify", () => {
  const confessionId = "confession-1687";
  const txId = "a".repeat(64);

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue(undefined),
    });
  });

  it("forwards to the backend verify endpoint with the confession id in the path", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 201,
      json: async () => ({ state: "verified", success: true }),
    });

    await POST(makeRequest({ txId }), {
      params: Promise.resolve({ id: confessionId }),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledOptions] = (global.fetch as jest.Mock).mock.calls[0];
    // Path, method, and body are what this test verifies (see file header
    // for why the resolved host itself isn't asserted against BACKEND_API_URL).
    expect(calledUrl).toContain(`/confessions/${confessionId}/tips/verify`);
    expect(calledOptions.method).toBe("POST");
    expect(JSON.parse(calledOptions.body)).toEqual({ txId });
  });

  it("attaches the session bearer token when a session cookie is present", async () => {
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: "session-token-abc" }),
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 201,
      json: async () => ({ state: "verified", success: true }),
    });

    await POST(makeRequest({ txId }), {
      params: Promise.resolve({ id: confessionId }),
    });

    const [, calledOptions] = (global.fetch as jest.Mock).mock.calls[0];
    expect(calledOptions.headers.Authorization).toBe(
      "Bearer session-token-abc",
    );
  });

  it.each([
    ["verified", 201, { state: "verified", success: true, isNew: true }],
    ["duplicate", 201, { state: "duplicate", success: true, isNew: false }],
    [
      "pending",
      409,
      { message: "still processing", state: "pending", canRetry: true },
    ],
    [
      "stale",
      409,
      { message: "under review", state: "stale", canRetry: true },
    ],
    [
      "conflict",
      409,
      { message: "different confession", state: "conflict", canRetry: false },
    ],
    [
      "failed",
      400,
      { message: "could not be verified", state: "failed", canRetry: false },
    ],
  ])(
    "passes the typed \"%s\" backend response straight through unmodified",
    async (_label, status, body) => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status,
        json: async () => body,
      });

      const response = await POST(makeRequest({ txId }), {
        params: Promise.resolve({ id: confessionId }),
      });

      expect(response.status).toBe(status);
      expect(response.data).toEqual(body);
    },
  );

  it("returns 503 with a user-safe message when the backend is unreachable", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const response = await POST(makeRequest({ txId }), {
      params: Promise.resolve({ id: confessionId }),
    });

    expect(response.status).toBe(503);
    expect(response.data).toEqual({ error: "Backend service unreachable" });
    // The raw network error must never leak to the client.
    expect(JSON.stringify(response.data)).not.toMatch(/ECONNREFUSED/);
  });

  it("tolerates an empty/invalid request body instead of throwing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 400,
      json: async () => ({ message: "txId is required" }),
    });

    const badRequest = {
      json: async () => {
        throw new Error("Unexpected end of JSON input");
      },
    } as any;

    const response = await POST(badRequest, {
      params: Promise.resolve({ id: confessionId }),
    });

    expect(response.status).toBe(400);
  });
});
