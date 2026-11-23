"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Cloud,
  Copy,
  Cpu,
  Download,
  FileText,
  FileWarning,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatInteger, riskClass, riskLabel } from "@/lib/format";
import { applyAcceptedRedlines } from "@/lib/redline-export";
import type { AuditView, RedlineDecision } from "@/lib/types";

interface AuditTabProps {
  audit: AuditView;
  decisions: Record<number, RedlineDecision>;
  onDecisionChange: (index: number, next: RedlineDecision) => void;
  onExportDocx: (updatedText: string) => Promise<void>;
  onExportMarkdown: (updatedText: string) => void;
  onExportReceipt: () => void;
}

export function AuditTab({
  audit,
  decisions,
  onDecisionChange,
  onExportDocx,
  onExportMarkdown,
  onExportReceipt,
}: AuditTabProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftText, setDraftText] = useState("");
  const [showFinalPreview, setShowFinalPreview] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);

  const isLocal = audit.inferenceSource === "ON_DEVICE";
  const acceptedCount = useMemo(
    () =>
      Object.values(decisions).filter((d) => d.status === "accepted").length,
    [decisions],
  );

  const applied = useMemo(
    () =>
      applyAcceptedRedlines(
        audit.payload.originalText,
        audit.recommendedEdits,
        decisions,
      ),
    [audit.payload.originalText, audit.recommendedEdits, decisions],
  );

  async function copyEdit(index: number, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1600);
    } catch {
      setCopiedIndex(null);
    }
  }

  async function handleDocxClick() {
    setExportingDocx(true);
    try {
      await onExportDocx(applied.updatedText);
    } finally {
      setExportingDocx(false);
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
            {audit.streamed ? " (streamed)" : ""}
          </span>
        </div>
        <span className={`pill type-pill ${riskClass(audit.riskLevel)}`}>
          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {riskLabel(audit.riskLevel)} risk
        </span>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
        <div className="text-[12px] text-[var(--text-muted)]">
          <strong className="font-[620] text-[var(--text-ink)]">
            {acceptedCount} of {audit.recommendedEdits.length}
          </strong>{" "}
          redlines accepted
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="button-secondary !min-h-7 !px-2 text-[11px]"
            onClick={() => void handleDocxClick()}
            disabled={exportingDocx}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {exportingDocx ? "Building DOCX" : "Export Clean .docx"}
          </button>
          <button
            type="button"
            className="button-secondary !min-h-7 !px-2 text-[11px]"
            onClick={() => onExportMarkdown(applied.updatedText)}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Export .md
          </button>
          <button
            type="button"
            className="button-secondary !min-h-7 !px-2 text-[11px]"
            onClick={onExportReceipt}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Privacy Receipt
          </button>
        </div>
      </section>

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
          <div className="type-table-head text-[var(--text-faint)]">
            Interactive clause redlines
          </div>
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(audit.recommendedEdits.length)}
          </span>
        </div>

        {audit.recommendedEdits.length ? (
          <div className="space-y-3">
            {audit.recommendedEdits.map((edit, index) => {
              const decision = decisions[index] ?? { status: "pending" };
              const activeReplacement = decision.customText ?? edit.replacement;
              const isEditing = editingIndex === index;

              return (
                <article
                  key={`${edit.title}-${index}`}
                  className={`rounded-[7px] border p-3 ${
                    decision.status === "accepted"
                      ? "border-[color-mix(in_srgb,var(--status-emerald)_38%,transparent)] bg-[color-mix(in_srgb,var(--status-emerald-soft)_45%,transparent)]"
                      : decision.status === "rejected"
                        ? "border-[var(--border-line)] opacity-65"
                        : "border-[var(--border-line)] bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="m-0 text-[13px] font-[620] leading-5 text-[var(--text-ink)]">
                      {edit.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className={`button-ghost !min-h-6 !px-2 text-[11px] ${
                          decision.status === "accepted"
                            ? "!border-[color-mix(in_srgb,var(--status-emerald)_45%,transparent)] !bg-[var(--status-emerald-soft)] !text-[var(--status-emerald-ink)] font-[620]"
                            : ""
                        }`}
                        onClick={() =>
                          onDecisionChange(index, {
                            ...decision,
                            status:
                              decision.status === "accepted"
                                ? "pending"
                                : "accepted",
                          })
                        }
                      >
                        <Check className="h-3 w-3" aria-hidden="true" />
                        {decision.status === "accepted" ? "Accepted" : "Accept"}
                      </button>
                      <button
                        type="button"
                        className={`button-ghost !min-h-6 !px-2 text-[11px] ${
                          decision.status === "rejected"
                            ? "bg-[var(--status-crimson-soft)] text-[var(--status-crimson-ink)]"
                            : ""
                        }`}
                        onClick={() =>
                          onDecisionChange(index, {
                            ...decision,
                            status:
                              decision.status === "rejected"
                                ? "pending"
                                : "rejected",
                          })
                        }
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                        Reject
                      </button>
                      <button
                        type="button"
                        className="button-ghost !min-h-6 !px-1.5 text-[11px]"
                        onClick={() => {
                          if (isEditing) {
                            setEditingIndex(null);
                          } else {
                            setDraftText(activeReplacement);
                            setEditingIndex(index);
                          }
                        }}
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button-ghost !min-h-6 !px-1.5 text-[11px]"
                        onClick={() => void copyEdit(index, activeReplacement)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                        {copiedIndex === index ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {edit.original && (
                    <div className="mt-2 rounded-[5px] border border-[color-mix(in_srgb,var(--status-crimson)_24%,transparent)] bg-[var(--status-crimson-soft)] px-2.5 py-1.5 text-[12px] leading-[18px] text-[var(--status-crimson-ink)]">
                      <span className="mr-1.5 font-code font-[700]">-</span>
                      {edit.original}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        className="app-field p-2 text-[12px] leading-[18px]"
                        rows={3}
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="button-primary !min-h-7 !px-2.5 text-[11px]"
                          onClick={() => {
                            onDecisionChange(index, {
                              status: "accepted",
                              customText: draftText,
                            });
                            setEditingIndex(null);
                          }}
                        >
                          Save & Accept
                        </button>
                        <button
                          type="button"
                          className="button-ghost !min-h-7 !px-2 text-[11px]"
                          onClick={() => setEditingIndex(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 rounded-[5px] border border-[color-mix(in_srgb,var(--status-emerald)_26%,transparent)] bg-[var(--status-emerald-soft)] px-2.5 py-1.5 text-[12px] leading-[18px] text-[var(--status-emerald-ink)]">
                      <span className="mr-1.5 font-code font-[700]">+</span>
                      {activeReplacement}
                    </div>
                  )}

                  {edit.rationale && (
                    <p className="type-meta m-0 mt-1.5 text-[var(--text-faint)]">
                      {edit.rationale}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="type-meta m-0 text-[var(--text-faint)]">
            No replacement language was returned for this packet.
          </p>
        )}
      </section>

      {audit.recommendedEdits.length > 0 && (
        <section className="border-t border-[var(--border-line)] pt-4">
          <button
            type="button"
            className="button-secondary w-full justify-between text-[12px]"
            onClick={() => setShowFinalPreview((open) => !open)}
          >
            <span>
              Preview Reassembled Clean Contract ({applied.appliedCount} applied)
            </span>
            {showFinalPreview ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {showFinalPreview && (
            <pre className="diff-text custom-scrollbar mt-3 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)]">
              {applied.updatedText}
            </pre>
          )}
        </section>
      )}

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
            {audit.redFlags.map((flag, index) => {
              const rawClause = flag.clause?.trim() ?? "";
              const formattedClause = /^\d+(?:\.\d+)*$/.test(rawClause)
                ? `Section ${rawClause}`
                : rawClause;
              const inlineClause =
                formattedClause.length > 0 && formattedClause.length <= 36;

              return (
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
                      {inlineClause && (
                        <span className="pill pill-neutral type-pill !py-0 !px-1.5 text-[10px]">
                          {formattedClause}
                        </span>
                      )}
                    </div>
                    {formattedClause && !inlineClause && (
                      <div className="type-meta mt-0.5 text-[var(--text-faint)]">
                        {formattedClause}
                      </div>
                    )}
                    <p className="type-meta m-0 mt-0.5 text-[var(--text-muted)]">
                      {flag.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="type-meta m-0 text-[var(--text-faint)]">
            No material red flags were returned for this packet.
          </p>
        )}
      </section>
    </div>
  );
}
