"use client";

import {
  Cloud,
  Cpu,
  Database,
  Laptop,
  RadioTower,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  platformLabel,
  riskClass,
  riskLabel,
} from "@/lib/format";
import type {
  AuditFeedItem,
  InferenceSource,
  Platform,
  RemoteParam,
  SessionStats,
} from "@/lib/types";

interface TelemetryTabProps {
  remoteParams: RemoteParam[];
  remoteSource: "defaults" | "live";
  refreshing: boolean;
  feed: AuditFeedItem[];
  uid?: string;
  authReady: boolean;
  sessionStats: SessionStats;
  onRefresh: () => void;
}

const platforms: Array<{ id: Platform; label: string; icon: typeof Laptop }> = [
  { id: "web", label: "Web", icon: Laptop },
  { id: "chrome-extension", label: "Chrome extension", icon: Cpu },
  { id: "macos", label: "macOS", icon: Laptop },
  { id: "ios", label: "iOS", icon: Smartphone },
];

function sourcePill(source: InferenceSource) {
  if (source === "ON_DEVICE") return "pill-emerald";
  if (source === "IN_CLOUD") return "pill-cobalt";
  return "pill-neutral";
}

export function TelemetryTab({
  remoteParams,
  remoteSource,
  refreshing,
  feed,
  uid,
  authReady,
  sessionStats,
  onRefresh,
}: TelemetryTabProps) {
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud
              className="h-3.5 w-3.5 text-[var(--text-faint)]"
              aria-hidden="true"
            />
            <span className="type-table-head text-[var(--text-faint)]">
              Session Hybrid Metrics
            </span>
          </div>
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(sessionStats.totalRuns)}{" "}
            {sessionStats.totalRuns === 1 ? "completed run" : "completed runs"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
            <div className="type-meta text-[var(--text-faint)]">On-Device Share</div>
            <div className="numeral mt-0.5 text-[15px] font-[620] text-[var(--text-ink)]">
              {formatPercent(sessionStats.onDeviceShare)}
            </div>
          </div>
          <div className="rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
            <div className="type-meta text-[var(--text-faint)]">Total Masked</div>
            <div className="numeral mt-0.5 text-[15px] font-[620] text-[var(--text-ink)]">
              {formatInteger(sessionStats.piiEntities)}
            </div>
          </div>
          <div className="rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
            <div className="type-meta text-[var(--text-faint)]">Avg Latency</div>
            <div className="numeral mt-0.5 text-[14px] font-[620] text-[var(--text-ink)]">
              {formatInteger(sessionStats.localLatency)} / {formatInteger(sessionStats.cloudLatency)} ms
            </div>
          </div>
          <div className="rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
            <div className="type-meta text-[var(--text-faint)]">Cloud Spend Saved</div>
            <div className="numeral mt-0.5 text-[15px] font-[620] text-[var(--text-ink)]">
              {formatCurrency(sessionStats.cloudSpendSaved)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud
              className="h-3.5 w-3.5 text-[var(--text-faint)]"
              aria-hidden="true"
            />
            <span className="type-table-head text-[var(--text-faint)]">
              Remote Config
            </span>
            <span
              className={`pill type-pill ${
                remoteSource === "live" ? "pill-emerald" : "pill-neutral"
              }`}
            >
              {remoteSource === "live" ? "Live" : "Defaults"}
            </span>
          </div>
          <button
            type="button"
            className="button-secondary !min-h-7 !px-2 text-[11px]"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                refreshing ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto border-y border-[var(--border-line)]">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr>
                <th className="type-table-head py-2 pr-3 text-[var(--text-faint)]">
                  Parameter
                </th>
                <th className="type-table-head py-2 text-[var(--text-faint)]">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {remoteParams.map((param) => (
                <tr
                  key={param.key}
                  className="border-t border-[var(--border-line)]"
                >
                  <td className="type-table-cell py-2 pr-3 align-top">
                    <span className="font-code text-[11px] text-[var(--text-muted)]">
                      {param.key}
                    </span>
                  </td>
                  <td className="numeral type-table-cell py-2 align-top font-[560] text-[var(--text-ink)]">
                    {param.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <RadioTower
              className="h-3.5 w-3.5 text-[var(--text-faint)]"
              aria-hidden="true"
            />
            <span className="type-table-head text-[var(--text-faint)]">
              Cross-platform audit feed
            </span>
            <span
              className={`pill type-pill ${
                authReady ? "pill-emerald" : "pill-neutral"
              }`}
            >
              {authReady ? "Listening" : "Awaiting auth"}
            </span>
          </div>
          <span className="type-meta font-code text-[var(--text-faint)]">
            users/{uid ? `${uid.slice(0, 8)}...` : "{uid}"}/audits
          </span>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const count = feed.filter(
              (item) => item.platform === platform.id,
            ).length;
            return (
              <div
                key={platform.id}
                className="flex min-w-0 items-center gap-2 border-b border-[var(--border-line)] pb-2"
              >
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate text-[11px] font-[550] text-[var(--text-muted)]">
                  {platform.label}
                </span>
                <span className="numeral ml-auto text-[11px] text-[var(--text-faint)]">
                  {formatInteger(count)}
                </span>
              </div>
            );
          })}
        </div>

        {feed.length ? (
          <div className="divide-y divide-[var(--border-line)]">
            {feed.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                  {item.platform === "ios" ? (
                    <Smartphone
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  ) : item.platform === "chrome-extension" ? (
                    <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Laptop className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[12px] font-[580] text-[var(--text-ink)]">
                      {platformLabel(item.platform)}
                    </span>
                    <span
                      className={`pill type-pill ${sourcePill(item.source)}`}
                    >
                      {item.source}
                    </span>
                    <span
                      className={`pill type-pill ${riskClass(
                        item.riskLevel,
                      )}`}
                    >
                      {riskLabel(item.riskLevel)}
                    </span>
                  </div>
                  <div className="type-meta mt-0.5 truncate text-[var(--text-faint)]">
                    {item.modelName}
                    {item.latencyMs !== undefined
                      ? ` / ${formatInteger(item.latencyMs)} ms`
                      : ""}
                  </div>
                </div>
                <span className="numeral type-meta whitespace-nowrap text-[var(--text-faint)]">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-grid flex min-h-28 flex-col items-center justify-center rounded-[7px] border border-dashed border-[var(--border-line)] px-4 text-center">
            <Database
              className="h-5 w-5 text-[var(--text-faint)]"
              aria-hidden="true"
            />
            <p className="type-meta m-0 mt-2 text-[var(--text-muted)]">
              No synced audits yet.
            </p>
            <p className="type-meta m-0 mt-0.5 text-[var(--text-faint)]">
              Web runs sync anonymized metadata across clients here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
