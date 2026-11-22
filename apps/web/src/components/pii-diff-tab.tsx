"use client";

import { Check, CloudOff, Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { formatBytes, formatInteger } from "@/lib/format";
import type { AuditView } from "@/lib/types";

interface PiiDiffTabProps {
  audit: AuditView;
}

export function PiiDiffTab({ audit }: PiiDiffTabProps) {
  const [copied, setCopied] = useState(false);
  const clean = audit.payload.rawPiiBytesSent === 0;
  const localOnly = audit.inferenceSource === "ON_DEVICE";

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(audit.payload.scrubbedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
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
                ? "0 raw PII bytes sent"
                : `${formatBytes(audit.payload.rawPiiBytesSent)} raw PII bytes sent`}
            </strong>
          </span>
          <span className="pill pill-neutral type-pill">
            <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
            {localOnly ? "Cloud skipped" : "Scrubbed escalation"}
          </span>
        </div>
        <button
          type="button"
          className="button-secondary !min-h-7 !px-2 text-[11px]"
          onClick={copyPayload}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied payload" : "Copy scrubbed payload"}
        </button>
      </div>

      <p className="type-meta m-0 text-[var(--text-muted)]">
        {localOnly
          ? "Local inference completed. This shield check shows the exact scrubbed payload available for a future cloud escalation."
          : "The right column is the exact shielded payload sent to the cloud model. The left column stays on this device."}
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="diff-column">
          <div className="flex items-center justify-between border-b border-[var(--border-line)] px-3 py-2">
            <span className="type-table-head text-[var(--text-faint)]">
              Original
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
              Scrubbed payload
            </span>
            <span className="numeral type-meta text-[var(--text-faint)]">
              {formatInteger(audit.payload.scrubbedText.length)} chars
            </span>
          </div>
          <pre className="diff-text custom-scrollbar">
            {audit.payload.scrubbedText || "Image-only packet"}
          </pre>
        </div>
      </div>

      <section className="border-t border-[var(--border-line)] pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="type-table-head text-[var(--text-faint)]">
            Token mapping
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
                    Entity
                  </th>
                  <th className="type-table-head py-2 text-[var(--text-faint)]">
                    Type
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
                    <td className="type-table-cell py-2 align-top text-[var(--text-muted)]">
                      {token.type}
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
