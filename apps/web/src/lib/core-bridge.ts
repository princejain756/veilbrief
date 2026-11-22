"use client";

import {
  DEFAULT_REMOTE_CONFIG,
  isSupportedCloudModel,
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
    listener: (event: Event & { loaded?: number; total?: number }) => void
  ): void;
}

interface LanguageModelApi {
  availability?: () => Promise<string>;
  create?: (options?: {
    monitor?: (monitor: LanguageModelMonitor) => void;
    systemPrompt?: string;
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

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
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
  params: RemoteParam[]
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
    DEFAULT_REMOTE_CONFIG.default_inference_mode
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
      DEFAULT_REMOTE_CONFIG.max_on_device_chars
    ),
    enforce_local_pii_shield:
      stringValue(
        "enforce_local_pii_shield",
        String(DEFAULT_REMOTE_CONFIG.enforce_local_pii_shield)
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
        "Chrome LanguageModel is not available here. Open this page in a desktop Chrome build with Gemini Nano enabled.",
    };
  }

  try {
    const availability = await Promise.resolve(
      api.availability?.() ?? probeOnDeviceAvailability()
    );

    if (availability === "unavailable") {
      return {
        status: "unavailable",
        progress: 0,
        message:
          "Gemini Nano is unavailable on this device. Check Chrome built-in AI settings and hardware requirements.",
      };
    }

    if (availability === "downloading") {
      return {
        status: "available",
        progress: 0,
        message:
          "Gemini Nano is downloading. Use Initialize On-Device Model to attach the download monitor.",
      };
    }

    if (availability === "downloadable") {
      return {
        status: "available",
        progress: 0,
        message:
          "Gemini Nano can be downloaded. Initialize it with a direct click.",
      };
    }

    if (availability === "available") {
      return {
        status: "available",
        progress: 1,
        message: "Chrome Gemini Nano 4 is available.",
      };
    }

    return {
      status: "available",
      progress: 0,
      message:
        "Chrome exposes the LanguageModel API. Use Initialize On-Device Model to verify it.",
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
  onProgress: (progress: number) => void
): Promise<DeviceState> {
  const api = languageModelApi();
  if (!api?.create) {
    return {
      status: "unavailable",
      progress: 0,
      message:
        "LanguageModel.create is not exposed. Use a current desktop Chrome build with built-in AI enabled.",
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
        systemPrompt:
          "You help inspect private business documents. Never invent facts or personal data.",
      });
    }
    onProgress(1);
    return {
      status: "ready",
      progress: 1,
      message: "Chrome Gemini Nano 4 is ready for private inference.",
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
  return "prefer_on_device" as const;
}

function normalizeSource(value: string): InferenceSource {
  return value === "in_cloud" ? "IN_CLOUD" : "ON_DEVICE";
}

function normalizeRisk(value: string | RiskLevel): RiskLevel {
  return value === "critical" || value === "high" || value === "medium"
    ? value
    : "low";
}

function tokenRows(
  entities: Array<{ token: string; category: string; original: string }>
): PiiToken[] {
  const seen = new Map<string, PiiToken>();
  for (const entity of entities) {
    if (!seen.has(entity.token)) {
      seen.set(entity.token, {
        token: entity.token,
        original: entity.original,
        type: entity.category,
      });
    }
  }
  return Array.from(seen.values());
}

function leakedPiiBytes(
  scrubbedText: string,
  tokens: PiiToken[]
): number {
  let bytes = 0;
  for (const token of tokens) {
    if (scrubbedText.includes(token.original)) {
      bytes += new TextEncoder().encode(token.original).length;
    }
  }
  return bytes;
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
  config: HybridRemoteConfig;
  ai: AI;
  auth?: Auth;
  firestore?: Firestore;
  onProgress?: (label: string, progress: number) => void;
}

export async function executeAudit(request: AuditRequest): Promise<AuditView & { persistenceFailed: boolean }> {
  if (!request.text.trim() && !request.imageDataUrl) {
    throw new Error("Add document text or an image before starting an audit.");
  }

  const image = dataUrlImage(request.imageDataUrl);
  let routeMode = requestedMode(request.mode);

  if (image && routeMode === "only_in_cloud") {
    throw new Error(
      "Image pixels cannot be scrubbed reliably. Keep image evidence on-device or remove the image before a cloud audit."
    );
  }
  if (image) routeMode = "only_on_device";

  request.onProgress?.("Selecting the safest execution route", 0.12);

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
    maskAmounts: false,
    persist: Boolean(request.auth?.currentUser && request.firestore),
    onDeviceProgress: (value: number) => {
      request.onProgress?.(
        "Preparing on-device Gemini Nano 4",
        0.18 + normalizeProgress(value) * 0.56
      );
    },
  });

  request.onProgress?.("Verifying the zero-egress payload", 0.82);
  const inferenceSource = normalizeSource(result.inferenceSource);
  const tokens = tokenRows(result.shield.entities);
  const rawPiiBytesSent = leakedPiiBytes(result.shield.scrubbed, tokens);
  const payload: AuditPayload = {
    originalText: request.text,
    scrubbedText: result.shield.scrubbed,
    tokens,
    rawPiiBytesSent,
  };

  request.onProgress?.("Preparing locally rehydrated redlines", 0.96);

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
      "The audit completed. Review each flagged item and the suggested language before applying edits.",
    redFlags: result.audit.redFlags.map((flag) => ({
      title: flag.title,
      detail: flag.explanation,
      severity: normalizeRisk(flag.severity),
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
  };
}

export function estimatePiiEntities(text: string): number {
  if (!text.trim()) return 0;
  return shieldPii(text).entities.length;
}

export { asString as readString };
