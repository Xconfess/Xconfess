import { POST } from "../route";

const mockFetch = jest.fn();

// Mock crypto.subtle.digest for idempotency key generation
const mockDigest = jest.fn().mockResolvedValue(
  new Uint8Array([0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
    0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
    0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
    0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89]),
);
Object.defineProperty(globalThis, "crypto", {
  value: { subtle: { digest: mockDigest } },
  writable: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
});

describe("POST /api/comments/[confessionId]", () => {
  it("forwards cookie auth, bearer auth, and correlation id to the backend", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 42,
          content: "A live backend comment",
          createdAt: "2026-06-18T00:00:00.000Z",
          confessionId: "confession-1",
          parentId: null,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const request = new Request("http://localhost/api/comments/confession-1", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-1",
        Cookie: "session=secure-cookie",
        "X-Correlation-ID": "cid-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: "A live backend comment",
        anonymousContextId: "anon-1",
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ confessionId: "confession-1" }),
    });

    expect(response.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/comments/confession-1"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          Cookie: "session=secure-cookie",
          "x-request-id": "cid-1",
          "Content-Type": "application/json",
        }),
      }),
    );

    // Verify the body includes idempotencyKey
    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.content).toBe("A live backend comment");
    expect(sentBody.anonymousContextId).toBe("anon-1");
    expect(sentBody.idempotencyKey).toBeDefined();
    expect(typeof sentBody.idempotencyKey).toBe("string");
    expect(sentBody.idempotencyKey.length).toBe(64); // SHA-256 hex string

    await expect(response.json()).resolves.toEqual({
      id: 42,
      content: "A live backend comment",
      createdAt: "2026-06-18T00:00:00.000Z",
      author: "Anonymous",
      confessionId: "confession-1",
      parentId: null,
    });
  });

  it("returns a 400 without calling the backend when content is empty", async () => {
    const request = new Request("http://localhost/api/comments/confession-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ confessionId: "confession-1" }),
    });

    expect(response.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("generates deterministic idempotency keys for identical requests", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 1, content: "test", createdAt: "2026-01-01T00:00:00Z" }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    const makeRequest = () =>
      new Request("http://localhost/api/comments/c1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "same", anonymousContextId: "ctx" }),
      });

    await POST(makeRequest(), { params: Promise.resolve({ confessionId: "c1" }) });
    await POST(makeRequest(), { params: Promise.resolve({ confessionId: "c1" }) });

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body1.idempotencyKey).toBe(body2.idempotencyKey);
  });
});