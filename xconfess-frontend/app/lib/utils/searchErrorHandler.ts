import { logError } from "@/app/lib/utils/errorHandler";

interface SearchErrorContext {
  attempt?: number;
  phase?: "network" | "parse" | "abort";
  httpStatus?: number;
  willRetry?: boolean;
  queryLength?: number;
  hasFilters?: boolean;
}

export function logSearchError(
  error: unknown,
  context: SearchErrorContext
) {
  const { queryLength, hasFilters, ...safeContext } = context;

  const sanitizedContext = {
    ...safeContext,
    queryLength: queryLength ? `${queryLength}_chars` : undefined,
    hasFilters,
  };

  logError(error, "useSearch", sanitizedContext);
}

export function detectStaleResponse(
  currentSequence: number,
  responseSequence: number
): boolean {
  return responseSequence < currentSequence;
}

export function validateSearchResponse(
  data: unknown
): data is Record<string, unknown> {
  if (!data || typeof data !== "object") return false;
  if (!("confessions" in data)) return false;
  return Array.isArray((data as Record<string, unknown>).confessions);
}
