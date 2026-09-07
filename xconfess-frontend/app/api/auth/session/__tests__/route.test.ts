/**
 * @jest-environment jsdom
 */
process.env.BACKEND_API_URL = "http://localhost:3001/api";

import { GET } from "../route";
import { cookies } from "next/headers";

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
    global.fetch = jest.fn();
    (cookies as jest.Mock).mockResolvedValue({
      get: jest.fn().mockReturnValue({ value: mockToken }),
      delete: jest.fn(),
    });
  });

  it("should return session from /auth/session (canonical) if successful", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    });

    const response = await GET(request);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/session"),
      expect.any(Object),
    );
    await expect(response.json()).resolves.toEqual({ authenticated: true, user: mockUser });
  });

  it("should fallback to /auth/me if /auth/session returns 404", async () => {
    // First call: 404
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    // Second call: 200
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
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

  it("should return 401 and clear cookie if both fail with 401", async () => {
    const mockCookieStore = {
      get: jest.fn().mockReturnValue({ value: mockToken }),
      delete: jest.fn(),
    };
    (cookies as jest.Mock).mockResolvedValue(mockCookieStore);

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
    });

    await GET(request);

    expect(mockCookieStore.delete).toHaveBeenCalledWith("xconfess_session");
  });
});
