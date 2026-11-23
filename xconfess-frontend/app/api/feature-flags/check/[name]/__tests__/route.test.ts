import { GET } from "../route";

const mockFetch = jest.fn();
const originalNextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((data, init) => {
      return new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  },
}));

describe("GET /api/feature-flags/check/[name]", () => {
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

  it("does not proxy to the Vercel frontend host when the backend URL self-references", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://xconfess.vercel.app/api";

    const response = await GET(
      new Request(
        "https://xconfess.vercel.app/api/feature-flags/check/new-feed",
      ) as any,
      { params: Promise.resolve({ name: "new-feed" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ enabled: false, override: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
