export type InferenceMode =
  | "prefer_on_device"
  | "only_on_device"
  | "prefer_in_cloud"
  | "only_in_cloud";

export type RoutingReason =
  | "offline_only_on_device"
  | "short_doc_prefer_on_device"
  | "long_doc_cloud_scrubbed"
  | "pdf_or_heavy_fallback_scrubbed"
  | "explicit_override";

export interface HybridRemoteConfig {
  cloud_model_name: string;
  cloud_fallback_model: string;
  default_inference_mode: InferenceMode;
  max_on_device_chars: number;
  enforce_local_pii_shield: boolean;
}

export interface ExecutionRoute {
  mode: InferenceMode;
  targetCloudModel: string;
  mustScrubForCloud: boolean;
  reason: RoutingReason;
}

export interface RoutingContext {
  textLength: number;
  estimatedTokens?: number;
  isOffline?: boolean;
  isPdfOrHeavy?: boolean;
  requestedMode?: InferenceMode;
  onDeviceAvailable?: boolean;
}

export const ON_DEVICE_TOKEN_LIMIT = 9216;

export const DEFAULT_REMOTE_CONFIG: HybridRemoteConfig = {
  cloud_model_name: "gemini-3.5-flash-lite",
  cloud_fallback_model: "gemini-3.8-flash",
  default_inference_mode: "prefer_on_device",
  max_on_device_chars: 12000,
  enforce_local_pii_shield: true,
};

const SUPPORTED_CLOUD_MODELS = new Set([
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-4-hydrogen",
]);

export function estimateDocumentTokens(textLength: number): number {
  return Math.max(1, Math.ceil(textLength / 4));
}

export function isInferenceMode(value: unknown): value is InferenceMode {
  return (
    value === "prefer_on_device" ||
    value === "only_on_device" ||
    value === "prefer_in_cloud" ||
    value === "only_in_cloud"
  );
}

export function isSupportedCloudModel(value: string): boolean {
  return SUPPORTED_CLOUD_MODELS.has(value.trim());
}

function cloudModelFor(
  config: HybridRemoteConfig,
  fallback: boolean,
): string {
  const preferred = fallback
    ? config.cloud_fallback_model
    : config.cloud_model_name;

  if (isSupportedCloudModel(preferred)) {
    return preferred.trim();
  }

  return fallback
    ? DEFAULT_REMOTE_CONFIG.cloud_fallback_model
    : DEFAULT_REMOTE_CONFIG.cloud_model_name;
}

export function selectExecutionRoute(
  config: HybridRemoteConfig,
  context: RoutingContext,
): ExecutionRoute {
  const shieldRequired = config.enforce_local_pii_shield;

  if (context.isOffline) {
    return {
      mode: "only_on_device",
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: false,
      reason: "offline_only_on_device",
    };
  }

  if (context.requestedMode) {
    const requiresCloud = context.requestedMode !== "only_on_device";

    return {
      mode: context.requestedMode,
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: requiresCloud && shieldRequired,
      reason: "explicit_override",
    };
  }

  if (config.default_inference_mode === "only_on_device") {
    return {
      mode: "only_on_device",
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: false,
      reason: "explicit_override",
    };
  }

  if (config.default_inference_mode === "only_in_cloud") {
    return {
      mode: "only_in_cloud",
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: shieldRequired,
      reason: "explicit_override",
    };
  }

  if (config.default_inference_mode === "prefer_in_cloud") {
    return {
      mode: "prefer_in_cloud",
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: shieldRequired,
      reason: "explicit_override",
    };
  }

  if (context.isPdfOrHeavy) {
    return {
      mode: "prefer_in_cloud",
      targetCloudModel: cloudModelFor(config, true),
      mustScrubForCloud: shieldRequired,
      reason: "pdf_or_heavy_fallback_scrubbed",
    };
  }

  const estimatedTokens =
    context.estimatedTokens ?? estimateDocumentTokens(context.textLength);
  const exceedsCharacterBudget =
    context.textLength > config.max_on_device_chars;
  const exceedsTokenBudget = estimatedTokens > ON_DEVICE_TOKEN_LIMIT;

  if (exceedsCharacterBudget || exceedsTokenBudget) {
    return {
      mode: "prefer_in_cloud",
      targetCloudModel: cloudModelFor(config, false),
      mustScrubForCloud: shieldRequired,
      reason: "long_doc_cloud_scrubbed",
    };
  }

  return {
    mode: "prefer_on_device",
    targetCloudModel: cloudModelFor(config, false),
    mustScrubForCloud: shieldRequired,
    reason: "short_doc_prefer_on_device",
  };
}
