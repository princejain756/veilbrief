"use client";

import {
  Cpu,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import { formatBytes, formatInteger, shortDigest, sourceLabel } from "@/lib/format";
import type { AuditView, InferenceMode } from "@/lib/types";

interface KpiStripProps {
  preflightCount: number;
  preflightCategories: string[];
  mode: InferenceMode;
  forcedOffline: boolean;
  targetCloudModel: string;
  audit: AuditView | null;
}

export function KpiStrip({
  preflightCount,
  preflightCategories,
  mode,
  forcedOffline,
  targetCloudModel,
  audit,
}: KpiStripProps) {
  const stage1Count = audit ? audit.payload.tokens.length : preflightCount;
  const stage1Hint = audit
    ? `${audit.payload.contextualStageNote}`
    : preflightCategories.length > 0
      ? `Categories: ${preflightCategories.join(", ")}`
      : "No structured identifiers detected yet";

  const stage2Value = audit
    ? sourceLabel(audit.inferenceSource)
    : forcedOffline || mode === "local"
      ? "Local Only"
      : mode === "cloud"
        ? "Scrubbed Cloud"
        : "Auto Hybrid";
  const stage2Secondary = audit
    ? `${audit.modelName} (${formatInteger(audit.latencyMs)} ms)`
    : forcedOffline || mode === "local"
      ? "Zero cloud transmission"
      : `Cloud target: ${targetCloudModel}`;

  const stage3Value = audit
    ? audit.payload.rawPiiBytesSent === 0
      ? "0 raw PII bytes"
      : `${formatBytes(audit.payload.rawPiiBytesSent)} leaked`
    : "Preflight Active";

  const stage3Secondary = audit
    ? audit.payload.wirePayloadSha256
      ? `${shortDigest(audit.payload.wirePayloadSha256)} (${formatBytes(audit.payload.wireBytesSent)})`
      : "0 B sent on network"
    : "Independent canary audit runs before send";

  return (
    <section
      aria-label="Three-stage privacy pipeline"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <div className="app-card p-3.5 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="type-kpi-label text-[var(--text-muted)]">
            Stage 1: Local PII Shield
          </span>
          <ShieldCheck
            className="h-4 w-4 text-[var(--status-emerald)]"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="numeral text-[22px] font-[650] leading-7 text-[var(--text-ink)]">
            {formatInteger(stage1Count)} protected tokens
          </span>
        </div>
        <div className="type-meta mt-1 truncate text-[var(--text-faint)]">
          {stage1Hint}
        </div>
      </div>

      <div className="app-card p-3.5 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="type-kpi-label text-[var(--text-muted)]">
            Stage 2: Hybrid Inference Route
          </span>
          <Cpu className="h-4 w-4 text-[var(--status-cobalt)]" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[22px] font-[650] leading-7 text-[var(--text-ink)]">
            {stage2Value}
          </span>
        </div>
        <div className="numeral type-meta mt-1 truncate text-[var(--text-faint)]">
          {stage2Secondary}
        </div>
      </div>

      <div className="app-card p-3.5 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="type-kpi-label text-[var(--text-muted)]">
            Stage 3: Wire Egress Proof
          </span>
          <Fingerprint
            className="h-4 w-4 text-[var(--status-emerald)]"
            aria-hidden="true"
          />
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="numeral text-[22px] font-[650] leading-7 text-[var(--text-ink)]">
            {stage3Value}
          </span>
        </div>
        <div className="numeral font-code type-meta mt-1 truncate text-[var(--text-faint)]">
          {stage3Secondary}
        </div>
      </div>
    </section>
  );
}
