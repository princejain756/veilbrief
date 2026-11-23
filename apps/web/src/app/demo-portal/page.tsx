"use client";

import Link from "next/link";
import { useState } from "react";
import { SAMPLE_SCENARIOS } from "@veilbrief/core";

export default function DemoPortalPage() {
  const defaultContract = SAMPLE_SCENARIOS[0]?.text ?? "";
  const [clauses, setClauses] = useState<string[]>(() =>
    defaultContract.split("\n\n").filter(Boolean),
  );
  const [draftAgreement, setDraftAgreement] = useState(defaultContract);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-line)] pb-4">
          <div>
            <div className="type-table-head text-[var(--status-cobalt-ink)]">
              Cobalt Harbor Consulting Portal (Synthetic Test Target)
            </div>
            <h1 className="type-page mt-1">Contractor MSA Signature Portal</h1>
            <p className="type-meta mt-1 text-[var(--text-muted)]">
              Select any clause below, right-click &quot;Audit Privately with VeilBrief&quot;, or apply redlines inline from the VeilBrief Chrome Extension side panel.
            </p>
          </div>
          <Link href="/" className="button-secondary text-[12px]">
            Back to Workbench
          </Link>
        </header>

        <section className="app-card divide-y divide-[var(--border-line)]">
          {clauses.map((block, index) => (
            <div
              key={`${index}-${block.slice(0, 12)}`}
              data-veilbrief-clause={index}
              className="p-4 text-[13px] leading-6 text-[var(--text-ink)] whitespace-pre-wrap"
            >
              {block}
            </div>
          ))}
        </section>

        <section className="app-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="portal-contract-editor"
              className="type-section"
            >
              Editable Portal Draft (Live Extension Target)
            </label>
            <button
              type="button"
              className="button-ghost !min-h-7 !px-2 text-[11px]"
              onClick={() => {
                setDraftAgreement(defaultContract);
                setClauses(defaultContract.split("\n\n").filter(Boolean));
              }}
            >
              Reset Agreement
            </button>
          </div>
          <textarea
            id="portal-contract-editor"
            className="app-field custom-scrollbar h-64 p-3 text-[13px] leading-6"
            value={draftAgreement}
            onChange={(e) => {
              const next = e.target.value;
              setDraftAgreement(next);
              setClauses(next.split("\n\n").filter(Boolean));
            }}
          />
        </section>
      </div>
    </div>
  );
}
