import { POST } from "../route";

const mockFetch = jest.fn();

describe("POST /api/comments/[confessionId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

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
          "X-Correlation-ID": "cid-1",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          content: "A live backend comment",
          anonymousContextId: "anon-1",
        }),
      }),
    );

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
});
