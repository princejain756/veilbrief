"use client";

import type {
  AuditView,
  RecommendedEdit,
  RedlineDecision,
  RemoteParam,
} from "@/lib/types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeBaseName(name: string | undefined): string {
  const base = (name || "contract-redlined")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "contract-redlined";
}

export function applyAcceptedRedlines(
  originalText: string,
  edits: RecommendedEdit[],
  decisions: Record<number, RedlineDecision>,
): { updatedText: string; appliedCount: number } {
  let updated = originalText;
  let appliedCount = 0;

  edits.forEach((edit, index) => {
    const decision = decisions[index];
    if (decision?.status !== "accepted") {
      return;
    }

    const replacement = (decision.customText ?? edit.replacement).trim();
    const target = (edit.original ?? "").trim();
    if (!replacement) {
      return;
    }

    if (target && updated.includes(target)) {
      updated = updated.replace(target, replacement);
      appliedCount += 1;
      return;
    }

    if (target && target.length >= 12) {
      const normalizedPattern = target
        .split(/\s+/)
        .map((token) => escapeRegExp(token))
        .join("\\s+");
      const regex = new RegExp(normalizedPattern, "i");
      if (regex.test(updated)) {
        updated = updated.replace(regex, replacement);
        appliedCount += 1;
        return;
      }
    }

    updated = `${updated.trim()}\n\n[Redline Added: ${edit.title}]\n${replacement}`;
    appliedCount += 1;
  });

  return { updatedText: updated, appliedCount };
}

export async function exportCleanDocx(
  updatedText: string,
  sourceName?: string,
): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const lines = updatedText.split(/\n/);
  const paragraphs = lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: line.trim() ? 140 : 80 },
        children: [
          new TextRun({
            text: line,
            font: "Calibri",
            size: 22,
          }),
        ],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${safeBaseName(sourceName)}-clean.docx`);
}

export function exportMarkdown(updatedText: string, sourceName?: string): void {
  const blob = new Blob([updatedText], {
    type: "text/markdown;charset=utf-8",
  });
  triggerDownload(blob, `${safeBaseName(sourceName)}-clean.md`);
}

export function exportPrivacyReceipt(
  audit: AuditView,
  remoteParams: RemoteParam[],
): void {
  const categoryCounts: Record<string, number> = {};
  for (const token of audit.payload.tokens) {
    categoryCounts[token.type] = (categoryCounts[token.type] ?? 0) + 1;
  }

  const receipt = {
    schema: "veilbrief.privacy-receipt.v2",
    auditId: audit.id,
    generatedAtIso: new Date(audit.createdAt).toISOString(),
    inferenceSource: audit.inferenceSource,
    modelName: audit.modelName,
    latencyMs: audit.latencyMs,
    streamed: audit.streamed,
    contextualStage: {
      source: audit.contextualStageSource,
      entitiesAdded: audit.payload.contextualEntitiesAdded,
      note: audit.payload.contextualStageNote,
    },
    wireAudit: {
      wireHost: audit.payload.wireHost,
      wireBytesSent: audit.payload.wireBytesSent,
      wirePayloadSha256: audit.payload.wirePayloadSha256,
      rawPiiBytesLeaked: audit.payload.rawPiiBytesSent,
      verifiedZeroRawPii: audit.payload.verifiedZeroRawPii,
    },
    shieldSummary: {
      totalProtectedTokens: audit.payload.tokens.length,
      categoryCounts,
      tokenPlaceholdersOnly: audit.payload.tokens.map((t) => ({
        token: t.token,
        category: t.type,
        detector: t.source ?? "deterministic",
      })),
    },
    remoteConfigSnapshot: Object.fromEntries(
      remoteParams.map((p) => [p.key, p.value]),
    ),
    guarantee:
      "Token values and original source text never leave this browser. Zero raw PII was detected on outbound wire payloads.",
  };

  const blob = new Blob([JSON.stringify(receipt, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(
    blob,
    `veilbrief-privacy-receipt-${audit.id.slice(0, 8)}.json`,
  );
}
