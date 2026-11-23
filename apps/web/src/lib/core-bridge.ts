"use client";

import {
  DEFAULT_REMOTE_CONFIG,
  isSupportedCloudModel,
  ON_DEVICE_MODEL_LABEL,
  probeOnDeviceAvailability,
  runHybridAudit,
  shieldPii,
} from "@veilbrief/core";
import type { HybridRemoteConfig } from "@veilbrief/core";
import type { AI } from "firebase/ai";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type {
  AuditPayload,
  AuditView,
  DeviceState,
  InferenceMode,
  InferenceSource,
  PiiToken,
  RemoteParam,
  RiskLevel,
} from "@/lib/types";

interface LanguageModelMonitor extends EventTarget {
  addEventListener(
    type: "downloadprogress",
    listener: (event: Event & { loaded?: number; total?: number }) => void,
  ): void;
}

interface LanguageModelApi {
  availability?: () => Promise<string>;
  create?: (options?: {
    monitor?: (monitor: LanguageModelMonitor) => void;
    systemPrompt?: string;
    initialPrompts?: Array<{
      role: "system" | "user" | "assistant";
      content: Array<{ type: "text"; value: string }>;
    }>;
  }) => Promise<{ destroy?: () => void | Promise<void> }>;
}

interface LanguageModelWindow {
  LanguageModel?: LanguageModelApi;
  ai?: {
    languageModel?: LanguageModelApi;
  };
}

let onDeviceSession: { destroy?: () => void | Promise<void> } | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function languageModelApi(): LanguageModelApi | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as LanguageModelWindow;
  return scope.LanguageModel ?? scope.ai?.languageModel;
}

function normalizeProgress(value: unknown): number {
  const record = asRecord(value);
  const raw =
    typeof value === "number"
      ? value
      : asNumber(record.loaded) ?? asNumber(record.progress) ?? 0;
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, normalized));
}

function remoteValue(param: RemoteParam): string | number | boolean {
  if (param.type === "number") {
    return asNumber(param.value) ?? 0;
  }
  if (param.type === "boolean") {
    return param.value === "true";
  }
  return param.value;
}

export function getDefaultRemoteParams(): RemoteParam[] {
  return [
    {
      key: "cloud_model_name",
      label: "Cloud model",
      value: DEFAULT_REMOTE_CONFIG.cloud_model_name,
      type: "string",
    },
    {
      key: "cloud_fallback_model",
      label: "Fallback model",
      value: DEFAULT_REMOTE_CONFIG.cloud_fallback_model,
      type: "string",
    },
    {
      key: "default_inference_mode",
      label: "Default route",
      value: DEFAULT_REMOTE_CONFIG.default_inference_mode,
      type: "string",
    },
    {
      key: "max_on_device_chars",
      label: "On-device limit",
      value: String(DEFAULT_REMOTE_CONFIG.max_on_device_chars),
      type: "number",
    },
    {
      key: "enforce_local_pii_shield",
      label: "Local PII shield",
      value: String(DEFAULT_REMOTE_CONFIG.enforce_local_pii_shield),
      type: "boolean",
    },
  ];
}

export function configFromRemoteParams(
  params: RemoteParam[],
): HybridRemoteConfig {
  const byKey = new Map(params.map((param) => [param.key, param]));
  const stringValue = (key: string, fallback: string) => {
    const param = byKey.get(key);
    return param?.value.trim() || fallback;
  };
  const numberValue = (key: string, fallback: number) => {
    const param = byKey.get(key);
    const value = param ? remoteValue(param) : fallback;
    return typeof value === "number" && value > 0 ? value : fallback;
  };

  const rawMode = stringValue(
    "default_inference_mode",
    DEFAULT_REMOTE_CONFIG.default_inference_mode,
  );
  const mode =
    rawMode === "only_on_device" ||
    rawMode === "prefer_in_cloud" ||
    rawMode === "only_in_cloud"
      ? rawMode
      : "prefer_on_device";

  function modelValue(key: "cloud_model_name" | "cloud_fallback_model") {
    const model = stringValue(key, DEFAULT_REMOTE_CONFIG[key]).trim();
    return isSupportedCloudModel(model) ? model : DEFAULT_REMOTE_CONFIG[key];
  }

  return {
    cloud_model_name: modelValue("cloud_model_name"),
    cloud_fallback_model: modelValue("cloud_fallback_model"),
    default_inference_mode: mode,
    max_on_device_chars: numberValue(
      "max_on_device_chars",
      DEFAULT_REMOTE_CONFIG.max_on_device_chars,
    ),
    enforce_local_pii_shield:
      stringValue(
        "enforce_local_pii_shield",
        String(DEFAULT_REMOTE_CONFIG.enforce_local_pii_shield),
      ) === "true",
  };
}

export async function probeDevice(): Promise<DeviceState> {
  if (typeof window === "undefined") {
    return {
      status: "checking",
      progress: 0,
      message: "Checking browser capabilities.",
    };
  }

  const api = languageModelApi();
  if (!api) {
    return {
      status: "unavailable",
      progress: 0,
      message:
        "Cloud shield active. Enable Chrome Prompt API flags if you want local Gemini Nano weights.",
    };
  }

  try {
    const availability = await Promise.resolve(
      api.availability?.() ?? probeOnDeviceAvailability(),
    );

    if (availability === "unavailable") {
      return {
        status: "unavailable",
        progress: 0,
        message:
          "Chrome Built-in AI unavailable on this profile. Cloud Shield executes with local PII redaction.",
      };
    }

    if (availability === "downloading") {
      return {
        status: "available",
        progress: 0,
        message:
          "Gemini Nano weights are downloading. Prepare On-Device Model to attach progress.",
      };
    }

    if (availability === "downloadable") {
      return {
        status: "available",
        progress: 0,
        message:
          "Gemini Nano weights are ready to download with a single click.",
      };
    }

    if (availability === "available") {
      return {
        status: "ready",
        progress: 1,
        message: `${ON_DEVICE_MODEL_LABEL} is ready offline and online.`,
      };
    }

    return {
      status: "available",
      progress: 0,
      message:
        "Chrome exposes LanguageModel. Prepare On-Device Model to verify readiness.",
    };
  } catch (error) {
    return {
      status: "unavailable",
      progress: 0,
      message:
        error instanceof Error
          ? error.message
          : "The on-device availability probe failed.",
    };
  }
}

export async function prepareDevice(
  onProgress: (progress: number) => void,
): Promise<DeviceState> {
  const api = languageModelApi();
  if (!api?.create) {
    return {
      status: "unavailable",
      progress: 0,
      message:
        "LanguageModel API is unavailable in this Chrome profile. See the On-Device Setup guide or continue in Cloud Shield mode.",
    };
  }

  try {
    onProgress(0.04);
    if (!onDeviceSession) {
      onDeviceSession = await api.create({
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            onProgress(normalizeProgress(event));
          });
        },
        initialPrompts: [
          {
            role: "system",
            content: [
              {
                type: "text",
                value:
                  "You inspect private contracts locally. Preserve all protected tokens and never invent data.",
              },
            ],
          },
        ],
      });
    }
    onProgress(1);
    return {
      status: "ready",
      progress: 1,
      message: `${ON_DEVICE_MODEL_LABEL} is active for local inference.`,
    };
  } catch (error) {
    onDeviceSession = null;
    return {
      status: "unavailable",
      progress: 0,
      message:
        error instanceof Error
          ? error.message
          : "The on-device model could not be initialized.",
    };
  }
}

function requestedMode(mode: InferenceMode) {
  if (mode === "local") return "only_on_device" as const;
  if (mode === "cloud") return "only_in_cloud" as const;
  return undefined;
}

function normalizeSource(value: string): InferenceSource {
  if (value === "on_device") return "ON_DEVICE";
  if (value === "in_cloud") return "IN_CLOUD";
  return "UNKNOWN";
}

function normalizeRisk(value: string | RiskLevel): RiskLevel {
  return value === "critical" || value === "high" || value === "medium"
    ? value
    : "low";
}

function tokenRows(
  entities: Array<{
    token: string;
    category: string;
    original: string;
    source?: "deterministic" | "on_device_context";
  }>,
): PiiToken[] {
  const seen = new Map<string, PiiToken>();
  for (const entity of entities) {
    if (!seen.has(entity.token)) {
      seen.set(entity.token, {
        token: entity.token,
        original: entity.original,
        type: entity.category,
        source: entity.source ?? "deterministic",
      });
    }
  }
  return Array.from(seen.values());
}

function dataUrlImage(value: string | undefined) {
  if (!value) return undefined;
  const match = value.match(/^data:(image\/png|image\/jpeg);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Image evidence must be a base64 PNG or JPEG data URL.");
  }
  return {
    base64: match[2],
    mimeType: match[1] as "image/png" | "image/jpeg",
  };
}

export interface AuditRequest {
  text: string;
  imageDataUrl?: string;
  mode: InferenceMode;
  forceOffline: boolean;
  maskAmounts: boolean;
  config: HybridRemoteConfig;
  ai: AI;
  auth?: Auth;
  firestore?: Firestore;
  onProgress?: (label: string, progress: number) => void;
  onStreamChunk?: (partialText: string) => void;
}

export async function executeAudit(
  request: AuditRequest,
): Promise<AuditView & { persistenceFailed: boolean }> {
  if (!request.text.trim() && !request.imageDataUrl) {
    throw new Error("Add contract text, a PDF/DOCX file, or image before auditing.");
  }

  const image = dataUrlImage(request.imageDataUrl);
  let routeMode = requestedMode(request.mode);

  if (image && routeMode === "only_in_cloud") {
    throw new Error(
      "Image pixels cannot be scrubbed reliably. Keep image evidence on-device or remove the image before a cloud audit.",
    );
  }
  if (image) routeMode = "only_on_device";

  request.onProgress?.("Stage 1A: Deterministic PII shield & policy route", 0.14);

  const result = await runHybridAudit({
    platform: "web",
    text: request.text,
    ai: request.ai,
    auth: request.auth ?? null,
    firestore: request.firestore ?? null,
    config: request.config,
    image,
    isOffline: request.forceOffline,
    requestedMode: routeMode,
    maskAmounts: request.maskAmounts,
    enableContextualOnDeviceScrub: true,
    persist: Boolean(request.auth?.currentUser && request.firestore),
    onStageUpdate: (stage, detail) => {
      if (stage === "Stage 1B") {
        request.onProgress?.(`${stage}: ${detail}`, 0.34);
      } else if (stage === "Stage 2") {
        request.onProgress?.(`${stage}: ${detail}`, 0.58);
      }
    },
    onDeviceProgress: (value: number) => {
      request.onProgress?.(
        `Preparing ${ON_DEVICE_MODEL_LABEL}`,
        0.22 + normalizeProgress(value) * 0.45,
      );
    },
    onStreamChunk: request.onStreamChunk,
  });

  request.onProgress?.("Verifying wire SHA-256 & rehydrating redlines", 0.94);

  const inferenceSource = normalizeSource(result.inferenceSource);
  const tokens = tokenRows(result.shield.entities);
  const contextualStageNote = result.contextualStage.source === "on_device"
    ? `${result.contextualStage.entitiesAdded} contextual phrases scrubbed locally (${result.contextualStage.latencyMs.toLocaleString("en-US")} ms)`
    : result.contextualStage.reason ?? "Contextual Nano pass skipped";

  const payload: AuditPayload = {
    originalText: request.text,
    scrubbedText: result.shield.scrubbed,
    wirePayloadPreview: result.wirePayloadPreview || result.shield.scrubbed,
    wireHost: result.egressAudit.wireHost,
    wireBytesSent: result.egressAudit.wireBytesSent,
    wirePayloadSha256: result.egressAudit.wirePayloadSha256,
    verifiedZeroRawPii: result.egressAudit.verifiedZeroRawPii,
    tokens,
    rawPiiBytesSent: result.egressAudit.rawPiiBytesLeaked,
    contextualEntitiesAdded: result.contextualStage.entitiesAdded,
    contextualStageNote,
  };

  return {
    id:
      result.persistedAuditId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}`),
    createdAt: Date.now(),
    inferenceSource,
    modelName: result.modelUsed,
    latencyMs: result.latencyMs,
    persistenceFailed: result.persistenceFailed,
    riskLevel: normalizeRisk(result.audit.riskLevel),
    executiveSummary:
      result.audit.summary ||
      "The audit completed. Review each flagged item and accept or edit suggested counter-clauses.",
    redFlags: result.audit.redFlags.map((flag) => ({
      title: flag.title,
      detail: flag.explanation,
      severity: normalizeRisk(flag.severity),
      clause: flag.clause,
    })),
    recommendedEdits: result.audit.recommendedEdits.map((edit) => ({
      title: edit.title,
      original: edit.currentText,
      replacement: edit.suggestedText,
      rationale: edit.rationale,
    })),
    payload,
    mode: request.mode,
    platform: "web",
    streamed: result.streamed,
    contextualStageSource: result.contextualStage.source,
  };
}

export function computePreflightShield(
  text: string,
  maskAmounts = true,
): { count: number; categories: string[] } {
  if (!text.trim()) return { count: 0, categories: [] };
  const shield = shieldPii(text, { maskAmounts });
  const uniqueTokens = new Set(shield.entities.map((e) => e.token));
  const categories = [...new Set(shield.entities.map((e) => e.category))];
  return { count: uniqueTokens.size, categories };
}
