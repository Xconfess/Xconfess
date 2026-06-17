const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parseBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max?: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const finite = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, max == null ? finite : Math.min(max, finite));
}

function mapSortToBackendSortBy(sort: string | null): string | null {
  switch (sort) {
    case "reactions":
      return "reactions";
    case "oldest":
    case "newest":
      return "date";
    default:
      return null;
  }
}

export function buildBackendSearchParams(
  searchParams: URLSearchParams,
): URLSearchParams {
  const page = parseBoundedInt(searchParams.get("page"), DEFAULT_PAGE, 1);
  const limit = parseBoundedInt(
    searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
  );
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  const sortBy = mapSortToBackendSortBy(searchParams.get("sort"));
  const startDate =
    searchParams.get("startDate") ?? searchParams.get("dateFrom");
  const endDate = searchParams.get("endDate") ?? searchParams.get("dateTo");
  const minReactions = searchParams.get("minReactions");
  const gender = searchParams.get("gender");

  const backendParams = new URLSearchParams();
  backendParams.set("page", String(page));
  backendParams.set("limit", String(limit));

  if (q.trim()) backendParams.set("q", q.trim());
  if (sortBy) backendParams.set("sortBy", sortBy);
  if (startDate) backendParams.set("startDate", startDate);
  if (endDate) backendParams.set("endDate", endDate);
  if (minReactions != null && minReactions !== "") {
    backendParams.set("minReactions", minReactions);
  }
  if (gender) backendParams.set("gender", gender);

  return backendParams;
}
