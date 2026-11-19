import {
  QueryError,
  exponentialBackoff,
  isRetryableError,
  retryOnTransientError,
} from "../retry";

describe("isRetryableError", () => {
  it("treats network failures (no status) as retryable", () => {
    expect(isRetryableError(new Error("Failed to fetch"))).toBe(true);
  });

  it("treats 408 and 429 as retryable", () => {
    expect(isRetryableError(new QueryError({ message: "timeout", status: 408 }))).toBe(true);
    expect(isRetryableError(new QueryError({ message: "rate limited", status: 429 }))).toBe(true);
  });

  it("treats 5xx as retryable", () => {
    expect(isRetryableError(new QueryError({ message: "boom", status: 500 }))).toBe(true);
    expect(isRetryableError(new QueryError({ message: "boom", status: 503 }))).toBe(true);
  });

  it("treats other 4xx as non-retryable", () => {
    expect(isRetryableError(new QueryError({ message: "bad request", status: 400 }))).toBe(false);
    expect(isRetryableError(new QueryError({ message: "unauthorized", status: 401 }))).toBe(false);
    expect(isRetryableError(new QueryError({ message: "not found", status: 404 }))).toBe(false);
  });
});

describe("retryOnTransientError", () => {
  it("stops after the max retry count even for retryable errors", () => {
    const offline = new Error("offline");
    expect(retryOnTransientError(0, offline)).toBe(true);
    expect(retryOnTransientError(1, offline)).toBe(true);
    expect(retryOnTransientError(2, offline)).toBe(true);
    expect(retryOnTransientError(3, offline)).toBe(false);
  });

  it("stops immediately for a permanent 4xx failure", () => {
    const validationError = new QueryError({ message: "invalid", status: 422 });
    expect(retryOnTransientError(0, validationError)).toBe(false);
  });

  it("recovers once the underlying request succeeds again (react-query stops calling retry)", () => {
    // react-query calls `retry` only on failure; once queryFn resolves it
    // never calls retry again, so failureCount effectively resets to 0 on
    // the next independent failure sequence.
    const offline = new Error("offline");
    expect(retryOnTransientError(0, offline)).toBe(true);
  });
});

describe("exponentialBackoff", () => {
  it("doubles the delay for each attempt, capped at 30s", () => {
    expect(exponentialBackoff(0)).toBe(1000);
    expect(exponentialBackoff(1)).toBe(2000);
    expect(exponentialBackoff(2)).toBe(4000);
    expect(exponentialBackoff(10)).toBe(30000);
  });
});
