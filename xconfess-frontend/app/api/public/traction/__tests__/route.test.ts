import { GET } from "../route";

jest.mock("@/app/lib/api/proxy", () => ({
  resolveBackendRoute: jest.fn(() => ({
    url: "http://backend.test/api/public/traction",
    requestId: "req-1",
  })),
  methodNotAllowedHandlers: jest.fn(() => ({})),
}));

jest.mock("@/app/lib/utils/requestId", () => ({
  getOrCreateRequestId: jest.fn(() => "req-1"),
  requestIdResponseHeaders: jest.fn(() => ({ "x-request-id": "req-1" })),
}));

jest.mock("@/lib/apiErrorHandler", () => ({
  createApiErrorResponse: jest.fn((_error, options) =>
    new Response(JSON.stringify({ message: options.fallbackMessage }), {
      status: options.status,
      headers: { "Content-Type": "application/json" },
    }),
  ),
}));

describe("GET /api/public/traction", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("proxies the public traction endpoint with cache and request id headers", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({ schemaVersion: 1 }),
    } as Response);

    const response = await GET(new Request("http://localhost/api/public/traction"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(body).toEqual({ schemaVersion: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend.test/api/public/traction",
      expect.objectContaining({
        method: "GET",
        next: { revalidate: 60 },
      }),
    );
  });
});
