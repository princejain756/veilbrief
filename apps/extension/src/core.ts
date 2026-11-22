import {
  createHybridModel,
  DEFAULT_REMOTE_CONFIG,
  probeOnDeviceAvailability,
  rehydrateText,
  selectExecutionRoute,
  shieldPii,
  type HybridAuditResult,
  type HybridRemoteConfig
} from "@veilbrief/core";
import type { AI } from "firebase/ai";

export type ExecutionRoute = "ON_DEVICE" | "IN_CLOUD";

export interface ShieldPreview {
  sourceText: string;
  redactedText: string;
  entities: Array<{ kind: string }>;
  count: number;
}

export interface AuditPreview {
  route: ExecutionRoute;
  summary: string;
  redFlags: string[];
  counterClauses: string[];
}

export function shieldText(text: string): ShieldPreview {
  const shield = shieldPii(text);
  return {
    sourceText: text,
    redactedText: shield.scrubbed,
    entities: shield.entities.map((entity) => ({ kind: entity.category })),
    count: shield.entities.length
  };
}

export function chooseRoute(
  text: string,
  config: HybridRemoteConfig = DEFAULT_REMOTE_CONFIG
): ExecutionRoute {
  const route = selectExecutionRoute(config, {
    textLength: text.length,
    isOffline: !navigator.onLine
  });
  return route.mode === "only_on_device" || route.mode === "prefer_on_device"
    ? "ON_DEVICE"
    : "IN_CLOUD";
}

export async function prepareLocalModel(
  ai: AI,
  config: HybridRemoteConfig,
  onProgress: (progress: number) => void
) {
  const availability = await probeOnDeviceAvailability();
  if (availability === "unavailable" || availability === "unknown") {
    return { state: "unsupported", message: "Chrome Prompt API is unavailable" } as const;
  }

  const route = selectExecutionRoute(config, {
    textLength: 0,
    requestedMode: "only_on_device"
  });
  await createHybridModel(ai, { route }).prepareOnDeviceModel(onProgress);
  return { state: "ready", message: "Gemini Nano 4 is ready" } as const;
}

export function auditPreview(result: HybridAuditResult): AuditPreview {
  const { audit, shield } = result;
  const rehydrate = (text: string) => rehydrateText(text, shield.tokenMap);
  return {
    route: result.inferenceSource === "on_device" ? "ON_DEVICE" : "IN_CLOUD",
    summary: rehydrate(audit.summary),
    redFlags: audit.redFlags.map((flag) => rehydrate(`${flag.title}: ${flag.explanation}`)),
    counterClauses: audit.recommendedEdits.map((edit) => edit.suggestedText)
  };
}
