import {
  createHybridModel,
  DEFAULT_REMOTE_CONFIG,
  ON_DEVICE_MODEL_LABEL,
  probeOnDeviceAvailability,
  rehydrateText,
  selectExecutionRoute,
  shieldPii,
  type HybridAuditResult,
  type HybridRemoteConfig,
} from "@veilbrief/core";
import type { AI } from "firebase/ai";

export type ExecutionRoute = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";

export interface ShieldPreview {
  sourceText: string;
  redactedText: string;
  entities: Array<{ kind: string }>;
  count: number;
}

export interface RedlineItem {
  title: string;
  currentText: string;
  suggestedText: string;
  rationale: string;
}

export interface AuditPreview {
  route: ExecutionRoute;
  modelUsed: string;
  latencyMs: number;
  summary: string;
  redFlags: string[];
  counterClauses: RedlineItem[];
  wireHost: string | null;
  wireBytesSent: number;
  wirePayloadSha256: string | null;
  rawPiiBytesLeaked: number;
  rehydratedEntityCount: number;
}

export function shieldText(text: string): ShieldPreview {
  const shield = shieldPii(text, { maskAmounts: true });
  return {
    sourceText: text,
    redactedText: shield.scrubbed,
    entities: shield.entities.map((entity) => ({ kind: entity.category })),
    count: new Set(shield.entities.map((entity) => entity.token)).size,
  };
}

export function chooseRoute(
  text: string,
  config: HybridRemoteConfig = DEFAULT_REMOTE_CONFIG,
): ExecutionRoute {
  const route = selectExecutionRoute(config, {
    textLength: text.length,
    isOffline: !navigator.onLine,
  });
  return route.mode === "only_on_device" || route.mode === "prefer_on_device"
    ? "ON_DEVICE"
    : "IN_CLOUD";
}

export async function prepareLocalModel(
  ai: AI,
  config: HybridRemoteConfig,
  onProgress: (progress: number) => void,
) {
  const availability = await probeOnDeviceAvailability();
  if (availability === "unavailable" || availability === "unknown") {
    return {
      state: "unsupported",
      message: "Chrome Prompt API unavailable (Cloud Shield active)",
    } as const;
  }

  const route = selectExecutionRoute(config, {
    textLength: 0,
    requestedMode: "only_on_device",
  });
  await createHybridModel(ai, { route }).prepareOnDeviceModel(onProgress);
  return { state: "ready", message: `${ON_DEVICE_MODEL_LABEL} ready` } as const;
}

export function auditPreview(result: HybridAuditResult): AuditPreview {
  const { audit, shield, egressAudit } = result;
  const rehydrate = (text: string) => rehydrateText(text, shield.tokenMap);

  const counterClauses: RedlineItem[] = audit.recommendedEdits.map((edit) => ({
    title: rehydrate(edit.title),
    currentText: rehydrate(edit.currentText),
    suggestedText: rehydrate(edit.suggestedText),
    rationale: rehydrate(edit.rationale),
  }));

  const route: ExecutionRoute =
    result.inferenceSource === "on_device"
      ? "ON_DEVICE"
      : result.inferenceSource === "in_cloud"
        ? "IN_CLOUD"
        : "UNKNOWN";

  return {
    route,
    modelUsed: result.modelUsed,
    latencyMs: result.latencyMs,
    summary: rehydrate(audit.summary),
    redFlags: audit.redFlags.map((flag) =>
      rehydrate(`${flag.title}: ${flag.explanation}`),
    ),
    counterClauses,
    wireHost: egressAudit.wireHost,
    wireBytesSent: egressAudit.wireBytesSent,
    wirePayloadSha256: egressAudit.wirePayloadSha256,
    rawPiiBytesLeaked: egressAudit.rawPiiBytesLeaked,
    rehydratedEntityCount: Object.keys(shield.tokenMap).length,
  };
}
