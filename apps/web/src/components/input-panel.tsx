"use client";

import {
  FileImage,
  FileText,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Play,
  ReceiptText,
  Scale,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { formatBytes, formatChars, formatInteger } from "@/lib/format";
import type { InferenceMode, Scenario } from "@/lib/types";

interface InputPanelProps {
  scenarios: Scenario[];
  selectedScenarioId: string;
  text: string;
  imageDataUrl: string | null;
  imageName: string;
  imageSize: number;
  imageLoading: boolean;
  mode: InferenceMode;
  forcedOffline: boolean;
  maxOnDeviceChars: number;
  running: boolean;
  progressLabel: string;
  progress: number;
  error: string;
  onTextChange: (value: string) => void;
  onScenarioSelect: (scenario: Scenario) => void;
  onFileSelected: (file: File) => void;
  onClearImage: () => void;
  onModeChange: (mode: InferenceMode) => void;
  onRun: () => void;
}

const scenarioIcons = {
  "freelance-msa": Scale,
  "medical-invoice": ReceiptText,
  "enterprise-dpa": FileText,
};

const scenarioTone = {
  emerald: {
    icon: "text-[var(--status-emerald-ink)]",
    soft: "bg-[var(--status-emerald-soft)]",
  },
  cobalt: {
    icon: "text-[var(--status-cobalt-ink)]",
    soft: "bg-[var(--status-cobalt-soft)]",
  },
  amber: {
    icon: "text-[var(--status-amber-ink)]",
    soft: "bg-[var(--status-amber-soft)]",
  },
} as const;

export function InputPanel({
  scenarios,
  selectedScenarioId,
  text,
  imageDataUrl,
  imageName,
  imageSize,
  imageLoading,
  mode,
  forcedOffline,
  maxOnDeviceChars,
  running,
  progressLabel,
  progress,
  error,
  onTextChange,
  onScenarioSelect,
  onFileSelected,
  onClearImage,
  onModeChange,
  onRun,
}: InputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hasInput = Boolean(text.trim() || imageDataUrl);
  const overLimit = text.length > maxOnDeviceChars;

  function handleFile(file: File | undefined) {
    if (!file) return;
    onFileSelected(file);
  }

  return (
    <section className="app-card flex min-h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-line)] px-4 py-3">
        <div>
          <h2 className="type-section">Input packet</h2>
          <p className="type-meta mt-0.5 text-[var(--text-faint)]">
            Contract text and multimodal evidence
          </p>
        </div>
        <div className="pill pill-neutral type-pill">
          <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Local preflight</span>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="type-kpi-label text-[var(--text-muted)]">
              Sample scenarios
            </span>
            <span className="type-meta text-[var(--text-faint)]">
              One click to load
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {scenarios.map((scenario) => {
              const Icon = scenarioIcons[scenario.id] ?? FileText;
              const tone = scenarioTone[scenario.accent];
              const selected = scenario.id === selectedScenarioId;

              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => onScenarioSelect(scenario)}
                  className={`group min-h-[4.25rem] rounded-[7px] border p-2.5 text-left transition-colors ${
                    selected
                      ? "border-[var(--status-cobalt)] bg-[var(--status-cobalt-soft)]"
                      : "border-[var(--border-line)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
                  }`}
                  aria-pressed={selected}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] ${tone.soft} ${tone.icon}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-[600] leading-4 text-[var(--text-ink)]">
                        {scenario.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-[14px] text-[var(--text-faint)]">
                        {scenario.description}
                      </span>
                    </span>
                  </div>
                  <div className="numeral mt-2 text-[10px] text-[var(--text-faint)]">
                    {scenario.estimatedChars
                      ? `${formatInteger(scenario.estimatedChars)} chars`
                      : "Image OCR"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="contract-text"
              className="type-kpi-label text-[var(--text-muted)]"
            >
              Document text
            </label>
            <span
              className={`numeral type-meta ${
                overLimit
                  ? "text-[var(--status-amber-ink)]"
                  : "text-[var(--text-faint)]"
              }`}
            >
              {formatChars(text.length)}
            </span>
          </div>
          <textarea
            id="contract-text"
            className="app-field custom-scrollbar h-[10.5rem] resize-y p-3 text-[13px] leading-[21px]"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="Paste a contract, invoice narrative, or policy excerpt. Text stays local until a scrubbed prompt is explicitly routed to cloud."
            spellCheck={false}
          />
          {overLimit && (
            <p className="type-meta mt-1.5 text-[var(--status-amber-ink)]">
              This packet exceeds the {formatInteger(maxOnDeviceChars)} character
              on-device limit. Hybrid mode may scrub and escalate it.
            </p>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="type-kpi-label text-[var(--text-muted)]">
              Image evidence
            </span>
            <span className="type-meta text-[var(--text-faint)]">
              PNG or JPEG, inline multimodal input
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />

          {imageLoading ? (
            <div className="flex min-h-[5rem] items-center justify-center gap-2 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)] px-3 text-[12px] text-[var(--text-muted)]">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading inline PNG evidence
            </div>
          ) : imageDataUrl ? (
            <div className="flex items-center gap-3 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-2.5">
              <div className="relative h-[4.5rem] w-[6rem] shrink-0 overflow-hidden rounded-[6px] border border-[var(--border-line)] bg-[var(--bg-surface)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="Attached image evidence"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-[600] text-[var(--text-ink)]">
                  {imageName || "Attached invoice"}
                </div>
                <div className="numeral type-meta mt-0.5 text-[var(--text-faint)]">
                  {imageSize ? formatBytes(imageSize) : "Sample PNG"}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    className="button-ghost !min-h-6 !px-1.5 text-[11px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    Replace
                  </button>
                  <button
                    type="button"
                    className="button-ghost !min-h-6 !px-1.5 text-[11px] text-[var(--status-crimson-ink)]"
                    onClick={onClearImage}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`group flex min-h-[5rem] w-full items-center justify-center gap-3 rounded-[7px] border border-dashed px-3 py-3 text-left transition-colors ${
                dragging
                  ? "drop-active"
                  : "border-[var(--border-strong)] bg-[var(--bg-subtle)] hover:border-[var(--status-cobalt)]"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[12px] font-[600] text-[var(--text-ink)]">
                  Drop invoice image or browse
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--text-faint)]">
                  The original image is never stored in Firestore
                </span>
              </span>
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label
              htmlFor="inference-mode"
              className="type-kpi-label mb-1.5 block text-[var(--text-muted)]"
            >
              Inference mode
            </label>
            <select
              id="inference-mode"
              className="app-field h-9 px-2.5 text-[12px]"
              value={mode}
              onChange={(event) =>
                onModeChange(event.target.value as InferenceMode)
              }
              disabled={running}
            >
              <option value="auto">Auto Hybrid (Prefer On-Device)</option>
              <option value="local">Strict Local (Only On-Device)</option>
              <option value="cloud">Scrubbed Cloud Deep Audit</option>
            </select>
            <p className="type-meta mt-1 text-[var(--text-faint)]">
              {forcedOffline
                ? "Offline mode forces local execution until cloud access is re-enabled."
                : imageDataUrl
                  ? "Image pixels stay on-device. Text scrubbing does not make an uploaded image safe for cloud egress."
                  : "Hybrid sends only the shielded text payload when local context is insufficient."}
            </p>
          </div>

          <div className="min-w-[10.5rem]">
            <span className="type-kpi-label mb-1.5 block text-[var(--text-muted)]">
              Local PII shield
            </span>
            <span className="flex h-9 items-center gap-1.5 rounded-[7px] border border-[color-mix(in_srgb,var(--status-emerald)_38%,transparent)] bg-[var(--status-emerald-soft)] px-2.5 text-[12px] font-[570] text-[var(--status-emerald-ink)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Active
            </span>
          </div>
        </div>

        {error && (
          <div
            className="mt-3 rounded-[7px] border border-[color-mix(in_srgb,var(--status-crimson)_30%,transparent)] bg-[var(--status-crimson-soft)] px-3 py-2 text-[12px] leading-[18px] text-[var(--status-crimson-ink)]"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-line)] bg-[var(--bg-subtle)] p-3">
        {running && (
          <div className="mb-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-[570] text-[var(--text-muted)]">
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                {progressLabel}
              </span>
              <span className="numeral text-[11px] text-[var(--text-faint)]">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--border-line)]">
              <div
                className="h-full rounded-full bg-[var(--status-emerald)] transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          className="button-primary min-h-10 w-full"
          onClick={onRun}
          disabled={running || imageLoading || !hasInput}
        >
          {running ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          )}
          {running ? "Auditing document" : "Run Hybrid Audit"}
        </button>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-[var(--text-faint)]">
          <FileImage className="h-3 w-3" aria-hidden="true" />
          Raw source text is not written to Firestore
        </div>
      </div>
    </section>
  );
}
