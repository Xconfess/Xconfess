import {
  buildProxyErrorResponse,
  logProxyError,
  misconfiguredBackendResponse,
  backendHttpErrorResponse,
  backendUnreachableResponse,
  internalProxyErrorResponse,
  type ProxyErrorContext,
  type ProxyErrorBody,
} from "../proxyError";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function bodyOf(res: Response): Promise<ProxyErrorBody> {
  return res.json() as Promise<ProxyErrorBody>;
}

function makeSpy() {
  return jest.spyOn(console, "error").mockImplementation(() => {});
}

// ---------------------------------------------------------------------------
// buildProxyErrorResponse
// ---------------------------------------------------------------------------

describe("buildProxyErrorResponse", () => {
  it("sets the given HTTP status", async () => {
    const res = buildProxyErrorResponse("Not found", 404);
    expect(res.status).toBe(404);
  });

  it("sets Content-Type: application/json", () => {
    const res = buildProxyErrorResponse("Error", 500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes message in the body", async () => {
    const res = buildProxyErrorResponse("Something broke", 500);
    const body = await bodyOf(res);
    expect(body.message).toBe("Something broke");
  });

  it("includes a real correlationId in the body", async () => {
    const res = buildProxyErrorResponse("Error", 400, {
      correlationId: "req-abc-123",
    });
    const body = await bodyOf(res);
    expect(body.correlationId).toBe("req-abc-123");
  });

  it('omits correlationId when it is the sentinel "unknown"', async () => {
    const res = buildProxyErrorResponse("Error", 500, {
      correlationId: "unknown",
    });
    const body = await bodyOf(res);
    expect(body.correlationId).toBeUndefined();
  });

  it("omits correlationId when it is an empty string", async () => {
    const res = buildProxyErrorResponse("Error", 500, { correlationId: "" });
    const body = await bodyOf(res);
    expect(body.correlationId).toBeUndefined();
  });

  it("omits correlationId when ctx is not provided", async () => {
    const res = buildProxyErrorResponse("Error", 500);
    const body = await bodyOf(res);
    expect(body.correlationId).toBeUndefined();
  });

  it("includes backendStatus when provided", async () => {
    const res = buildProxyErrorResponse("Error", 502, { backendStatus: 503 });
    const body = await bodyOf(res);
    expect(body.backendStatus).toBe(503);
  });

  it("omits backendStatus when not provided", async () => {
    const res = buildProxyErrorResponse("Error", 500);
    const body = await bodyOf(res);
    expect(body.backendStatus).toBeUndefined();
  });

  it("includes both correlationId and backendStatus together", async () => {
    const res = buildProxyErrorResponse("Upstream failed", 502, {
      correlationId: "cid-42",
      backendStatus: 503,
    });
    const body = await bodyOf(res);
    expect(body.correlationId).toBe("cid-42");
    expect(body.backendStatus).toBe(503);
  });

  it("produces valid JSON that round-trips cleanly", async () => {
    const res = buildProxyErrorResponse("Test", 400, {
      correlationId: "cid-99",
      backendStatus: 400,
    });
    const text = await res.text();
    expect(() => JSON.parse(text)).not.toThrow();
    const parsed = JSON.parse(text) as ProxyErrorBody;
    expect(parsed.message).toBe("Test");
  });
});

// ---------------------------------------------------------------------------
// logProxyError
// ---------------------------------------------------------------------------

describe("logProxyError", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = makeSpy();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("formats prefix with route and CID", () => {
    logProxyError("Backend error", {
      route: "GET /api/confessions",
      correlationId: "cid-1",
    });
    expect(spy).toHaveBeenCalledWith(
      "[GET /api/confessions] Backend error (CID: cid-1)",
    );
  });

  it("includes backendStatus in the prefix", () => {
    logProxyError("Backend error", {
      route: "POST /api/confessions",
      correlationId: "cid-2",
      backendStatus: 422,
    });
    expect(spy).toHaveBeenCalledWith(
      "[POST /api/confessions] Backend error status=422 (CID: cid-2)",
    );
  });

  it("appends cause as a second console argument", () => {
    const err = new Error("ECONNREFUSED");
    logProxyError("Failed to reach backend", { route: "GET /api/foo" }, err);
    expect(spy).toHaveBeenCalledWith(
      "[GET /api/foo] Failed to reach backend",
      err,
    );
  });

  it('omits "(CID: ...)" when correlationId is "unknown"', () => {
    logProxyError("Internal error", {
      route: "GET /api/bar",
      correlationId: "unknown",
    });
    expect(spy).toHaveBeenCalledWith("[GET /api/bar] Internal error");
  });

  it("omits CID segment when correlationId is absent", () => {
    logProxyError("Internal error", { route: "GET /api/bar" });
    expect(spy).toHaveBeenCalledWith("[GET /api/bar] Internal error");
  });

  it("works without a route (no brackets)", () => {
    logProxyError("Some error", {});
    expect(spy).toHaveBeenCalledWith("Some error");
  });

  it("works without a route but with a cause", () => {
    const cause = new TypeError("bad type");
    logProxyError("Oops", {}, cause);
    expect(spy).toHaveBeenCalledWith("Oops", cause);
  });

  it("includes all three segments when route, backendStatus, and CID are present", () => {
    logProxyError("Backend error", {
      route: "PATCH /api/users/profile",
      correlationId: "cid-99",
      backendStatus: 409,
    });
    expect(spy).toHaveBeenCalledWith(
      "[PATCH /api/users/profile] Backend error status=409 (CID: cid-99)",
    );
  });

  it("calls console.error exactly once per invocation", () => {
    logProxyError("Test", { route: "GET /api/test", correlationId: "c" });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// misconfiguredBackendResponse
// ---------------------------------------------------------------------------

describe("misconfiguredBackendResponse", () => {
  it("returns 503", () => {
    expect(misconfiguredBackendResponse().status).toBe(503);
  });

  it("mentions BACKEND_API_URL in the message", async () => {
    const body = await bodyOf(misconfiguredBackendResponse());
    expect(body.message).toMatch(/BACKEND_API_URL/);
  });

  it("sets Content-Type: application/json", () => {
    const res = misconfiguredBackendResponse();
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("does not include correlationId or backendStatus", async () => {
    const body = await bodyOf(misconfiguredBackendResponse());
    expect(body.correlationId).toBeUndefined();
    expect(body.backendStatus).toBeUndefined();
  });

  it("does not call console.error", () => {
    const spy = makeSpy();
    misconfiguredBackendResponse();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// backendHttpErrorResponse
// ---------------------------------------------------------------------------

describe("backendHttpErrorResponse", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = makeSpy();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  const ctx: ProxyErrorContext = {
    route: "POST /api/confessions",
    correlationId: "cid-http",
  };

  it("mirrors the backend HTTP status", async () => {
    const res = backendHttpErrorResponse("Duplicate", 409, "Failed", ctx);
    expect(res.status).toBe(409);
  });

  it("uses backendMessage when provided", async () => {
    const res = backendHttpErrorResponse("Duplicate entry", 409, "Fallback", ctx);
    const body = await bodyOf(res);
    expect(body.message).toBe("Duplicate entry");
  });

  it("falls back to fallbackMessage when backendMessage is undefined", async () => {
    const res = backendHttpErrorResponse(undefined, 500, "Fallback msg", ctx);
    const body = await bodyOf(res);
    expect(body.message).toBe("Fallback msg");
  });

  it("falls back to fallbackMessage when backendMessage is empty string", async () => {
    const res = backendHttpErrorResponse("", 500, "Fallback msg", ctx);
    const body = await bodyOf(res);
    expect(body.message).toBe("Fallback msg");
  });

  it("embeds backendStatus in the body", async () => {
    const res = backendHttpErrorResponse("Error", 502, "Fallback", ctx);
    const body = await bodyOf(res);
    expect(body.backendStatus).toBe(502);
  });

  it("embeds correlationId in the body", async () => {
    const res = backendHttpErrorResponse("Error", 400, "Fallback", ctx);
    const body = await bodyOf(res);
    expect(body.correlationId).toBe("cid-http");
  });

  it("calls console.error exactly once", () => {
    backendHttpErrorResponse("Error", 503, "Fallback", ctx);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("includes route label and status in the log output", () => {
    backendHttpErrorResponse("Error", 404, "Fallback", {
      route: "GET /api/confessions/42",
      correlationId: "cid-log",
    });
    const [logged] = spy.mock.calls[0] as [string];
    expect(logged).toContain("[GET /api/confessions/42]");
    expect(logged).toContain("status=404");
    expect(logged).toContain("CID: cid-log");
  });

  it("works correctly with a 404 status", async () => {
    const res = backendHttpErrorResponse("Not found", 404, "Fallback", ctx);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.message).toBe("Not found");
    expect(body.backendStatus).toBe(404);
  });

  it("omits correlationId from body when ctx has no correlationId", async () => {
    const res = backendHttpErrorResponse("Error", 500, "Fallback", {
      route: "GET /api/test",
    });
    const body = await bodyOf(res);
    expect(body.correlationId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// backendUnreachableResponse
// ---------------------------------------------------------------------------

describe("backendUnreachableResponse", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = makeSpy();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  const ctx: ProxyErrorContext = {
    route: "GET /api/confessions",
    correlationId: "cid-unreach",
  };

  it("returns 503", () => {
    const res = backendUnreachableResponse(ctx, new Error("ECONNREFUSED"));
    expect(res.status).toBe(503);
  });

  it("returns a human-readable unavailability message", async () => {
    const res = backendUnreachableResponse(ctx, new Error("timeout"));
    const body = await bodyOf(res);
    expect(body.message).toMatch(/unavailable/i);
  });

  it("includes correlationId in the body", async () => {
    const res = backendUnreachableResponse(ctx, new Error("timeout"));
    const body = await bodyOf(res);
    expect(body.correlationId).toBe("cid-unreach");
  });

  it("does not include backendStatus (no response was received)", async () => {
    const res = backendUnreachableResponse(ctx, new Error("timeout"));
    const body = await bodyOf(res);
    expect(body.backendStatus).toBeUndefined();
  });

  it("calls console.error exactly once", () => {
    backendUnreachableResponse(ctx, new Error("fail"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes the cause as a second argument to console.error", () => {
    const cause = new Error("ECONNREFUSED");
    backendUnreachableResponse(ctx, cause);
    expect(spy).toHaveBeenCalledWith(expect.any(String), cause);
  });

  it("includes the route label in the log", () => {
    backendUnreachableResponse(ctx, new Error("DNS fail"));
    const [logged] = spy.mock.calls[0] as [string];
    expect(logged).toContain("[GET /api/confessions]");
  });

  it("handles a non-Error cause (string)", () => {
    expect(() =>
      backendUnreachableResponse(ctx, "connection timed out"),
    ).not.toThrow();
  });

  it("handles an undefined cause gracefully", () => {
    expect(() => backendUnreachableResponse(ctx, undefined)).not.toThrow();
  });

  it("sets Content-Type: application/json", () => {
    const res = backendUnreachableResponse(ctx, new Error("fail"));
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// internalProxyErrorResponse
// ---------------------------------------------------------------------------

describe("internalProxyErrorResponse", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = makeSpy();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  const ctx: ProxyErrorContext = {
    route: "POST /api/confessions",
    correlationId: "cid-internal",
  };

  it("returns 500", () => {
    const res = internalProxyErrorResponse(ctx, new Error("crash"));
    expect(res.status).toBe(500);
  });

  it("uses the Error message when cause is an Error", async () => {
    const res = internalProxyErrorResponse(ctx, new Error("Unexpected crash"));
    const body = await bodyOf(res);
    expect(body.message).toBe("Unexpected crash");
  });

  it('returns "Internal server error" for non-Error cause', async () => {
    const res = internalProxyErrorResponse(ctx, "some string");
    const body = await bodyOf(res);
    expect(body.message).toBe("Internal server error");
  });

  it('returns "Internal server error" for null cause', async () => {
    const res = internalProxyErrorResponse(ctx, null);
    const body = await bodyOf(res);
    expect(body.message).toBe("Internal server error");
  });

  it('returns "Internal server error" for numeric cause', async () => {
    const res = internalProxyErrorResponse(ctx, 42);
    const body = await bodyOf(res);
    expect(body.message).toBe("Internal server error");
  });

  it("includes correlationId in the body", async () => {
    const res = internalProxyErrorResponse(ctx, new Error("boom"));
    const body = await bodyOf(res);
    expect(body.correlationId).toBe("cid-internal");
  });

  it("does not include backendStatus", async () => {
    const res = internalProxyErrorResponse(ctx, new Error("boom"));
    const body = await bodyOf(res);
    expect(body.backendStatus).toBeUndefined();
  });

  it("calls console.error exactly once", () => {
    internalProxyErrorResponse(ctx, new Error("boom"));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes the cause as second argument to console.error", () => {
    const cause = new Error("raw cause");
    internalProxyErrorResponse(ctx, cause);
    expect(spy).toHaveBeenCalledWith(expect.any(String), cause);
  });

  it("includes route label in the log", () => {
    internalProxyErrorResponse(ctx, new Error("oops"));
    const [logged] = spy.mock.calls[0] as [string];
    expect(logged).toContain("[POST /api/confessions]");
  });

  it("sets Content-Type: application/json", () => {
    const res = internalProxyErrorResponse(ctx, new Error("oops"));
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("omits correlationId from body when ctx has sentinel value", async () => {
    const res = internalProxyErrorResponse(
      { route: "GET /api/test", correlationId: "unknown" },
      new Error("boom"),
    );
    const body = await bodyOf(res);
    expect(body.correlationId).toBeUndefined();
  });
});
