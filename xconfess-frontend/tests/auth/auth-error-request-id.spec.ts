/**
 * Verifies failed login/register attempts carry the proxy request id so it can
 * be surfaced to the user for log tracing (issue #1729).
 */
jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  const instance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    get: jest.fn(),
    post: jest.fn(),
  };
  return {
    ...actual,
    default: { ...actual.default, create: () => instance },
    create: () => instance,
  };
});

jest.mock("@/app/lib/config", () => ({ getApiBaseUrl: () => "" }));

import { AppError } from "@/app/lib/utils/errorHandler";
import { extractRequestId } from "@/app/lib/utils/errorHandler";
import { authApi, extractResponseRequestId } from "@/app/lib/api/authService";

describe("extractResponseRequestId", () => {
  it("prefers the x-request-id response header", () => {
    const response = new Response("{}", {
      headers: { "x-request-id": "hdr-1" },
    });
    expect(extractResponseRequestId(response, { correlationId: "body-1" })).toBe(
      "hdr-1",
    );
  });

  it("falls back to the body correlation id", () => {
    const response = new Response("{}");
    expect(
      extractResponseRequestId(response, { correlationId: "body-1" }),
    ).toBe("body-1");
  });
});

describe("auth errors expose the request id", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("attaches the request id to a failed login", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "UNAUTHORIZED", message: "nope" }),
        { status: 401, headers: { "x-request-id": "login-req-9" } },
      ),
    );

    const error = await authApi
      .login({ email: "a@b.com", password: "secret12" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(extractRequestId(error)).toBe("login-req-9");
  });

  it("attaches the request id to a failed registration", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Email already exists",
          code: "ALREADY_EXISTS",
          correlationId: "reg-req-4",
        }),
        { status: 409 },
      ),
    );

    const error = await authApi
      .register({ email: "a@b.com", password: "secret12", username: "alice" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(extractRequestId(error)).toBe("reg-req-4");
  });
});
