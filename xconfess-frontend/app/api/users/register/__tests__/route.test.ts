/**
 * @jest-environment jsdom
 */

function makeRequest(body: unknown, url = "https://xconfess.vercel.app/api/users/register") {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadRouteWithBaseUrl(baseUrl: string | Error) {
  jest.resetModules();
  jest.doMock("@/app/lib/config", () => ({
    getApiBaseUrl: () => {
      if (baseUrl instanceof Error) throw baseUrl;
      return baseUrl;
    },
  }));
  return import("../route");
}

describe("POST /api/users/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.dontMock("@/app/lib/config");
  });

  it("proxies registration to the configured Render backend", async () => {
    const { POST } = await loadRouteWithBaseUrl(
      "https://xconfess-backend.onrender.com/api",
    );
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: 1, username: "alice" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await POST(
      makeRequest({
        email: "alice@example.com",
        password: "Str0ng!Pass#1",
        username: "alice",
      }),
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://xconfess-backend.onrender.com/api/users/register",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects a self-referential backend URL instead of proxying to Vercel", async () => {
    const { POST } = await loadRouteWithBaseUrl("https://xconfess.vercel.app/api");

    const response = await POST(
      makeRequest({
        email: "loop@example.com",
        password: "Str0ng!Pass#1",
        username: "loop_user",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe("BACKEND_API_URL_SELF_REFERENCE");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns a clear 503 when BACKEND_API_URL is missing in production", async () => {
    const { POST } = await loadRouteWithBaseUrl(
      new Error(
        "BACKEND_API_URL is required for server-side API proxy routes in production.",
      ),
    );

    const response = await POST(
      makeRequest({
        email: "missing@example.com",
        password: "Str0ng!Pass#1",
        username: "missing_url",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.message).toMatch(/BACKEND_API_URL/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
