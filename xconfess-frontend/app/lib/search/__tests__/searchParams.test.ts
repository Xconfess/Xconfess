import {
  buildBackendSearchParams,
  buildSearchProxyParams,
} from "@/app/lib/search/searchParams";
import type { SearchFilters } from "@/app/lib/types/search";

describe("search parameter serialization", () => {
  it("serializes frontend filters for the local search proxy", () => {
    const filters: SearchFilters = {
      sort: "reactions",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-20",
      minReactions: 5,
      gender: "other",
    };

    const params = buildSearchProxyParams({
      query: "  work stress  ",
      filters,
      page: 2,
      limit: 10,
    });

    expect(params.toString()).toBe(
      "page=2&limit=10&sort=reactions&q=work+stress&dateFrom=2026-06-01&dateTo=2026-06-20&minReactions=5&gender=other",
    );
  });

  it("maps proxy params to backend SearchConfessionDto field names", () => {
    const incoming = new URLSearchParams({
      query: "legacy term",
      page: "0",
      limit: "100",
      sort: "newest",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-20",
      minReactions: "5",
      gender: "female",
    });

    const params = buildBackendSearchParams(incoming);

    expect(params.get("q")).toBe("legacy term");
    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("50");
    expect(params.get("sortBy")).toBe("date");
    expect(params.get("startDate")).toBe("2026-06-01");
    expect(params.get("endDate")).toBe("2026-06-20");
    expect(params.get("minReactions")).toBe("5");
    expect(params.get("gender")).toBe("female");
    expect(params.has("query")).toBe(false);
    expect(params.has("sort")).toBe(false);
    expect(params.has("dateFrom")).toBe(false);
    expect(params.has("dateTo")).toBe(false);
  });
});
