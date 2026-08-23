/**
 * @jest-environment jsdom
 */
process.env.BACKEND_API_URL = "http://localhost:3001/api";

// Polyfill Response.json for jsdom (missing in older jsdom Response)
if (typeof (Response as any).json !== "function") {
  (Response as any).json = (data: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(data), init);
}

import { GET, POST, PUT, PATCH, DELETE } from "../route";

describe("GET /api/notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("should hit the backend and return a response", async () => {
    const mockNotifications = [
      { id: 1, type: "like", message: "Someone liked your confession" },
    ];
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(mockNotifications), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // NextRequest-like request that the handler depends on
    const request = new Request("https://xconfess.vercel.app/api/notifications");
    (request as unknown as Record<string, unknown>).nextUrl = {
      searchParams: new URL("https://xconfess.vercel.app/api/notifications").searchParams,
    };
    const response = await GET(request as unknown as Parameters<typeof GET>[0]);
    expect(response.status).toBe(200);
  });
});

describe("methodNotAllowed fallbacks for /api/notifications", () => {
  const request = new Request("https://xconfess.vercel.app/api/notifications");

  it.each([
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("should return 405 for %s", async (method, handler) => {
    const response = await handler(request);
    expect(response.status).toBe(405);

    const body = await response.json();
    expect(body).toHaveProperty("code", "METHOD_NOT_ALLOWED");
    expect(body.message).toContain(method);
    expect(body.message).toContain("GET");

    const allowHeader = response.headers.get("Allow");
    expect(allowHeader).toBe("GET");
  });
});