import { AppError } from "@/app/lib/utils/errorHandler";
import {
  MAX_READ_RETRIES,
  isRetryableReadError,
  readRetryDelay,
  shouldRetryRead,
} from "@/app/lib/api/readRetry";

describe("read retry policy", () => {
  it("retries offline / network failures", () => {
    expect(isRetryableReadError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableReadError(new Error("NETWORK_FAILURE"))).toBe(true);
  });

  it("does not retry permanent client errors or cancellations", () => {
    expect(isRetryableReadError(new Error("NOT_FOUND"))).toBe(false);
    expect(isRetryableReadError(new DOMException("x", "AbortError"))).toBe(false);
    expect(isRetryableReadError(new AppError("bad", "BAD_REQUEST", 400))).toBe(false);
    expect(isRetryableReadError(new AppError("nope", "FORBIDDEN", 403))).toBe(false);
  });

  it("retries 5xx, 408 and 429", () => {
    expect(isRetryableReadError(new AppError("down", "SERVER_ERROR", 503))).toBe(true);
    expect(isRetryableReadError(new AppError("slow", "TIMEOUT", 408))).toBe(true);
    expect(isRetryableReadError(new AppError("busy", "RATE_LIMIT", 429))).toBe(true);
  });

  it("stops after the retry budget (permanent failure)", () => {
    const err = new TypeError("Failed to fetch");
    expect(shouldRetryRead(0, err)).toBe(true);
    expect(shouldRetryRead(MAX_READ_RETRIES - 1, err)).toBe(true);
    expect(shouldRetryRead(MAX_READ_RETRIES, err)).toBe(false);
  });

  it("uses capped exponential backoff", () => {
    expect(readRetryDelay(0)).toBe(500);
    expect(readRetryDelay(1)).toBe(1000);
    expect(readRetryDelay(2)).toBe(2000);
    expect(readRetryDelay(10)).toBe(8000);
  });
});
