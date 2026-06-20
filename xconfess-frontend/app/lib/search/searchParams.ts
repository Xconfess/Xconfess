import type { SearchFilters } from "@/app/lib/types/search";

type SearchSortBy = "relevance" | "reactions" | "date" | "views";

interface SearchProxyParamOptions {
  query: string;
  filters: SearchFilters;
  page: number;
  limit: number;
}

function clampInteger(
  value: string | number | null,
  fallback: number,
  max?: number,
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(value ?? String(fallback), 10);
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return max ? Math.min(safeValue, max) : safeValue;
}

function frontendSortToBackendSortBy(
  sort: SearchFilters["sort"],
): SearchSortBy {
  if (sort === "reactions") return "reactions";
  if (sort === "newest" || sort === "oldest") return "date";
  return "relevance";
}

function setIfPresent(
  params: URLSearchParams,
  key: string,
  value?: string | null,
) {
  if (value != null && value !== "") {
    params.set(key, value);
  }
}

export function buildSearchProxyParams({
  query,
  filters,
  page,
  limit,
}: SearchProxyParamOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(clampInteger(page, 1)));
  params.set("limit", String(clampInteger(limit, 10, 50)));
  params.set("sort", filters.sort);

  const trimmedQuery = query.trim();
  if (trimmedQuery) params.set("q", trimmedQuery);
  setIfPresent(params, "dateFrom", filters.dateFrom);
  setIfPresent(params, "dateTo", filters.dateTo);
  if (filters.minReactions != null && filters.minReactions > 0) {
    params.set("minReactions", String(filters.minReactions));
  }
  setIfPresent(params, "gender", filters.gender);

  return params;
}

export function buildBackendSearchParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(clampInteger(searchParams.get("page"), 1)));
  params.set("limit", String(clampInteger(searchParams.get("limit"), 10, 50)));

  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  setIfPresent(params, "q", q.trim());

  const sort = (searchParams.get("sort") ?? "newest") as SearchFilters["sort"];
  params.set("sortBy", frontendSortToBackendSortBy(sort));

  setIfPresent(params, "startDate", searchParams.get("dateFrom"));
  setIfPresent(params, "endDate", searchParams.get("dateTo"));
  setIfPresent(params, "minReactions", searchParams.get("minReactions"));
  setIfPresent(params, "gender", searchParams.get("gender"));

  return params;
}
