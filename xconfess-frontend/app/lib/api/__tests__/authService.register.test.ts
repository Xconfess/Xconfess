/**
 * Tests for authApi.register() — verifies it calls /api/users/register
 * (proxy route) and never contacts the backend directly.
 */

// Use real axios but mock create() to avoid interceptor issues in test env
jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  const mockInterceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  };
  const instance = {
    interceptors: mockInterceptors,
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    ...actual,
    default: { ...actual.default, create: () => instance },
    create: () => instance,
  };
});

jest.mock("@/app/lib/store/authStore", () => ({
  useAuthStore: { getState: () => ({ logout: jest.fn() }) },
}));

jest.mock("@/app/lib/config", () => ({
  getApiBaseUrl: () => "",
}));

import { AppError } from "@/app/lib/utils/errorHandler";
import { authApi, getAuthFieldError } from "../authService";

describe("authApi.register — proxy routing", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("POSTs to /api/users/register, not directly to the backend", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "u-1", email: "a@b.com", username: "alice" }),
        { status: 200 },
      ),
    );

    await authApi.register({ email: "a@b.com", password: "pass", username: "alice" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;

    expect(calledUrl).toBe("/api/users/register");
    expect(calledUrl).not.toMatch(/localhost:5000|localhost:3001/);
    expect(calledOptions.method).toBe("POST");
    expect(JSON.parse(calledOptions.body as string)).toMatchObject({
      email: "a@b.com",
      username: "alice",
    });
  });

  it("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "An account with this email already exists.",
          code: "ALREADY_EXISTS",
          details: { field: "email" },
        }),
        { status: 409 },
      ),
    );

    let thrown: unknown;
    try {
      await authApi.register({
        email: "dup@b.com",
        password: "pass",
        username: "bob",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).message).toBe(
      "An account with this email already exists.",
    );
    expect(getAuthFieldError(thrown)).toBe("email");
  });

  it("throws on network failure", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Failed to fetch"));

    await expect(
      authApi.register({ email: "x@b.com", password: "pw", username: "cx" }),
    ).rejects.toThrow();
  });
});
