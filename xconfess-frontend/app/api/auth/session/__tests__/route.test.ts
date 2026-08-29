/**
 * Cookie attribute tests for the session route handler.
 *
 * These tests verify that:
 *  1. Login (POST) sets a cookie with the correct security attributes
 *     (HttpOnly, Secure in production, SameSite=Strict, correct path and maxAge).
 *  2. Logout (DELETE) clears the cookie using the exact same attribute tuple —
 *     not just by name — so the browser definitely evicts it.
 *  3. GET clears the cookie with the same full tuple when the backend returns 401.
 *  4. SameSite and Secure values are driven by NODE_ENV, not hard-coded.
 *
 * These are unit tests of the route handler; they do not require a running server.
 */
process.env.BACKEND_API_URL = "http://localhost:3001/api";

import { POST, GET, DELETE } from "../route";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_COOKIE_CLEAR_OPTIONS,
} from "@/lib/cookieConfig";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("next/headers");
jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((data) => {
      const response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      return response;
    }),
  },
}));

describe("GET /api/auth/session", () => {
  const mockToken = "test-token";
  const mockUser = { id: 1, username: "testuser" };
  const request = new Request("https://xconfess.vercel.app/api/auth/session");

  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieStore = makeMockCookieStore();
    (cookies as jest.Mock).mockResolvedValue(mockCookieStore);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: mockToken,
        user: mockUser,
        anonymousUserId: "anon_abc123",
      }),
    });
  });

    const response = await GET(request);

    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      mockToken,
      expect.objectContaining({ httpOnly: true }),
    );
    await expect(response.json()).resolves.toEqual({ authenticated: true, user: mockUser });
  });

  it("uses the correct cookie name (xconfess_session)", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [name] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe("xconfess_session");
  });

  it("sets httpOnly: true", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.httpOnly).toBe(true);
  });

  it("sets sameSite: strict", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.sameSite).toBe("strict");
  });

  it("sets path: /", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.path).toBe("/");
  });

  it("sets maxAge to 7 days (604800 seconds)", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.maxAge).toBe(60 * 60 * 24 * 7);
  });

  it("Secure flag reflects NODE_ENV at module load time", async () => {
    // SESSION_COOKIE_OPTIONS.secure is evaluated once when the module is loaded.
    // In this test environment NODE_ENV is "test" (not "production"), so secure
    // is false — which is the correct local-dev behaviour documented in cookieConfig.ts.
    // The production enforcement is verified by the cookieConfig describe block below,
    // which asserts secure === (NODE_ENV === "production").
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));
    const [, , options] = mockCookieStore.set.mock.calls[0];
    // The route must forward whatever SESSION_COOKIE_OPTIONS specifies — not override it.
    expect(options.secure).toBe(SESSION_COOKIE_OPTIONS.secure);
  });

  it("uses SESSION_COOKIE_OPTIONS from the centralized config (no inline options)", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com", password: "password123" }));

    const [, , options] = mockCookieStore.set.mock.calls[0];
    // Every key from SESSION_COOKIE_OPTIONS must be present in the call
    for (const [key, value] of Object.entries(SESSION_COOKIE_OPTIONS)) {
      expect(options[key]).toBe(value);
    }
  });

  it("does not set the cookie when login credentials are missing", async () => {
    await POST(makeLoginRequest({ email: "alice@example.com" })); // no password
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("does not set the cookie when the backend rejects credentials", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid credentials", status: 401 }),
    });

    const response = await GET(request);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/auth/session"),
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/auth/me"),
      expect.any(Object),
    );
    await expect(response.json()).resolves.toEqual({ authenticated: true, user: mockUser });
  });

  it("uses cookieStore.set (not .delete) to ensure the full tuple matches", async () => {
    await DELETE();
    expect(mockCookieStore.set).toHaveBeenCalled();
    expect(mockCookieStore.delete).not.toHaveBeenCalled();
  });

  it("clears the correct cookie name", async () => {
    await DELETE();
    const [name] = mockCookieStore.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
  });

  it("sets the cookie value to an empty string when clearing", async () => {
    await DELETE();
    const [, value] = mockCookieStore.set.mock.calls[0];
    expect(value).toBe("");
  });

  it("uses maxAge: 0 to expire the cookie immediately", async () => {
    await DELETE();
    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.maxAge).toBe(0);
  });

  it("preserves the same path as the write (path: /)", async () => {
    await DELETE();
    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.path).toBe("/");
  });

  it("preserves the same sameSite as the write (strict)", async () => {
    await DELETE();
    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.sameSite).toBe("strict");
  });

  it("preserves httpOnly: true when clearing", async () => {
    await DELETE();
    const [, , options] = mockCookieStore.set.mock.calls[0];
    expect(options.httpOnly).toBe(true);
  });

  it("uses SESSION_COOKIE_CLEAR_OPTIONS from the centralized config", async () => {
    await DELETE();
    const [, , options] = mockCookieStore.set.mock.calls[0];
    for (const [key, value] of Object.entries(SESSION_COOKIE_CLEAR_OPTIONS)) {
      // expires is a Date — compare via valueOf
      if (value instanceof Date) {
        expect((options[key] as Date).valueOf()).toBe(value.valueOf());
      } else {
        expect(options[key]).toBe(value);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GET — 401 from backend clears cookie with full tuple
// ---------------------------------------------------------------------------

describe("GET /api/auth/session — cookie cleared with full tuple on 401", () => {
  const mockToken = "existing-token";
  let mockCookieStore: ReturnType<typeof makeMockCookieStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCookieStore = makeMockCookieStore();
    mockCookieStore.get.mockReturnValue({ value: mockToken });
    (cookies as jest.Mock).mockResolvedValue(mockCookieStore);
  });

  it("does not touch the cookie when session is valid", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, username: "alice" }),
    });

    await GET();
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(mockCookieStore.delete).not.toHaveBeenCalled();
  });

  it("clears the cookie via set (not delete) when backend returns 401", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized", status: 401 }),
    });

    await GET();
    expect(mockCookieStore.set).toHaveBeenCalled();
    expect(mockCookieStore.delete).not.toHaveBeenCalled();
  });

  it("uses the correct clear attributes when evicting the cookie on 401", async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized", status: 401 }),
    });

    await GET(request);

  it("SESSION_COOKIE_NAME is xconfess_session", () => {
    expect(SESSION_COOKIE_NAME).toBe("xconfess_session");
  });
});
