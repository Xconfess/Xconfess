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

describe("GET /api/confessions", () => {
  const mockConfessions = [
    { id: 1, title: "Confession 1" },
    { id: 2, title: "Confession 2" },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("should return 200 with paginated confessions", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockConfessions, total: 2 }),
    });

    const request = new Request("https://xconfess.vercel.app/api/confessions");
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("confessions");
    expect(data.confessions).toHaveLength(2);
  });
});

describe("methodNotAllowed fallbacks for /api/confessions", () => {
  const request = new Request("https://xconfess.vercel.app/api/confessions");

  it.each([
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
    expect(body.message).toContain("POST");

    const allowHeader = response.headers.get("Allow");
    expect(allowHeader).toContain("GET");
    expect(allowHeader).toContain("POST");
  });
});