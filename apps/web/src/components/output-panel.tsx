"use client";

import {
  FileCheck2,
  LoaderCircle,
  RadioTower,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { AuditTab } from "@/components/audit-tab";
import { PiiDiffTab } from "@/components/pii-diff-tab";
import { TelemetryTab } from "@/components/telemetry-tab";
import type {
  AuditFeedItem,
  AuditView,
  RemoteParam,
} from "@/lib/types";

export type OutputTab = "audit" | "pii" | "telemetry";

interface OutputPanelProps {
  audit: AuditView | null;
  activeTab: OutputTab;
  running: boolean;
  progressLabel: string;
  progress: number;
  remoteParams: RemoteParam[];
  remoteSource: "defaults" | "live";
  refreshingRemote: boolean;
  feed: AuditFeedItem[];
  uid?: string;
  authReady: boolean;
  onTabChange: (tab: OutputTab) => void;
  onRefreshRemote: () => void;
}

const tabs: Array<{
  id: OutputTab;
  label: string;
  icon: typeof FileCheck2;
}> = [
  { id: "audit", label: "Audit & Redlines", icon: FileCheck2 },
  { id: "pii", label: "Zero-Egress PII Diff", icon: ShieldCheck },
  {
    id: "telemetry",
    label: "Telemetry & Multi-Platform Sync",
    icon: RadioTower,
  },
];

export function OutputPanel({
  audit,
  activeTab,
  running,
  progressLabel,
  progress,
  remoteParams,
  remoteSource,
  refreshingRemote,
  feed,
  uid,
  authReady,
  onTabChange,
  onRefreshRemote,
}: OutputPanelProps) {
  return (
    <section className="app-card flex min-h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-line)] px-4 py-3">
        <div>
          <h2 className="type-section">Audit output</h2>
          <p className="type-meta mt-0.5 text-[var(--text-faint)]">
            Local rehydration, egress proof, and sync state
          </p>
        </div>
        <div className="pill pill-neutral type-pill">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              running
                ? "animate-pulse bg-[var(--status-cobalt)]"
                : audit
                  ? "bg-[var(--status-emerald)]"
                  : "bg-[var(--text-faint)]"
            }`}
            aria-hidden="true"
          />
          <span>
            {running
              ? "Audit in progress"
              : audit
                ? "Audit ready"
                : "Awaiting packet"}
          </span>
        </div>
      </div>

      <div
        className="custom-scrollbar flex gap-4 overflow-x-auto border-b border-[var(--border-line)] px-4"
        role="tablist"
        aria-label="Audit output views"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              data-active={activeTab === tab.id}
              className="tab-button shrink-0"
              onClick={() => onTabChange(tab.id)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="output-scroll custom-scrollbar flex-1 p-4">
        {activeTab === "audit" && audit && <AuditTab audit={audit} />}
        {activeTab === "pii" && audit && <PiiDiffTab audit={audit} />}
        {activeTab === "telemetry" && (
          <TelemetryTab
            remoteParams={remoteParams}
            remoteSource={remoteSource}
            refreshing={refreshingRemote}
            feed={feed}
            uid={uid}
            authReady={authReady}
            onRefresh={onRefreshRemote}
          />
        )}

        {running && activeTab !== "telemetry" && (
          <div className="empty-grid flex min-h-[25rem] flex-col items-center justify-center rounded-[7px] border border-dashed border-[var(--border-line)] px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-line)] bg-[var(--bg-surface)] text-[var(--status-emerald-ink)]">
              <LoaderCircle
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
            </span>
            <h3 className="type-section mt-4">{progressLabel}</h3>
            <div className="mt-3 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--status-emerald)] transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="numeral type-meta mt-2 text-[var(--text-faint)]">
              {Math.round(progress * 100)}%
            </p>
          </div>
        )}

        {!running && !audit && activeTab !== "telemetry" && (
          <div className="empty-grid flex min-h-[25rem] flex-col items-center justify-center rounded-[7px] border border-dashed border-[var(--border-line)] px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-line)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
              <ScanSearch className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="type-section mt-4">No audit is open</h3>
            <p className="type-meta mt-1 max-w-[22rem] text-[var(--text-muted)]">
              Choose a sample or add a document, then run the audit. The exact
              source, scrub map, redlines, and routing evidence will appear
              here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
