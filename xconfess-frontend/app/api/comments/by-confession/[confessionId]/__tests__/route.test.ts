import { GET } from "../route";

const mockFetch = jest.fn();
const originalNextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;

describe("GET /api/comments/by-confession/[confessionId]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    if (originalNextPublicApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalNextPublicApiUrl;
    }
  });

  it("normalizes backend data payloads and preserves backend hasMore", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 7,
              content: "Persisted comment",
              createdAt: "2026-06-18T00:00:00.000Z",
              confessionId: "confession-1",
              parentId: null,
            },
          ],
          hasMore: true,
          nextCursor: "cursor-2",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/comments/by-confession/confession-1?page=1&limit=1",
      ),
      { params: Promise.resolve({ confessionId: "confession-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/comments/by-confession/confession-1?page=1&limit=1"),
      expect.objectContaining({ method: "GET" }),
    );

    await expect(response.json()).resolves.toEqual({
      comments: [
        {
          id: 7,
          content: "Persisted comment",
          createdAt: "2026-06-18T00:00:00.000Z",
          author: "Anonymous",
          confessionId: "confession-1",
          parentId: null,
          replies: [],
        },
      ],
      hasMore: true,
      nextCursor: "cursor-2",
    });
  });

  it("falls back to limit-based hasMore for legacy backend arrays", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 8,
            content: "Legacy comment",
            createdAt: "2026-06-18T00:00:00.000Z",
            parentId: null,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/comments/by-confession/confession-1?page=1&limit=1",
      ),
      { params: Promise.resolve({ confessionId: "confession-1" }) },
    );

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ hasMore: true }),
    );
  });

  it("rejects a self-referential Vercel backend URL before fetching", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    process.env.NEXT_PUBLIC_API_URL = "https://xconfess.vercel.app/api";

    try {
      const response = await GET(
        new Request(
          "https://xconfess.vercel.app/api/comments/by-confession/confession-1",
        ),
        { params: Promise.resolve({ confessionId: "confession-1" }) },
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.message).toMatch(/BACKEND_API_URL points to the frontend/);
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
