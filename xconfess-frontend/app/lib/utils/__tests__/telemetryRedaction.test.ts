import {
  REDACTED,
  isIdentityKey,
  redactTelemetryPayload,
  redactTelemetryString,
} from "../telemetryRedaction";
import { logError } from "../errorHandler";

const ANON_ID = "7c0d6f4e-5b1a-4c2d-9e8f-0a1b2c3d4e5f";

describe("telemetryRedaction", () => {
  describe("isIdentityKey", () => {
    it.each([
      "anonymousUserId",
      "anonymous_user_id",
      "x-anonymous-user-id",
      "anonymousContextId",
      "userId",
      "sessionId",
      "deviceId",
      "walletAddress",
      "email",
      "authorization",
    ])("treats %s as an identity key", (key) => {
      expect(isIdentityKey(key)).toBe(true);
    });

    it.each(["correlationId", "requestId", "status", "url", "retries", "confessionId"])(
      "keeps %s",
      (key) => {
        expect(isIdentityKey(key)).toBe(false);
      },
    );
  });

  describe("redactTelemetryString", () => {
    it("redacts identity path segments", () => {
      expect(redactTelemetryString(`/messages/keys/${ANON_ID}`)).toBe(
        `/messages/keys/${REDACTED}`,
      );
      expect(redactTelemetryString(`/api/users/12345/profile`)).toBe(
        `/api/users/${REDACTED}/profile`,
      );
      expect(redactTelemetryString(`/anonymous-users/${ANON_ID}?x=1`)).toBe(
        `/anonymous-users/${REDACTED}?x=1`,
      );
    });

    it("keeps non-identifier route words", () => {
      expect(redactTelemetryString("/api/users/register")).toBe("/api/users/register");
      expect(redactTelemetryString(`/api/confessions/${ANON_ID}/report`)).toBe(
        `/api/confessions/${ANON_ID}/report`,
      );
    });

    it("redacts identity query parameters only", () => {
      expect(
        redactTelemetryString(`/api/feed?anonymousUserId=${ANON_ID}&page=2&session_id=abc`),
      ).toBe(`/api/feed?anonymousUserId=${REDACTED}&page=2&session_id=${REDACTED}`);
    });

    it("redacts prefixed actor strings", () => {
      expect(redactTelemetryString(`failed for anon:${ANON_ID}`)).toBe(
        `failed for anon:${REDACTED}`,
      );
      expect(redactTelemetryString("user:42 not allowed")).toBe(`user:${REDACTED} not allowed`);
    });
  });

  describe("redactTelemetryPayload", () => {
    it("redacts nested identity keys and strings without mutating input", () => {
      const input = {
        context: "API Client - Request Failed",
        url: `/messages/keys/${ANON_ID}`,
        correlationId: "corr-1",
        nested: { anonymousUserId: ANON_ID, list: [`?userId=9`] },
      };

      const output = redactTelemetryPayload(input);

      expect(JSON.stringify(output)).not.toContain(ANON_ID);
      expect(output).toMatchObject({
        context: "API Client - Request Failed",
        url: `/messages/keys/${REDACTED}`,
        correlationId: "corr-1",
        nested: { anonymousUserId: REDACTED, list: [`?userId=${REDACTED}`] },
      });
      expect(input.nested.anonymousUserId).toBe(ANON_ID);
    });

    it("handles cycles and deep nesting safely", () => {
      const cyclic: Record<string, unknown> = { a: 1 };
      cyclic.self = cyclic;
      expect(() => redactTelemetryPayload(cyclic)).not.toThrow();
      expect(redactTelemetryPayload(cyclic).self).toBe("[truncated]");
    });
  });
});

describe("logError third-party beacon payload", () => {
  const originalUrl = process.env.NEXT_PUBLIC_ERROR_TRACKING_URL;
  let sendBeacon: jest.Mock;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ERROR_TRACKING_URL = "https://telemetry.example.test/collect";
    sendBeacon = jest.fn(() => true);
    Object.defineProperty(globalThis.navigator, "sendBeacon", {
      value: sendBeacon,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ERROR_TRACKING_URL = originalUrl;
  });

  it("never sends anonymous identity identifiers", () => {
    logError(new Error(`lookup failed for anon:${ANON_ID}`), "API Client - Request Failed", {
      url: `/messages/keys/${ANON_ID}`,
      anonymousUserId: ANON_ID,
      headers: { "x-anonymous-user-id": ANON_ID },
      correlationId: "corr-123",
      status: 500,
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [, body] = sendBeacon.mock.calls[0];
    expect(body).not.toContain(ANON_ID);
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({
      context: "API Client - Request Failed",
      url: `/messages/keys/${REDACTED}`,
      anonymousUserId: REDACTED,
      headers: { "x-anonymous-user-id": REDACTED },
      correlationId: "corr-123",
      status: 500,
    });
  });

  it("does not send anything when no tracking URL is configured", () => {
    delete process.env.NEXT_PUBLIC_ERROR_TRACKING_URL;
    logError(new Error("boom"), "ctx", { anonymousUserId: ANON_ID });
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
