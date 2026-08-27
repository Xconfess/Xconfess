import { NextResponse } from "next/server";
import axios from "axios";
import { getApiBaseUrl } from "@/app/lib/config";
import { createApiErrorResponse } from "@/lib/apiErrorHandler";

// Do NOT resolve this at module scope. `next build` imports every route
// module during "Collecting page data" to read static config, with no
// request in flight and no guarantee runtime env vars are present. A
// throw here (e.g. "BACKEND_API_URL is required...") kills the entire
// production build instead of failing a real request at runtime.
// Resolve it lazily, once per request, inside the handler.

type ComparisonAvailability = "available" | "estimated" | "unavailable";
type DeltaDirection = "up" | "down" | "flat" | "unknown";

interface MetricDelta {
  percentage: number | null;
  direction: DeltaDirection;
  availability: ComparisonAvailability;
  note?: string;
}

interface ActivityPoint {
  date: string;
  confessions: number;
  users: number;
  reactions: number;
  previousConfessions?: number | null;
  previousReactions?: number | null;
  confessionsDeltaPct?: number | null;
  reactionsDeltaPct?: number | null;
}

interface AnalyticsResponsePayload {
  requestId: string;
  metrics: {
    totalConfessions: number;
    totalUsers: number;
    totalReactions: number;
    activeUsers: number;
    confessionsChange?: number;
    usersChange?: number;
    reactionsChange?: number;
    activeChange?: number;
    confessionsDelta: MetricDelta;
    usersDelta: MetricDelta;
    reactionsDelta: MetricDelta;
    activeDelta: MetricDelta;
    errors?: Record<string, string>;
  };
  trendingConfessions: Array<{
    id: string;
    message: string;
    category: string;
    reactions: { like: number };
    viewCount: number;
    createdAt: string;
  }>;
  reactionDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  activityData: ActivityPoint[];
  comparison: {
    enabled: boolean;
    availability: ComparisonAvailability;
    source: "backend" | "estimated" | "none";
    note?: string;
  };
}

function firstDefined<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const normalized = value.trim().replace("%", "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toDirection(value: number | null): DeltaDirection {
  if (value === null) return "unknown";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function createDelta(
  percentage: number | null,
  availability: ComparisonAvailability,
  note?: string,
): MetricDelta {
  return {
    percentage,
    direction: toDirection(percentage),
    availability,
    note,
  };
}

function normalizeDeltaCandidate(
  candidate: unknown,
  fallbackNote: string,
): MetricDelta {
  if (typeof candidate === "number" || typeof candidate === "string") {
    const percentage = parseNumber(candidate);
    if (percentage !== null) {
      return createDelta(percentage, "available");
    }
  }

  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const record = candidate as Record<string, unknown>;
    const percentage = parseNumber(
      firstDefined(
        record.deltaPercent,
        record.deltaPct,
        record.percentage,
        record.change,
        record.value,
      ),
    );

    const estimated = Boolean(
      firstDefined(
        record.estimated,
        record.isEstimated,
        record.status === "estimated",
      ),
    );
    const explicitlyUnavailable =
      firstDefined(record.available, record.hasData) === false;
    const note =
      typeof firstDefined(record.note, record.reason, record.message) ===
      "string"
        ? String(firstDefined(record.note, record.reason, record.message))
        : undefined;

    if (percentage !== null) {
      return createDelta(
        percentage,
        estimated ? "estimated" : "available",
        note,
      );
    }

    if (explicitlyUnavailable) {
      return createDelta(null, "unavailable", note ?? fallbackNote);
    }
  }

  return createDelta(null, "unavailable", fallbackNote);
}

function normalizeDateKey(rawDate: unknown): string | null {
  if (typeof rawDate !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

function calculateDeltaPercentage(
  current: number,
  previous: number,
): number | null {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous <= 0
  ) {
    return null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildTrailingComparisonDelta(
  series: number[],
  windowSize: number,
  mode: "sum" | "average",
): number | null {
  if (series.length < windowSize * 2) {
    return null;
  }
  const previousWindow = series.slice(-windowSize * 2, -windowSize);
  const currentWindow = series.slice(-windowSize);
  const currentValue =
    mode === "sum"
      ? currentWindow.reduce((sum, value) => sum + value, 0)
      : average(currentWindow);
  const previousValue =
    mode === "sum"
      ? previousWindow.reduce((sum, value) => sum + value, 0)
      : average(previousWindow);
  return calculateDeltaPercentage(currentValue, previousValue);
}

function buildSeriesFromRows(
  rows: unknown,
  valueKey: string,
): Array<{ date: string; value: number }> {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const date = normalizeDateKey(record.date);
      const value = parseNumber(record[valueKey]);
      if (!date || value === null) return null;
      return { date, value };
    })
    .filter((row): row is { date: string; value: number } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function seriesValues(rows: Array<{ date: string; value: number }>): number[] {
  return rows.map((row) => row.value);
}

export async function GET(request: Request) {
  const BACKEND_URL = getApiBaseUrl();
  const requestId = Math.random().toString(36).substring(7);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "7d";
  const compareMode = searchParams.get("compare") || "none";
  const comparisonEnabled =
    compareMode === "true" || compareMode === "1" || compareMode === "previous";
  const days = period === "30d" ? 30 : 7;

  const authHeader = request.headers.get("authorization");

  try {
    const headers = authHeader ? { Authorization: authHeader } : {};

    const [
      statsRes,
      trendingRes,
      reactionsRes,
      usersRes,
      growthRes,
      trailingComparison,
    ] = await Promise.allSettled([
      axios.get(`${BACKEND_URL}/analytics/stats`, { headers }),
      axios.get(`${BACKEND_URL}/analytics/trending?days=${days}`, { headers }),
      axios.get(`${BACKEND_URL}/analytics/reactions?days=${days}`, { headers }),
      axios.get(`${BACKEND_URL}/analytics/users?days=${days}`, { headers }),
      axios.get(`${BACKEND_URL}/analytics/growth?days=${days}`, { headers }),
      comparisonEnabled && days === 7
        ? Promise.all([
            axios.get(`${BACKEND_URL}/analytics/users?days=30`, { headers }),
            axios.get(`${BACKEND_URL}/analytics/growth?days=30`, { headers }),
          ]).catch(() => null)
        : Promise.resolve(null),
    ]);

    const panelErrors: Record<string, string> = {};

    const stats =
      statsRes.status === "fulfilled"
        ? statsRes.value.data
        : ((panelErrors.stats = "Failed to load stats"), {});
    const trending =
      trendingRes.status === "fulfilled"
        ? trendingRes.value.data
        : ((panelErrors.trending = "Failed to load trending"), []);
    const reactions =
      reactionsRes.status === "fulfilled"
        ? reactionsRes.value.data
        : ((panelErrors.reactions = "Failed to load reactions"), {});
    const users =
      usersRes.status === "fulfilled"
        ? usersRes.value.data
        : ((panelErrors.users = "Failed to load users"), {});
    const growth =
      growthRes.status === "fulfilled"
        ? growthRes.value.data
        : ((panelErrors.growth = "Failed to load growth"), {});

    const resolvedTrailing =
      trailingComparison.status === "fulfilled"
        ? trailingComparison.value
        : null;

    const backendConfessionsDelta = normalizeDeltaCandidate(
      firstDefined(
        stats?.comparison?.totalConfessions,
        stats?.comparison?.confessions,
        stats?.deltas?.totalConfessions,
        growth?.comparison?.totalConfessions,
        growth?.comparison?.confessions,
        stats?.confessionsChange,
      ),
      "Comparison data is not available for confessions.",
    );

    const backendUsersDelta = normalizeDeltaCandidate(
      firstDefined(
        stats?.comparison?.totalUsers,
        stats?.comparison?.users,
        stats?.deltas?.totalUsers,
        users?.comparison?.totalUsers,
        stats?.usersChange,
      ),
      "Comparison data is not available for users.",
    );

    const backendReactionsDelta = normalizeDeltaCandidate(
      firstDefined(
        stats?.comparison?.totalReactions,
        stats?.comparison?.reactions,
        stats?.deltas?.totalReactions,
        reactions?.comparison?.totalReactions,
        reactions?.comparison?.reactions,
        stats?.reactionsChange,
      ),
      "Comparison data is not available for reactions.",
    );

    const backendActiveDelta = normalizeDeltaCandidate(
      firstDefined(
        stats?.comparison?.activeUsers,
        stats?.comparison?.active,
        users?.comparison?.activeUsers,
        users?.comparison?.averageDAU,
        stats?.activeChange,
      ),
      "Comparison data is not available for active users.",
    );

    const metrics = {
      totalConfessions: stats.totalConfessions || 0,
      totalUsers: stats.totalUsers || 0,
      totalReactions: stats.totalReactions || 0,
      activeUsers: Math.round(users.averageDAU || 0),
      confessionsDelta: comparisonEnabled
        ? backendConfessionsDelta
        : createDelta(null, "unavailable", "Comparison mode is disabled."),
      usersDelta: comparisonEnabled
        ? backendUsersDelta
        : createDelta(null, "unavailable", "Comparison mode is disabled."),
      reactionsDelta: comparisonEnabled
        ? backendReactionsDelta
        : createDelta(null, "unavailable", "Comparison mode is disabled."),
      activeDelta: comparisonEnabled
        ? backendActiveDelta
        : createDelta(null, "unavailable", "Comparison mode is disabled."),
      confessionsChange: comparisonEnabled
        ? (backendConfessionsDelta.percentage ?? undefined)
        : undefined,
      usersChange: comparisonEnabled
        ? (backendUsersDelta.percentage ?? undefined)
        : undefined,
      reactionsChange: comparisonEnabled
        ? (backendReactionsDelta.percentage ?? undefined)
        : undefined,
      activeChange: comparisonEnabled
        ? (backendActiveDelta.percentage ?? undefined)
        : undefined,
      errors: Object.keys(panelErrors).length > 0 ? panelErrors : undefined,
    };

    const trendingConfessions = (Array.isArray(trending) ? trending : []).map(
      (item: any) => ({
        id: item.id,
        message: item.content,
        category: item.category || "General",
        reactions: { like: item.reactionCount || 0 },
        viewCount: 0,
        createdAt: item.createdAt,
      }),
    );

    const reactionDistribution = (
      Array.isArray(reactions?.distribution) ? reactions.distribution : []
    ).map((item: any) => {
      const colors: Record<string, string> = {
        like: "#3b82f6",
        love: "#ef4444",
        funny: "#f59e0b",
        wow: "#8b5cf6",
        sad: "#6b7280",
        support: "#10b981",
      };
      return {
        name: item.type
          ? item.type.charAt(0).toUpperCase() + item.type.slice(1)
          : "Unknown",
        value: item.count || 0,
        color: colors[item.type?.toLowerCase()] || "#94a3b8",
      };
    });

    const activityMap: Record<string, ActivityPoint> = {};

    if (Array.isArray(growth?.dailyGrowth)) {
      growth.dailyGrowth.forEach((item: any) => {
        const date = normalizeDateKey(item.date);
        if (!date) return;
        activityMap[date] = {
          date,
          confessions: item.count || 0,
          users: 0,
          reactions: 0,
        };
      });
    }

    if (Array.isArray(users?.dailyActivity)) {
      users.dailyActivity.forEach((item: any) => {
        const date = normalizeDateKey(item.date);
        if (!date) return;
        if (!activityMap[date]) {
          activityMap[date] = { date, confessions: 0, users: 0, reactions: 0 };
        }
        activityMap[date].users = item.activeUsers || 0;
        activityMap[date].reactions = Math.floor((item.activeUsers || 0) * 2.5);
      });
    }

    const activityData = Object.values(activityMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    if (
      comparisonEnabled &&
      metrics.confessionsDelta.availability === "unavailable" &&
      resolvedTrailing
    ) {
      const [usersTrailingRes, growthTrailingRes] = resolvedTrailing;
      const trailingUserSeries = buildSeriesFromRows(
        usersTrailingRes?.data?.dailyActivity,
        "activeUsers",
      );
      const trailingConfessionSeries = buildSeriesFromRows(
        growthTrailingRes?.data?.dailyGrowth,
        "count",
      );

      const estimatedConfessionsDelta = buildTrailingComparisonDelta(
        seriesValues(trailingConfessionSeries),
        7,
        "sum",
      );
      const estimatedActiveDelta = buildTrailingComparisonDelta(
        seriesValues(trailingUserSeries),
        7,
        "average",
      );

      if (estimatedConfessionsDelta !== null) {
        metrics.confessionsDelta = createDelta(
          estimatedConfessionsDelta,
          "estimated",
          "Estimated from trailing 14-day trend.",
        );
        metrics.confessionsChange = estimatedConfessionsDelta;
      }

      if (
        metrics.activeDelta.availability === "unavailable" &&
        estimatedActiveDelta !== null
      ) {
        metrics.activeDelta = createDelta(
          estimatedActiveDelta,
          "estimated",
          "Estimated from trailing 14-day activity trend.",
        );
        metrics.activeChange = estimatedActiveDelta;
      }

      if (
        metrics.reactionsDelta.availability === "unavailable" &&
        estimatedActiveDelta !== null
      ) {
        metrics.reactionsDelta = createDelta(
          estimatedActiveDelta,
          "estimated",
          "Estimated from active-user trend.",
        );
        metrics.reactionsChange = estimatedActiveDelta;
      }
    }

    const availabilityValues = comparisonEnabled
      ? [
          metrics.confessionsDelta.availability,
          metrics.usersDelta.availability,
          metrics.reactionsDelta.availability,
          metrics.activeDelta.availability,
        ]
      : [];
    const hasAvailable = availabilityValues.includes("available");
    const hasEstimated = availabilityValues.includes("estimated");

    const comparison: AnalyticsResponsePayload["comparison"] = comparisonEnabled
      ? hasAvailable
        ? {
            enabled: true,
            availability: "available",
            source: "backend",
            note: "Period-over-period deltas are sourced from backend comparison payloads.",
          }
        : hasEstimated
          ? {
              enabled: true,
              availability: "estimated",
              source: "estimated",
              note: "Some deltas are estimated.",
            }
          : {
              enabled: true,
              availability: "unavailable",
              source: "none",
              note: "Comparison data is unavailable.",
            }
      : {
          enabled: false,
          availability: "unavailable",
          source: "none",
          note: "Turn on comparison mode.",
        };

    const payload: AnalyticsResponsePayload = {
      requestId,
      metrics,
      trendingConfessions,
      reactionDistribution,
      activityData,
      comparison,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    return createApiErrorResponse(error, {
      status: error?.response?.status || 500,
      fallbackMessage: "Failed to fetch real-time analytics",
      route: "GET /api/analytics",
    });
  }
}
