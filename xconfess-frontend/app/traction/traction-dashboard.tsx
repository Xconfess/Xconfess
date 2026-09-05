"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  Anchor,
  BarChart3,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  fetchPublicTractionMetrics,
  TractionMetrics,
} from "@/app/lib/api/traction";

type LoadState =
  | { status: "loading"; data: null; error: null }
  | { status: "loaded"; data: TractionMetrics; error: null }
  | { status: "error"; data: null; error: string };

const initialState: LoadState = { status: "loading", data: null, error: null };

const numberFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 0,
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function compactContract(value: string | null): string {
  if (!value) return "Not configured";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function TractionDashboard() {
  const [state, setState] = useState<LoadState>(initialState);

  const load = async () => {
    setState((current) =>
      current.status === "loaded"
        ? { status: "loaded", data: current.data, error: null }
        : initialState,
    );
    try {
      const data = await fetchPublicTractionMetrics();
      setState({ status: "loaded", data, error: null });
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Public traction metrics unavailable",
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (state.status === "loading") {
    return <TractionSkeleton />;
  }

  if (state.status === "error") {
    return <TractionError message={state.error} onRetry={() => void load()} />;
  }

  return <TractionContent metrics={state.data} onRefresh={() => void load()} />;
}

function TractionContent({
  metrics,
  onRefresh,
}: {
  metrics: TractionMetrics;
  onRefresh: () => void;
}) {
  const submitted = metrics.stellar.submittedTransactions;
  const confirmed = metrics.stellar.confirmedTransactions;
  const successRate =
    metrics.reliability.transactionSuccessRate === null
      ? "No settled transactions yet"
      : `${metrics.reliability.transactionSuccessRate.toFixed(2)}%`;

  const tipVolume = useMemo(() => {
    const entries = Object.entries(metrics.stellar.tipVolumeByAsset);
    if (entries.length === 0) return "0";
    return entries.map(([asset, amount]) => `${amount} ${asset}`).join(", ");
  }, [metrics.stellar.tipVolumeByAsset]);

  return (
    <main className="editorial-shell relative overflow-hidden pb-20">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <p className="eyebrow">Public traction</p>
            <h1 className="font-editorial text-4xl leading-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
              Real usage, aggregate only.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-[var(--secondary)]">
              A public snapshot of Xconfess activity calculated from persisted
              product records and privacy-safe analytics events.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
            <NetworkBadge network={metrics.stellar.network} />
            <Button variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>

        <section
          aria-label="Product usage"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <MetricTile
            icon={Users}
            label="Registered users"
            value={formatNumber(metrics.users.totalRegistered)}
          />
          <MetricTile icon={Activity} label="DAU" value={formatNumber(metrics.users.dau)} />
          <MetricTile icon={Activity} label="WAU" value={formatNumber(metrics.users.wau)} />
          <MetricTile icon={Activity} label="MAU" value={formatNumber(metrics.users.mau)} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Engagement" icon={MessageSquareText}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricRow label="Confessions" value={metrics.engagement.confessionsCreated} />
              <MetricRow label="Comments" value={metrics.engagement.commentsCreated} />
              <MetricRow label="Reactions" value={metrics.engagement.reactionsCreated} />
              <MetricRow label="Messages" value={metrics.engagement.messagesSent} />
            </div>
          </Panel>

          <Panel title="Stellar Activity" icon={Wallet}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricRow label="Wallets connected" value={metrics.stellar.walletsConnected} />
              <MetricRow label="Submitted tx" value={submitted} />
              <MetricRow label="Confirmed tx" value={confirmed} />
              <MetricRow label="Failed tx" value={metrics.stellar.failedTransactions} />
              <MetricRow label="Successful tips" value={metrics.stellar.successfulTips} />
              <MetricRow label="Soroban events" value={metrics.stellar.sorobanEventsIndexed} />
            </div>
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <div className="text-sm text-[var(--secondary)]">Tip volume by asset</div>
              <div className="mt-2 text-xl font-semibold text-[var(--foreground)]">
                {tipVolume}
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Reliability" icon={CheckCircle2}>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricRow label="Last updated" value={formatDate(metrics.generatedAt)} />
              <MetricRow label="Transaction success rate" value={successRate} />
            </div>
          </Panel>

          <Panel title="Contract Configuration" icon={Anchor}>
            <div className="grid gap-3">
              <ContractRow
                label="Confession anchor"
                value={metrics.stellar.contracts.confessionAnchorContractId}
              />
              <ContractRow
                label="Reputation badges"
                value={metrics.stellar.contracts.reputationBadgesContractId}
              />
              <ContractRow
                label="Tipping system"
                value={metrics.stellar.contracts.tippingSystemContractId}
              />
            </div>
          </Panel>
        </section>

        <Panel title="Methodology" icon={ShieldCheck}>
          <div className="grid gap-4 text-sm leading-7 text-[var(--secondary)] lg:grid-cols-2">
            <p>
              Active users are unique pseudonymous actors with at least one
              meaningful successful product action in the relevant rolling
              window. Anonymous page views and raw IP addresses are not counted.
            </p>
            <p>
              Data is refreshed from the public API with a short cache window.
              Public figures include only aggregate counts and configured
              Stellar network information.
            </p>
            <p>
              Confession text, message bodies, emails, tokens, raw IP
              addresses, wallet secrets, private keys, and seed phrases are
              excluded from the analytics pipeline.
            </p>
            <p>
              Zero values mean no qualifying records have been observed yet.
              No growth percentages or traction numbers are manually seeded.
            </p>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function NetworkBadge({ network }: { network: string }) {
  const label = network === "mainnet" ? "Mainnet" : "Testnet";
  return (
    <div className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--primary-deep)]">
      <Clock3 className="h-4 w-4" aria-hidden="true" />
      {label}
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="luxury-panel rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[var(--secondary)]">{label}</div>
        <Icon className="h-5 w-5 text-[var(--primary-deep)]" aria-hidden />
      </div>
      <div className="mt-4 text-3xl font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
}) {
  return (
    <section className="luxury-panel rounded-lg p-5">
      <div className="mb-5 flex items-center gap-3">
        <Icon className="h-5 w-5 text-[var(--primary-deep)]" aria-hidden />
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="text-sm text-[var(--secondary)]">{label}</div>
      <div className="mt-2 text-xl font-semibold text-[var(--foreground)]">
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function ContractRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-[var(--secondary)]">{label}</span>
      <code className="break-all text-sm font-semibold text-[var(--foreground)]">
        {compactContract(value)}
      </code>
    </div>
  );
}

function TractionSkeleton() {
  return (
    <main className="editorial-shell relative overflow-hidden pb-20">
      <section className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
        <div className="max-w-3xl space-y-4">
          <div className="h-3 w-40 rounded-full bg-[var(--skeleton)]" />
          <div className="h-14 w-full max-w-2xl rounded-lg bg-[var(--skeleton)]" />
          <div className="h-5 w-full max-w-xl rounded-lg bg-[var(--skeleton)]" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="luxury-panel rounded-lg p-5">
              <div className="h-4 w-28 rounded bg-[var(--skeleton)]" />
              <div className="mt-5 h-9 w-20 rounded bg-[var(--skeleton)]" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="luxury-panel h-72 rounded-lg p-5" />
          ))}
        </div>
      </section>
    </main>
  );
}

function TractionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="editorial-shell relative overflow-hidden pb-20">
      <section className="mx-auto w-full max-w-3xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="luxury-panel rounded-lg p-6">
          <div className="flex items-start gap-4">
            <BarChart3 className="mt-1 h-5 w-5 text-[var(--primary-deep)]" aria-hidden />
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold text-[var(--foreground)]">
                  Traction metrics are unavailable
                </h1>
                <p className="mt-2 text-sm leading-7 text-[var(--secondary)]">
                  {message}
                </p>
              </div>
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
