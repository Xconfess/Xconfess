import {
  logSearchError,
  detectStaleResponse,
  validateSearchResponse,
} from "../searchErrorHandler";

// Mock the errorHandler module
jest.mock("../errorHandler", () => ({
  logError: jest.fn(),
}));

import { logError } from "../errorHandler";

describe("searchErrorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("logSearchError", () => {
    it("logs error without exposing raw search terms", () => {
      const error = new Error("Search failed");
      const context = {
        attempt: 1,
        phase: "network" as const,
        queryLength: 15,
        hasFilters: true,
      };

      logSearchError(error, context);

      expect(logError).toHaveBeenCalledWith(
        error,
        "useSearch",
        expect.objectContaining({
          attempt: 1,
          phase: "network",
          queryLength: "15_chars",
          hasFilters: true,
        })
      );
    });

    it("sanitizes query length in error context", () => {
      const error = new Error("Search failed");
      const context = {
        attempt: 2,
        phase: "parse" as const,
        queryLength: 25,
      };

      logSearchError(error, context);

      const callArgs = (logError as jest.Mock).mock.calls[0][2];
      expect(callArgs.queryLength).toBe("25_chars");
      expect(typeof callArgs.queryLength).toBe("string");
    });

    it("excludes query length when not provided", () => {
      const error = new Error("Search failed");
      const context = {
        attempt: 1,
        phase: "network" as const,
      };

      logSearchError(error, context);

      const callArgs = (logError as jest.Mock).mock.calls[0][2];
      expect(callArgs.queryLength).toBeUndefined();
    });

    it("includes http status in error context", () => {
      const error = new Error("Server error");
      const context = {
        httpStatus: 500,
        attempt: 1,
        phase: "network" as const,
      };

      logSearchError(error, context);

      const callArgs = (logError as jest.Mock).mock.calls[0][2];
      expect(callArgs.httpStatus).toBe(500);
    });

    it("includes retry information in error context", () => {
      const error = new Error("Rate limited");
      const context = {
        attempt: 1,
        phase: "network" as const,
        willRetry: true,
      };

      logSearchError(error, context);

      const callArgs = (logError as jest.Mock).mock.calls[0][2];
      expect(callArgs.willRetry).toBe(true);
    });

    it("does not expose raw search query", () => {
      const error = new Error("Search failed");
      const context = {
        attempt: 1,
        phase: "network" as const,
        queryLength: 42,
      };

      logSearchError(error, context);

      const callArgs = (logError as jest.Mock).mock.calls[0][2];
      expect(JSON.stringify(callArgs)).not.toContain("sensitive");
      expect(JSON.stringify(callArgs)).not.toContain("private");
    });
  });

  describe("detectStaleResponse", () => {
    it("detects stale response when older than current sequence", () => {
      const isStale = detectStaleResponse(5, 3);
      expect(isStale).toBe(true);
    });

    it("detects current response as not stale", () => {
      const isStale = detectStaleResponse(5, 5);
      expect(isStale).toBe(false);
    });

    it("detects newer response as not stale", () => {
      const isStale = detectStaleResponse(5, 7);
      expect(isStale).toBe(false);
    });

    it("handles sequence number 0", () => {
      const isStale = detectStaleResponse(0, 1);
      expect(isStale).toBe(false);
    });

    it("handles equal sequence numbers", () => {
      const isStale = detectStaleResponse(10, 10);
      expect(isStale).toBe(false);
    });

    it("handles large sequence numbers", () => {
      const isStale = detectStaleResponse(1000000, 999999);
      expect(isStale).toBe(true);
    });
  });

  describe("validateSearchResponse", () => {
    it("validates correct search response", () => {
      const response = {
        confessions: [{ id: "1" }],
        total: 1,
        hasMore: false,
      };

      expect(validateSearchResponse(response)).toBe(true);
    });

    it("rejects response without confessions array", () => {
      const response = {
        total: 1,
        hasMore: false,
      };

      expect(validateSearchResponse(response)).toBe(false);
    });

    it("rejects null response", () => {
      expect(validateSearchResponse(null)).toBe(false);
    });

    it("rejects undefined response", () => {
      expect(validateSearchResponse(undefined)).toBe(false);
    });

    it("rejects non-object response", () => {
      expect(validateSearchResponse("not an object")).toBe(false);
    });

    it("rejects response with non-array confessions", () => {
      const response = {
        confessions: "not an array",
        total: 1,
      };

      expect(validateSearchResponse(response)).toBe(false);
    });

    it("validates response with empty confessions array", () => {
      const response = {
        confessions: [],
        total: 0,
        hasMore: false,
      };

      expect(validateSearchResponse(response)).toBe(true);
    });

    it("validates response with additional properties", () => {
      const response = {
        confessions: [{ id: "1" }],
        total: 1,
        hasMore: false,
        statusMeta: {
          partial: false,
          degraded: false,
        },
      };

      expect(validateSearchResponse(response)).toBe(true);
    });

    it("validates response with metadata", () => {
      const response = {
        confessions: [{ id: "1" }],
        total: 1,
        hasMore: false,
        message: "Using fallback search",
        warnings: ["No exact matches"],
      };

      expect(validateSearchResponse(response)).toBe(true);
    });
  });
});
