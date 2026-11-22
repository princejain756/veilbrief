"use client";

import {
  Check,
  CircleAlert,
  Cloud,
  Copy,
  Cpu,
  FileWarning,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { formatInteger, riskClass, riskLabel } from "@/lib/format";
import type { AuditView } from "@/lib/types";

interface AuditTabProps {
  audit: AuditView;
}

export function AuditTab({ audit }: AuditTabProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const isLocal = audit.inferenceSource === "ON_DEVICE";

  async function copyEdit(index: number, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1600);
    } catch {
      setCopiedIndex(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`pill type-pill ${
              isLocal ? "pill-emerald" : "pill-cobalt"
            }`}
          >
            {isLocal ? (
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <strong className="font-[700]">{audit.inferenceSource}</strong>
          </span>
          <span className="type-meta text-[var(--text-muted)]">
            {audit.modelName}
          </span>
          <span
            className="h-3 w-px bg-[var(--border-strong)]"
            aria-hidden="true"
          />
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(audit.latencyMs)} ms
          </span>
        </div>
        <span className={`pill type-pill ${riskClass(audit.riskLevel)}`}>
          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {riskLabel(audit.riskLevel)} risk
        </span>
      </div>

      <section>
        <div className="type-table-head mb-2 flex items-center gap-1.5 text-[var(--text-faint)]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Executive summary
        </div>
        <p className="type-body m-0 text-[var(--text-ink)]">
          {audit.executiveSummary}
        </p>
      </section>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="type-table-head flex items-center gap-1.5 text-[var(--text-faint)]">
            <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
            Red flags
          </div>
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(audit.redFlags.length)}
          </span>
        </div>

        {audit.redFlags.length ? (
          <div className="divide-y divide-[var(--border-line)]">
            {audit.redFlags.map((flag, index) => (
              <div
                key={`${flag.title}-${index}`}
                className="grid grid-cols-[1.75rem_1fr] gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <span
                  className={`numeral mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-[650] ${
                    flag.severity === "critical" || flag.severity === "high"
                      ? "border-[color-mix(in_srgb,var(--status-crimson)_28%,transparent)] bg-[var(--status-crimson-soft)] text-[var(--status-crimson-ink)]"
                      : flag.severity === "medium"
                        ? "border-[color-mix(in_srgb,var(--status-amber)_28%,transparent)] bg-[var(--status-amber-soft)] text-[var(--status-amber-ink)]"
                        : "border-[color-mix(in_srgb,var(--status-emerald)_28%,transparent)] bg-[var(--status-emerald-soft)] text-[var(--status-emerald-ink)]"
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="m-0 text-[13px] font-[610] leading-5 text-[var(--text-ink)]">
                      {flag.title}
                    </h3>
                    {flag.clause && (
                      <span className="type-meta text-[var(--text-faint)]">
                        {flag.clause}
                      </span>
                    )}
                  </div>
                  <p className="type-meta m-0 mt-0.5 text-[var(--text-muted)]">
                    {flag.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="type-meta m-0 text-[var(--text-faint)]">
            No material red flags were returned for this packet.
          </p>
        )}
      </section>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="type-table-head text-[var(--text-faint)]">
            Recommended edits
          </div>
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(audit.recommendedEdits.length)}
          </span>
        </div>

        {audit.recommendedEdits.length ? (
          <div className="space-y-3">
            {audit.recommendedEdits.map((edit, index) => (
              <article
                key={`${edit.title}-${index}`}
                className="border-l-2 border-[var(--border-strong)] pl-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="m-0 text-[13px] font-[610] leading-5 text-[var(--text-ink)]">
                    {edit.title}
                  </h3>
                  <button
                    type="button"
                    className="button-ghost !min-h-6 !px-1.5 text-[10px]"
                    onClick={() => copyEdit(index, edit.replacement)}
                    title="Copy rehydrated edit"
                  >
                    {copiedIndex === index ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copiedIndex === index ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="type-meta m-0 mt-1 whitespace-pre-wrap text-[var(--text-ink)]">
                  {edit.replacement}
                </p>
                {edit.rationale && (
                  <p className="type-meta m-0 mt-1.5 text-[var(--text-faint)]">
                    {edit.rationale}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="type-meta m-0 text-[var(--text-faint)]">
            No replacement language was returned for this packet.
          </p>
        )}
      </section>
    </div>
  );
}
