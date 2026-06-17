import { buildBackendSearchParams } from "../searchParams";

describe("buildBackendSearchParams", () => {
  it("serializes frontend search filters to backend SearchConfessionDto fields", () => {
    const params = buildBackendSearchParams(
      new URLSearchParams({
        q: "  stellar demo  ",
        page: "2",
        limit: "25",
        sort: "reactions",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-02-01T00:00:00.000Z",
        minReactions: "5",
        gender: "other",
      }),
    );

    expect(params.toString()).toBe(
      "page=2&limit=25&q=stellar+demo&sortBy=reactions&startDate=2026-01-01T00%3A00%3A00.000Z&endDate=2026-02-01T00%3A00%3A00.000Z&minReactions=5&gender=other",
    );
  });

  it("accepts legacy query while still sending backend q", () => {
    const params = buildBackendSearchParams(
      new URLSearchParams({
        query: "wallet",
        sort: "newest",
      }),
    );

    expect(params.get("q")).toBe("wallet");
    expect(params.get("sortBy")).toBe("date");
    expect(params.has("query")).toBe(false);
    expect(params.has("sort")).toBe(false);
  });

  it("bounds pagination to backend limits", () => {
    const params = buildBackendSearchParams(
      new URLSearchParams({
        page: "-3",
        limit: "999",
      }),
    );

    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("50");
  });
});
