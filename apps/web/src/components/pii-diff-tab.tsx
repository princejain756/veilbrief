"use client";

import { Check, CloudOff, Copy, Fingerprint, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { formatBytes, formatInteger, shortDigest } from "@/lib/format";
import type { AuditView } from "@/lib/types";

interface PiiDiffTabProps {
  audit: AuditView;
}

export function PiiDiffTab({ audit }: PiiDiffTabProps) {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedSha, setCopiedSha] = useState(false);
  const [wireMode, setWireMode] = useState<"scrubbed" | "http">("scrubbed");

  const clean = audit.payload.rawPiiBytesSent === 0;
  const localOnly = audit.inferenceSource === "ON_DEVICE";
  const rightContent =
    wireMode === "http" && audit.payload.wirePayloadPreview
      ? audit.payload.wirePayloadPreview
      : audit.payload.scrubbedText;

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(rightContent);
      setCopiedPayload(true);
      window.setTimeout(() => setCopiedPayload(false), 1600);
    } catch {
      setCopiedPayload(false);
    }
  }

  async function copySha() {
    if (!audit.payload.wirePayloadSha256) return;
    try {
      await navigator.clipboard.writeText(audit.payload.wirePayloadSha256);
      setCopiedSha(true);
      window.setTimeout(() => setCopiedSha(false), 1600);
    } catch {
      setCopiedSha(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`pill type-pill ${
              clean ? "pill-emerald" : "pill-crimson"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <strong className="font-[700]">
              {audit.payload.rawPiiBytesSent === 0
                ? "0 raw PII bytes leaked (verified)"
                : `${formatBytes(audit.payload.rawPiiBytesSent)} raw PII detected`}
            </strong>
          </span>
          <span className="pill pill-neutral type-pill">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {localOnly ? "Cloud skipped" : audit.payload.wireHost ?? "Scrubbed escalation"}
          </span>
        </div>
        <button
          type="button"
          className="button-secondary !min-h-7 !px-2 text-[11px]"
          onClick={() => void copyPayload()}
        >
          {copiedPayload ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copiedPayload ? "Copied" : wireMode === "http" ? "Copy Wire JSON" : "Copy Scrubbed"}
        </button>
      </div>

      <div className="grid gap-2 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-3 text-[12px] sm:grid-cols-3">
        <div>
          <div className="type-table-head text-[var(--text-faint)]">Wire Host</div>
          <div className="font-code mt-0.5 truncate text-[11px] text-[var(--text-ink)]">
            {audit.payload.wireHost ?? "None (On-Device Execution)"}
          </div>
        </div>
        <div>
          <div className="type-table-head text-[var(--text-faint)]">Wire Bytes</div>
          <div className="numeral font-code mt-0.5 text-[11px] text-[var(--text-ink)]">
            {formatBytes(audit.payload.wireBytesSent)}
          </div>
        </div>
        <div>
          <div className="type-table-head text-[var(--text-faint)]">
            Wire Payload SHA-256
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-code truncate text-[11px] text-[var(--text-ink)]">
              {shortDigest(audit.payload.wirePayloadSha256)}
            </span>
            {audit.payload.wirePayloadSha256 && (
              <button
                type="button"
                className="button-ghost !min-h-5 !px-1 text-[10px]"
                onClick={() => void copySha()}
                title="Copy full SHA-256 hex digest"
              >
                <Fingerprint className="h-3 w-3" aria-hidden="true" />
                {copiedSha ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-meta m-0 text-[var(--text-muted)]">
          Stage 1B note: {audit.payload.contextualStageNote}
        </p>
        {audit.payload.wirePayloadSha256 && (
          <div className="flex items-center gap-1 rounded-[6px] border border-[var(--border-line)] p-0.5 text-[11px]">
            <button
              type="button"
              className={`rounded-[5px] px-2 py-1 ${
                wireMode === "scrubbed"
                  ? "bg-[var(--bg-subtle)] font-[600] text-[var(--text-ink)]"
                  : "text-[var(--text-muted)]"
              }`}
              onClick={() => setWireMode("scrubbed")}
            >
              Scrubbed Text
            </button>
            <button
              type="button"
              className={`rounded-[5px] px-2 py-1 ${
                wireMode === "http"
                  ? "bg-[var(--bg-subtle)] font-[600] text-[var(--text-ink)]"
                  : "text-[var(--text-muted)]"
              }`}
              onClick={() => setWireMode("http")}
            >
              Raw HTTP Body
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="diff-column">
          <div className="flex items-center justify-between border-b border-[var(--border-line)] px-3 py-2">
            <span className="type-table-head text-[var(--text-faint)]">
              Original (Local Only)
            </span>
            <span className="numeral type-meta text-[var(--text-faint)]">
              {formatInteger(audit.payload.originalText.length)} chars
            </span>
          </div>
          <pre className="diff-text custom-scrollbar">
            {audit.payload.originalText || "Image-only packet"}
          </pre>
        </div>

        <div className="diff-column">
          <div className="flex items-center justify-between border-b border-[var(--border-line)] px-3 py-2">
            <span className="type-table-head text-[var(--text-faint)]">
              {wireMode === "http" ? "Exact HTTP Wire JSON" : "Scrubbed Prompt"}
            </span>
            <span className="numeral type-meta text-[var(--text-faint)]">
              {formatInteger(rightContent.length)} chars
            </span>
          </div>
          <pre className="diff-text custom-scrollbar">
            {rightContent || "Image-only packet"}
          </pre>
        </div>
      </div>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="type-table-head text-[var(--text-faint)]">
            Local token vault
          </span>
          <span className="numeral type-meta text-[var(--text-faint)]">
            {formatInteger(audit.payload.tokens.length)} local entities
          </span>
        </div>
        {audit.payload.tokens.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--border-line)]">
                  <th className="type-table-head py-2 pr-3 text-[var(--text-faint)]">
                    Token
                  </th>
                  <th className="type-table-head py-2 pr-3 text-[var(--text-faint)]">
                    Local Value
                  </th>
                  <th className="type-table-head py-2 pr-3 text-[var(--text-faint)]">
                    Type
                  </th>
                  <th className="type-table-head py-2 text-[var(--text-faint)]">
                    Detector
                  </th>
                </tr>
              </thead>
              <tbody>
                {audit.payload.tokens.map((token) => (
                  <tr
                    key={token.token}
                    className="border-b border-[var(--border-line)] last:border-0"
                  >
                    <td className="py-2 pr-3 align-top">
                      <span className="token-chip">{token.token}</span>
                    </td>
                    <td className="type-table-cell py-2 pr-3 align-top text-[var(--text-ink)]">
                      {token.original}
                    </td>
                    <td className="type-table-cell py-2 pr-3 align-top text-[var(--text-muted)]">
                      {token.type}
                    </td>
                    <td className="type-table-cell py-2 align-top text-[var(--text-faint)]">
                      {token.source === "on_device_context"
                        ? "Stage 1B Nano"
                        : "Stage 1A Shield"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="type-meta m-0 text-[var(--text-faint)]">
            No PII tokens were detected in this packet.
          </p>
        )}
      </section>
    </div>
  );
}
