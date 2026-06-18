"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  RefreshCw,
  Server,
} from "lucide-react";
import { adminApi } from "@/app/lib/api/admin";
import type { StellarDiagnosticsResponse } from "@/app/lib/types/stellar";

type ContractKey = keyof StellarDiagnosticsResponse["contractIds"];

const CONTRACT_LABELS: Record<ContractKey, string> = {
  confessionAnchor: "Confession Anchor",
  reputationBadges: "Reputation Badges",
  tippingSystem: "Tipping System",
};

function formatContractId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 22) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load diagnostics.";
}

function Skeleton() {
  return (
    <div className="grid gap-4">
      <div className="h-32 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

function CopyButton({
  value,
  label,
  copied,
  onCopied,
}: {
  value: string | null;
  label: string;
  copied: boolean;
  onCopied: () => void;
}) {
  const copyValue = async () => {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    onCopied();
  };

  return (
    <button
      type="button"
      onClick={copyValue}
      disabled={!value}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-2 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800 sm:grid-cols-[180px_1fr] sm:items-center">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`min-w-0 text-sm text-gray-900 dark:text-white ${
          mono ? "break-all font-mono text-xs" : ""
        }`}
      >
        {value || (
          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
            Not configured
          </span>
        )}
      </dd>
    </div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warning";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-gray-200 bg-white text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-white";

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ContractRow({
  label,
  value,
  copied,
  onCopied,
}: {
  label: string;
  value: string | null;
  copied: boolean;
  onCopied: () => void;
}) {
  return (
    <div className="grid gap-2 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800 sm:grid-cols-[180px_1fr_auto] sm:items-center">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="min-w-0">
        {value ? (
          <span
            title={value}
            className="font-mono text-xs text-gray-900 dark:text-white"
          >
            {formatContractId(value)}
          </span>
        ) : (
          <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
            Not configured
          </span>
        )}
      </dd>
      <CopyButton
        value={value}
        label={label}
        copied={copied}
        onCopied={onCopied}
      />
    </div>
  );
}

export default function DiagnosticsPage() {
  const [copiedKey, setCopiedKey] = useState<ContractKey | null>(null);
  const {
    data: diagnostics,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<StellarDiagnosticsResponse>({
    queryKey: ["admin", "stellarDiagnostics"],
    queryFn: adminApi.getStellarDiagnostics,
    retry: false,
    staleTime: 30000,
  });

  const horizonOk = diagnostics?.horizon.status === "ok";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Stellar Diagnostics
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Network, contract, and Horizon status for operator review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          title="Refresh diagnostics"
          aria-label="Refresh diagnostics"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {isLoading && <Skeleton />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {getErrorMessage(error)}
        </div>
      )}

      {diagnostics && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile
              icon={<Server className="h-4 w-4" />}
              label="Network"
              value={diagnostics.network}
            />
            <StatusTile
              icon={
                horizonOk ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )
              }
              label="Horizon"
              value={horizonOk ? "Reachable" : "Warning"}
              tone={horizonOk ? "ok" : "warning"}
            />
            <StatusTile
              icon={<Clock3 className="h-4 w-4" />}
              label="Latency"
              value={
                diagnostics.horizon.latencyMs === null
                  ? "--"
                  : `${diagnostics.horizon.latencyMs} ms`
              }
            />
          </div>

          {!horizonOk && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
              Horizon ping failed:{" "}
              {diagnostics.horizon.error || "unknown error"}
            </div>
          )}

          <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Network
            </h3>
            <dl className="mt-4">
              <DetailRow
                label="Target network"
                value={diagnostics.network}
                mono
              />
              <DetailRow
                label="Horizon URL"
                value={diagnostics.horizonUrl}
                mono
              />
              <DetailRow
                label="Soroban RPC URL"
                value={diagnostics.sorobanRpcUrl}
                mono
              />
              <DetailRow
                label="Last Horizon check"
                value={formatCheckedAt(diagnostics.horizon.checkedAt)}
              />
            </dl>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Contract IDs
            </h3>
            <dl className="mt-4">
              {(Object.keys(CONTRACT_LABELS) as ContractKey[]).map((key) => (
                <ContractRow
                  key={key}
                  label={CONTRACT_LABELS[key]}
                  value={diagnostics.contractIds[key]}
                  copied={copiedKey === key}
                  onCopied={() => {
                    setCopiedKey(key);
                    window.setTimeout(() => setCopiedKey(null), 1500);
                  }}
                />
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Deployment Metadata
            </h3>
            <dl className="mt-4">
              <DetailRow
                label="Loaded"
                value={diagnostics.deploymentMetadata.loaded ? "Yes" : "No"}
              />
              <DetailRow
                label="Generated at UTC"
                value={diagnostics.deploymentMetadata.generatedAtUtc}
                mono
              />
              <DetailRow
                label="Age days"
                value={diagnostics.deploymentMetadata.ageDays}
              />
              <DetailRow
                label="Stale"
                value={diagnostics.deploymentMetadata.isStale ? "Yes" : "No"}
              />
              <DetailRow
                label="Load error"
                value={diagnostics.deploymentMetadata.loadError}
                mono
              />
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
