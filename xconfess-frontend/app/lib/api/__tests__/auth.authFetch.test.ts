/**
 * Tests for authFetch() — verifies it routes through /api/* proxy paths
 * and never constructs absolute backend URLs.
 */

import { authFetch } from "../auth";

describe("authFetch — proxy routing", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("passes through paths that already start with /api/", async () => {
    await authFetch("/api/auth/session");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/api/auth/session");
    expect(calledUrl).not.toMatch(/localhost:5000|localhost:3001/);
  });

  it("rewrites bare backend paths to /api/* proxy routes", async () => {
    await authFetch("/auth/session");

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("/api/auth/session");
    expect(calledUrl).not.toMatch(/localhost:5000|localhost:3001/);
  });

  it("uses credentials: same-origin, not credentials: include", async () => {
    await authFetch("/api/auth/session");

    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledOptions.credentials).toBe("same-origin");
  });

  it("sets Content-Type: application/json by default", async () => {
    await authFetch("/api/users/register");

    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(calledOptions.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("respects caller-supplied Content-Type override", async () => {
    await authFetch("/api/auth/session", {
      headers: { "Content-Type": "text/plain" },
    });

    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(calledOptions.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("text/plain");
  });

  it("forwards method and body from options", async () => {
    const body = JSON.stringify({ email: "a@b.com", password: "pw" });
    await authFetch("/api/auth/session", { method: "POST", body });

    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledOptions.method).toBe("POST");
    expect(JSON.parse(calledOptions.body as string)).toMatchObject({
      email: "a@b.com",
    });
  });
});
