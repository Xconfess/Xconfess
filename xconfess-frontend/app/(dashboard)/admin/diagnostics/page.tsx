"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStellarDiagnostics } from "@/app/lib/api/stellar";
import { adminApi, SystemHealthResponse } from "@/app/lib/api/admin";
import { queryKeys } from "@/app/lib/api/queryKeys";
import type {
  StellarDiagnosticsResponse,
  HorizonStatus,
} from "@/app/lib/api/stellar";

function ConfigRow({
  label,
  value,
  mono,
  description,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  description?: string;
}) {
  return (
    <div className="flex flex-col py-4 border-b border-[var(--border)] last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
        <dt className="text-sm font-medium text-[var(--text-muted)] sm:w-48 shrink-0">
          {label}
        </dt>
        <dd
          className={`text-sm text-[var(--foreground)] break-all ${mono ? "font-mono text-xs text-teal-600 dark:text-teal-400" : ""}`}
        >
          {value || (
            <span className="text-[var(--warning)] italic bg-[var(--warning)]/10 px-2 py-0.5 rounded text-xs border border-[var(--warning)]/30">
              Not configured
            </span>
          )}
        </dd>
      </div>
      {description && (
        <p className="mt-1 text-xs text-[var(--text-muted)] max-w-2xl">
          {description}
        </p>
      )}
    </div>
  );
}

function ServiceStatusSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 w-full rounded-xl bg-[var(--surface-muted)]" />
      ))}
    </div>
  );
}

function ObservabilitySkeleton() {
  return (
    <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 animate-pulse">
      <div className="h-5 w-40 rounded bg-[var(--skeleton)] mb-4" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 w-full rounded-xl bg-[var(--surface-muted)]" />
        ))}
      </div>
    </div>
  );
}

function StellarSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-48 w-full rounded-xl bg-[var(--surface-muted)]" />
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<
  string,
  { badge: string; icon: string; label: string }
> = {
  up: {
    badge:
      "bg-[var(--success)]/10 text-[var(--foreground)] border border-[var(--success)]/30",
    icon: "●",
    label: "Healthy",
  },
  down: {
    badge:
      "bg-[var(--danger)]/10 text-[var(--foreground)] border border-[var(--danger)]/30",
    icon: "✕",
    label: "Down",
  },
  unknown: {
    badge:
      "bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)]",
    icon: "?",
    label: "Unknown",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLES[status] || STATUS_STYLES.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badge}`}
    >
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function ServiceStatusCard({
  name,
  status,
  details,
}: {
  name: string;
  status: string;
  details?: Record<string, any>;
}) {
  const resolvedStatus = status === "up" ? "up" : "down";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          {name}
        </h4>
        <StatusBadge status={resolvedStatus} />
      </div>
      {details && Object.keys(details).length > 0 && (
        <dl className="space-y-1">
          {Object.entries(details)
            .filter(([k]) => k !== "status")
            .map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <dt className="text-[var(--text-muted)] capitalize">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </dt>
                <dd className="text-[var(--foreground)] font-mono">
                  {String(value)}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}

const HORIZON_STATUS_CONFIG: Record<
  HorizonStatus,
  { label: string; badgeClass: string; bannerClass: string; icon: string }
> = {
  ok: {
    label: "Reachable",
    badgeClass:
      "bg-[var(--success)]/10 text-[var(--foreground)] border border-[var(--success)]/30",
    bannerClass: "",
    icon: "●",
  },
  degraded: {
    label: "Degraded",
    badgeClass:
      "bg-[var(--warning)]/10 text-[var(--foreground)] border border-[var(--warning)]/30",
    bannerClass:
      "rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-3 mt-4",
    icon: "▲",
  },
  unreachable: {
    label: "Unreachable",
    badgeClass:
      "bg-[var(--danger)]/10 text-[var(--foreground)] border border-[var(--danger)]/30",
    bannerClass:
      "rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 mt-4",
    icon: "✕",
  },
};

function HorizonStatusCard({
  status,
  latencyMs,
  horizonUrl,
  checkedAt,
}: {
  status: HorizonStatus;
  latencyMs: number | null;
  horizonUrl: string;
  checkedAt: string;
}) {
  const cfg = HORIZON_STATUS_CONFIG[status];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          Horizon RPC Status
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badgeClass}`}
        >
          <span>{cfg.icon}</span>
          {cfg.label}
        </span>
      </div>

      <dl className="divide-y divide-[var(--border)]">
        <ConfigRow label="Endpoint" value={horizonUrl} mono />
        <ConfigRow
          label="Latency"
          value={latencyMs !== null ? `${latencyMs} ms` : "N/A"}
        />
        <ConfigRow
          label="Checked at"
          value={new Date(checkedAt).toLocaleString()}
        />
      </dl>

      {status !== "ok" && (
        <div className={cfg.bannerClass}>
          <p className="text-sm font-medium text-[var(--foreground)]">
            {status === "unreachable"
              ? "Horizon is unreachable. Anchoring and on-chain operations will fail until connectivity is restored."
              : "Horizon returned a non-success response. Some operations may be impaired."}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const {
    data: health,
    isLoading: healthLoading,
    error: healthError,
    refetch: refetchHealth,
  } = useQuery<SystemHealthResponse>({
    queryKey: ["admin", "system-health"],
    queryFn: () => adminApi.getSystemHealth(),
    retry: false,
    staleTime: 30_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const {
    data: diagnostics,
    isLoading,
    error,
    refetch: refetchDiagnostics,
  } = useQuery<StellarDiagnosticsResponse>({
    queryKey: ["stellar", "diagnostics"],
    queryFn: fetchStellarDiagnostics,
    retry: false,
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const {
    data: observability,
    isLoading: observabilityLoading,
    error: observabilityError,
    refetch: refetchObservability,
  } = useQuery({
    queryKey: queryKeys.admin.observability.all(),
    queryFn: () => adminApi.getObservability(),
    staleTime: 60_000,
    retry: false,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  const handleRefresh = useCallback(() => {
    refetchHealth();
    refetchDiagnostics();
    refetchObservability();
  }, [refetchHealth, refetchDiagnostics, refetchObservability]);

  const serviceStatuses = health?.details
    ? Object.entries(health.details).map(([name, info]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        status: info.status,
        details: info,
      }))
    : [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">
            System Diagnostics
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Service health, queue metrics, and operational overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-[var(--accent-border)]"
            />
            Auto-refresh
          </label>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--secondary)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Service Status Cards */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-3">
          Service Status
        </h3>
        {healthLoading && <ServiceStatusSkeleton />}
        {healthError && (
          <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-4">
            <p className="text-sm text-[var(--danger)]">
              Failed to fetch system health. Backend may be unreachable.
            </p>
          </div>
        )}
        {health && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ServiceStatusCard
              name="Backend"
              status={health.status === "ok" ? "up" : "down"}
              details={{ overall: health.status }}
            />
            {serviceStatuses.map((svc) => (
              <ServiceStatusCard
                key={svc.name}
                name={svc.name}
                status={svc.status}
                details={svc.details}
              />
            ))}
            {diagnostics && (
              <ServiceStatusCard
                name="Stellar Horizon"
                status={diagnostics.horizonStatus === "ok" ? "up" : "down"}
                details={{
                  latency:
                    diagnostics.horizonLatencyMs !== null
                      ? `${diagnostics.horizonLatencyMs}ms`
                      : "N/A",
                  network: diagnostics.network,
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Queue Metrics */}
      {observabilityLoading && <ObservabilitySkeleton />}
      {observabilityError && (
        <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-4">
          <p className="text-sm text-[var(--danger)]">
            Failed to load queue metrics.
          </p>
        </div>
      )}
      {observability && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            BullMQ Queue Metrics
          </h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Active",
                value: observability.notifications.main.active,
              },
              {
                label: "Waiting",
                value: observability.notifications.main.waiting,
              },
              {
                label: "Failed",
                value: observability.notifications.main.failed,
              },
              {
                label: "DLQ Failed",
                value: observability.notifications.dlq.failed,
              },
              {
                label: "DLQ Waiting",
                value: observability.notifications.dlq.waiting,
              },
              {
                label: "DLQ Delayed",
                value: observability.notifications.dlq.delayed,
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              >
                <dt className="text-sm text-[var(--text-muted)]">
                  {label}
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Audit Activity */}
      {observability && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Audit Activity
          </h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <dt className="text-sm text-[var(--text-muted)]">
                Total logs
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                {observability.audit.totalLogs}
              </dd>
            </div>
            {observability.audit.actionTypeCounts.map((count) => (
              <div
                key={count.actionType}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4"
              >
                <dt className="text-sm text-[var(--text-muted)]">
                  {count.actionType}
                </dt>
                <dd className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                  {count.count}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Stellar Diagnostics */}
      {isLoading && <StellarSkeleton />}
      {error && (
        <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-5 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Failed to load Stellar diagnostics.
          </p>
          <p className="text-xs text-[var(--danger)]">
            Ensure the backend is running and accessible, and that your session
            has admin permissions.
          </p>
        </div>
      )}

      {diagnostics && (
        <div className="grid gap-6">
          <HorizonStatusCard
            status={diagnostics.horizonStatus}
            latencyMs={diagnostics.horizonLatencyMs}
            horizonUrl={diagnostics.horizonUrl}
            checkedAt={diagnostics.checkedAt}
          />

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Network Profile
            </h3>
            <dl className="divide-y divide-[var(--border)]">
              <ConfigRow
                label="Target Network"
                value={diagnostics.network}
                mono
              />
              <ConfigRow
                label="Horizon URL"
                value={diagnostics.horizonUrl}
                mono
              />
              <ConfigRow
                label="Soroban RPC URL"
                value={diagnostics.sorobanRpcUrl}
                mono
              />
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Smart Contract Deployments
            </h3>
            <dl className="divide-y divide-[var(--border)]">
              <ConfigRow
                label="Confession Anchor"
                value={diagnostics.contractIds?.confessionAnchor}
                mono
              />
              <ConfigRow
                label="Reputation Badges"
                value={diagnostics.contractIds?.reputationBadges}
                mono
              />
              <ConfigRow
                label="Tipping System"
                value={diagnostics.contractIds?.tippingSystem}
                mono
              />
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Deployment Metadata
            </h3>
            <dl className="divide-y divide-[var(--border)]">
              <ConfigRow
                label="Loaded"
                value={diagnostics.deploymentMetadata.loaded ? "Yes" : "No"}
              />
              <ConfigRow
                label="Generated at (UTC)"
                value={diagnostics.deploymentMetadata.generatedAtUtc}
                mono
              />
              <ConfigRow
                label="Age (days)"
                value={
                  diagnostics.deploymentMetadata.ageDays?.toString() ?? null
                }
              />
              <ConfigRow
                label="Stale"
                value={diagnostics.deploymentMetadata.isStale ? "Yes" : "No"}
              />
              <ConfigRow
                label="Load error"
                value={diagnostics.deploymentMetadata.loadError}
                mono
              />
            </dl>
            {diagnostics.deploymentMetadata.loadError && (
              <div className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
                {diagnostics.deploymentMetadata.loadError}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] text-center bg-[var(--surface-muted)] py-3 rounded-lg border border-[var(--border)]">
        Signer keys, seed phrases, and operational secrets are never exposed in
        this panel.
      </div>
    </div>
  );
}
