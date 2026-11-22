import {
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  CustomProvider,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";
import {
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
  type Firestore,
  type FieldValue,
} from "firebase/firestore";
import {
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  type RemoteConfig,
} from "firebase/remote-config";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  type AI,
  type GenerativeModel,
  type Part,
  type SchemaRequest,
  type TypedSchema,
} from "firebase/ai";
import {
  assertNoRawPii,
  redactPiiTokens,
  rehydrateText,
  shieldPii,
  type ShieldResult,
} from "./piiShield.js";
import {
  DEFAULT_REMOTE_CONFIG,
  isInferenceMode,
  isSupportedCloudModel,
  selectExecutionRoute,
  type ExecutionRoute,
  type HybridRemoteConfig,
  type InferenceMode as VeilBriefInferenceMode,
} from "./routingPolicy.js";

export interface FirebaseClientConfig extends FirebaseOptions {
  appCheckDebugToken?: string;
  recaptchaSiteKey?: string;
  recaptchaProvider?: "enterprise" | "v3";
  isLocalDev?: boolean;
  remoteConfigOverrides?: Partial<HybridRemoteConfig>;
}

export type OnDeviceAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown";

export interface InitVeilBriefFirebaseResult {
  app: FirebaseApp;
  ai: AI;
  appCheck: AppCheck | null;
  auth: Auth;
  user: User | null;
  remoteConfig: RemoteConfig;
  firestore: Firestore;
  config: HybridRemoteConfig;
  warnings: string[];
}

export interface HybridModelOptions {
  route: ExecutionRoute;
  systemInstruction?: string;
  responseSchema?: TypedSchema | SchemaRequest;
}

export interface HybridModelHandle {
  model: GenerativeModel;
  prepareOnDeviceModel: (
    onProgress?: (progressValue: number) => void,
  ) => Promise<void>;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AuditRedFlag {
  title: string;
  severity: string;
  explanation: string;
}

export interface RecommendedEdit {
  title: string;
  currentText: string;
  suggestedText: string;
  rationale: string;
}

export interface ParsedAuditResponse {
  riskLevel: RiskLevel;
  summary: string;
  redFlags: AuditRedFlag[];
  recommendedEdits: RecommendedEdit[];
}

export interface AuditImageInput {
  base64: string;
  mimeType: "image/png" | "image/jpeg";
}

export type AuditPlatform = "web" | "chrome-extension" | "ios" | "macos";

export interface RunHybridAuditInput {
  platform: AuditPlatform;
  text: string;
  ai: AI;
  config?: HybridRemoteConfig;
  auth?: Auth | null;
  firestore?: Firestore | null;
  image?: AuditImageInput;
  isOffline?: boolean;
  isPdfOrHeavy?: boolean;
  requestedMode?: VeilBriefInferenceMode;
  maskAmounts?: boolean;
  persist?: boolean;
  onDeviceProgress?: (progressValue: number) => void;
  systemInstruction?: string;
  modelFactory?: typeof createHybridModel;
}

export interface PersistedAuditRedFlag {
  title: string;
  severity: string;
  explanation: string;
}

export interface ScrubbedAuditPayload {
  platform: AuditPlatform;
  inferenceSource: "on_device" | "in_cloud";
  modelUsed: string;
  riskLevel: RiskLevel;
  summary: string;
  redFlags: PersistedAuditRedFlag[];
  piiEntitiesCount: number;
  latencyMs: number;
  createdAt: FieldValue;
}

export interface HybridAuditResult {
  modelUsed: string;
  latencyMs: number;
  route: ExecutionRoute;
  inferenceSource: "on_device" | "in_cloud";
  inferenceSourceInferred: boolean;
  shield: ShieldResult;
  audit: ParsedAuditResponse;
  persistedAuditId?: string;
  persistenceFailed: boolean;
}

const DEFAULT_SYSTEM_INSTRUCTION = [
  "You are a careful document auditor.",
  "Treat every token in square brackets as an opaque protected value.",
  "Do not invent, translate, or decipher a token.",
  "Return only the requested JSON object.",
  "Keep token placeholders in any quoted document text so the caller can restore values locally.",
].join(" ");

export const AUDIT_RESPONSE_SCHEMA = Schema.object({
  properties: {
    riskLevel: Schema.enumString({
      enum: ["low", "medium", "high", "critical"],
      description: "Overall legal or financial risk.",
    }),
    summary: Schema.string({
      description: "A short scrubbed summary that contains no raw personal data.",
    }),
    redFlags: Schema.array({
      items: Schema.object({
        properties: {
          title: Schema.string(),
          severity: Schema.string(),
          explanation: Schema.string(),
        },
      }),
    }),
    recommendedEdits: Schema.array({
      items: Schema.object({
        properties: {
          title: Schema.string(),
          currentText: Schema.string(),
          suggestedText: Schema.string(),
          rationale: Schema.string(),
        },
      }),
    }),
  },
});

function isLocalDevelopment(config: FirebaseClientConfig): boolean {
  if (config.isLocalDev !== undefined) {
    return config.isLocalDev;
  }

  if (typeof location === "undefined") {
    return false;
  }

  return (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1"
  );
}

function readRemoteString(
  remoteConfig: RemoteConfig,
  key: string,
  fallback: string,
): string {
  const value = getValue(remoteConfig, key).asString().trim();
  return value.length > 0 ? value : fallback;
}

function readRemoteNumber(
  remoteConfig: RemoteConfig,
  key: string,
  fallback: number,
): number {
  const value = getValue(remoteConfig, key).asNumber();
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readRemoteBoolean(
  remoteConfig: RemoteConfig,
  key: string,
  fallback: boolean,
): boolean {
  if (getValue(remoteConfig, key).getSource() === "static") {
    return fallback;
  }
  return getValue(remoteConfig, key).asBoolean();
}

function readRemoteConfig(remoteConfig: RemoteConfig): HybridRemoteConfig {
  const preferredModel = readRemoteString(
    remoteConfig,
    "cloud_model_name",
    DEFAULT_REMOTE_CONFIG.cloud_model_name,
  );
  const fallbackModel = readRemoteString(
    remoteConfig,
    "cloud_fallback_model",
    DEFAULT_REMOTE_CONFIG.cloud_fallback_model,
  );
  const remoteMode = getValue(
    remoteConfig,
    "default_inference_mode",
  ).asString();

  return {
    cloud_model_name: isSupportedCloudModel(preferredModel)
      ? preferredModel
      : DEFAULT_REMOTE_CONFIG.cloud_model_name,
    cloud_fallback_model: isSupportedCloudModel(fallbackModel)
      ? fallbackModel
      : DEFAULT_REMOTE_CONFIG.cloud_fallback_model,
    default_inference_mode: isInferenceMode(remoteMode)
      ? remoteMode
      : DEFAULT_REMOTE_CONFIG.default_inference_mode,
    max_on_device_chars: readRemoteNumber(
      remoteConfig,
      "max_on_device_chars",
      DEFAULT_REMOTE_CONFIG.max_on_device_chars,
    ),
    enforce_local_pii_shield: readRemoteBoolean(
      remoteConfig,
      "enforce_local_pii_shield",
      DEFAULT_REMOTE_CONFIG.enforce_local_pii_shield,
    ),
  };
}

export async function probeOnDeviceAvailability(): Promise<OnDeviceAvailability> {
  try {
    const languageModel = (
      globalThis as {
        LanguageModel?: {
          availability?: () => Promise<string>;
        };
      }
    ).LanguageModel;
    const result = await languageModel?.availability?.();

    if (
      result === "available" ||
      result === "downloadable" ||
      result === "downloading" ||
      result === "unavailable"
    ) {
      return result;
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

export function getVeilBriefAi(app: FirebaseApp): AI {
  return getAI(app, { backend: new GoogleAIBackend() });
}

export async function initVeilBriefFirebase(
  config: FirebaseClientConfig,
): Promise<InitVeilBriefFirebaseResult> {
  const {
    appCheckDebugToken,
    recaptchaSiteKey,
    recaptchaProvider = "enterprise",
    isLocalDev,
    remoteConfigOverrides,
    ...firebaseOptions
  } = config;
  const app =
    getApps().find((candidate) => candidate.name === "[DEFAULT]") ??
    initializeApp(firebaseOptions);
  const warnings: string[] = [];
  const localDevelopment = isLocalDevelopment({
    ...firebaseOptions,
    appCheckDebugToken,
    recaptchaSiteKey,
    isLocalDev,
  });

  if (appCheckDebugToken && localDevelopment) {
    (
      globalThis as {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
      }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
  }

  let appCheck: AppCheck | null = null;
  if (recaptchaSiteKey || (appCheckDebugToken && localDevelopment)) {
    try {
      const provider = recaptchaSiteKey
        ? recaptchaProvider === "v3"
          ? new ReCaptchaV3Provider(recaptchaSiteKey)
          : new ReCaptchaEnterpriseProvider(recaptchaSiteKey)
        : new CustomProvider({
            getToken: async () => ({
              token: appCheckDebugToken ?? "",
              expireTimeMillis: Date.now() + 3_600_000,
            }),
          });
      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
    } catch (error) {
      warnings.push(
        `App Check was not initialized: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  } else if (appCheckDebugToken && !localDevelopment) {
    warnings.push(
      "App Check debug token was ignored outside local development.",
    );
  }

  const auth = getAuth(app);
  const credential = await signInAnonymously(auth);
  const remoteConfig = getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = localDevelopment
    ? 0
    : 60_000;
  remoteConfig.defaultConfig = {
    ...DEFAULT_REMOTE_CONFIG,
    ...remoteConfigOverrides,
  };

  try {
    await fetchAndActivate(remoteConfig);
  } catch (error) {
    warnings.push(
      `Remote Config fetch failed, so defaults are active: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  return {
    app,
    ai: getVeilBriefAi(app),
    appCheck,
    auth,
    user: credential.user,
    remoteConfig,
    firestore: getFirestore(app),
    config: readRemoteConfig(remoteConfig),
    warnings,
  };
}

export function createHybridModel(
  ai: AI,
  options: HybridModelOptions,
): HybridModelHandle {
  const responseSchema = options.responseSchema ?? AUDIT_RESPONSE_SCHEMA;
  const systemInstruction =
    options.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
  const model = getGenerativeModel(ai, {
    mode: options.route.mode,
    inCloudParams: {
      model: options.route.targetCloudModel,
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    },
  });

  return {
    model,
    prepareOnDeviceModel: async (onProgress) => {
      await model.initializeDeviceModel(onProgress);
    },
  };
}

export function resolveInferenceSource(
  reported: unknown,
  route: ExecutionRoute,
  onDevicePrepared: boolean,
): {
  inferenceSource: "on_device" | "in_cloud";
  inferred: boolean;
} {
  if (reported === InferenceSource.ON_DEVICE) {
    return { inferenceSource: "on_device", inferred: false };
  }
  if (reported === InferenceSource.IN_CLOUD) {
    return { inferenceSource: "in_cloud", inferred: false };
  }

  if (
    route.mode === InferenceMode.ONLY_ON_DEVICE ||
    (route.mode === InferenceMode.PREFER_ON_DEVICE && onDevicePrepared)
  ) {
    return { inferenceSource: "on_device", inferred: true };
  }

  return { inferenceSource: "in_cloud", inferred: true };
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1];
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseAuditResponse(rawText: string): ParsedAuditResponse {
  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<
    string,
    unknown
  >;
  const riskLevel = asString(parsed.riskLevel, "medium");
  const validRiskLevel: RiskLevel =
    riskLevel === "low" ||
    riskLevel === "medium" ||
    riskLevel === "high" ||
    riskLevel === "critical"
      ? riskLevel
      : "medium";
  const redFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags.map((flag) => {
        const item =
          flag && typeof flag === "object"
            ? (flag as Record<string, unknown>)
            : {};
        return {
          title: asString(item.title, "Untitled risk"),
          severity: asString(item.severity, "medium"),
          explanation: asString(item.explanation),
        };
      })
    : [];
  const recommendedEdits = Array.isArray(parsed.recommendedEdits)
    ? parsed.recommendedEdits.map((edit) => {
        const item =
          edit && typeof edit === "object"
            ? (edit as Record<string, unknown>)
            : {};
        return {
          title: asString(item.title, "Suggested edit"),
          currentText: asString(item.currentText),
          suggestedText: asString(item.suggestedText),
          rationale: asString(item.rationale),
        };
      })
    : [];

  return {
    riskLevel: validRiskLevel,
    summary: asString(parsed.summary),
    redFlags,
    recommendedEdits,
  };
}

function rehydrateRecommendedEdits(
  edits: RecommendedEdit[],
  tokenMap: Record<string, string>,
): RecommendedEdit[] {
  return edits.map((edit) => ({
    title: rehydrateText(edit.title, tokenMap),
    currentText: rehydrateText(edit.currentText, tokenMap),
    suggestedText: rehydrateText(edit.suggestedText, tokenMap),
    rationale: rehydrateText(edit.rationale, tokenMap),
  }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizePersistedText(
  value: string,
  shield: ShieldResult,
): string {
  let safe = redactPiiTokens(value);
  const originals = [...new Set(shield.entities.map((entity) => entity.original))]
    .filter((original) => original.length > 0)
    .sort((left, right) => right.length - left.length);

  for (const original of originals) {
    safe = safe.replace(
      new RegExp(escapeRegExp(original), "gi"),
      "[REDACTED]",
    );
  }

  const secondPass = shieldPii(safe);
  return redactPiiTokens(secondPass.scrubbed);
}

export function buildScrubbedAuditPayload(input: {
  platform: AuditPlatform;
  inferenceSource: "on_device" | "in_cloud";
  modelUsed: string;
  latencyMs: number;
  audit: ParsedAuditResponse;
  shield: ShieldResult;
}): ScrubbedAuditPayload {
  const sanitize = (value: string) => sanitizePersistedText(value, input.shield);
  return {
    platform: input.platform,
    inferenceSource: input.inferenceSource,
    modelUsed: input.modelUsed,
    riskLevel: input.audit.riskLevel,
    summary: sanitize(input.audit.summary),
    redFlags: input.audit.redFlags.map((flag) => ({
      title: sanitize(flag.title),
      severity: sanitize(flag.severity),
      explanation: sanitize(flag.explanation),
    })),
    piiEntitiesCount: input.shield.entities.length,
    latencyMs: input.latencyMs,
    createdAt: serverTimestamp(),
  };
}

function buildAuditPrompt(scrubbedText: string): string {
  return [
    "Audit this document for material legal, financial, or operational risk.",
    "Return riskLevel, summary, redFlags, and recommendedEdits as JSON.",
    "Each recommended edit must include title, currentText, suggestedText, and rationale.",
    "Preserve protected tokens exactly in currentText and suggestedText.",
    "The document follows.",
    "",
    scrubbedText,
  ].join("\n");
}

function isTransientCloudError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error ?? "");
  return /500|503|429|high demand|overloaded|unavailable|AI\/fetch-error/i.test(
    message,
  );
}

export function resolveCloudModelCandidates(
  primary: string,
  fallback: string,
): string[] {
  const raw = [
    primary,
    fallback,
    DEFAULT_REMOTE_CONFIG.cloud_model_name,
    DEFAULT_REMOTE_CONFIG.cloud_fallback_model,
    "gemini-4-hydrogen",
  ];
  const unique: string[] = [];
  for (const candidate of raw) {
    const trimmed = candidate.trim();
    if (isSupportedCloudModel(trimmed) && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique;
}

export async function runHybridAudit(
  input: RunHybridAuditInput,
): Promise<HybridAuditResult> {
  const startedAt = performance.now();
  const config = input.config ?? DEFAULT_REMOTE_CONFIG;
  const shield = shieldPii(input.text, {
    maskAmounts: input.maskAmounts ?? false,
  });
  assertNoRawPii(shield.scrubbed, shield.entities);

  const route = selectExecutionRoute(config, {
    textLength: input.text.length,
    isOffline: input.isOffline,
    isPdfOrHeavy: input.isPdfOrHeavy ?? Boolean(input.image),
    requestedMode: input.requestedMode,
  });
  if (input.image && route.mode !== "only_on_device") {
    throw new Error("Image evidence requires on-device inference.");
  }
  const prompt = buildAuditPrompt(shield.scrubbed);
  assertNoRawPii(prompt, shield.entities);

  const parts: Array<string | Part> = [prompt];
  if (input.image) {
    parts.push({
      type: "inlineData",
      inlineData: {
        data: input.image.base64,
        mimeType: input.image.mimeType,
      },
    });
  }

  const factory = input.modelFactory ?? createHybridModel;
  const candidateModels =
    route.mode === InferenceMode.ONLY_ON_DEVICE || input.image
      ? [route.targetCloudModel]
      : resolveCloudModelCandidates(
          route.targetCloudModel,
          config.cloud_fallback_model,
        );

  let result: Awaited<ReturnType<GenerativeModel["generateContent"]>> | null =
    null;
  let onDevicePrepared = false;
  let attemptedCloudModel = route.targetCloudModel;
  let lastError: unknown;

  for (let idx = 0; idx < candidateModels.length; idx += 1) {
    const candidate = candidateModels[idx];
    if (!candidate) continue;
    attemptedCloudModel = candidate;
    const candidateRoute: ExecutionRoute = {
      ...route,
      targetCloudModel: attemptedCloudModel,
    };
    const hybridModel = factory(input.ai, {
      route: candidateRoute,
      systemInstruction: input.systemInstruction,
    });
    onDevicePrepared = false;

    if (
      candidateRoute.mode === InferenceMode.ONLY_ON_DEVICE ||
      candidateRoute.mode === InferenceMode.PREFER_ON_DEVICE
    ) {
      try {
        await hybridModel.prepareOnDeviceModel(input.onDeviceProgress);
        onDevicePrepared = true;
      } catch (error) {
        if (candidateRoute.mode === InferenceMode.ONLY_ON_DEVICE) {
          throw error;
        }
      }
    }

    try {
      result = await hybridModel.model.generateContent(parts);
      break;
    } catch (error) {
      lastError = error;
      const hasNext = idx + 1 < candidateModels.length;
      if (!hasNext || !isTransientCloudError(error)) {
        throw error;
      }
    }
  }

  if (!result) {
    throw lastError ?? new Error("Hybrid inference did not return a response.");
  }

  const response = result.response;
  const source = resolveInferenceSource(
    response.inferenceSource,
    route,
    onDevicePrepared,
  );
  const latencyMs = Math.round(performance.now() - startedAt);
  const modelUsed = source.inferenceSource === "on_device"
    ? "Gemini Nano 4"
    : attemptedCloudModel;
  const parsed = parseAuditResponse(response.text());
  const audit: ParsedAuditResponse = {
    ...parsed,
    recommendedEdits: rehydrateRecommendedEdits(
      parsed.recommendedEdits,
      shield.tokenMap,
    ),
  };

  let persistedAuditId: string | undefined;
  let persistenceFailed = false;
  if (
    input.persist !== false &&
    !input.isOffline &&
    input.firestore &&
    input.auth?.currentUser
  ) {
    const payload = buildScrubbedAuditPayload({
      platform: input.platform,
      inferenceSource: source.inferenceSource,
      modelUsed,
      latencyMs,
      audit: parsed,
      shield,
    });
    try {
      const auditRef = await addDoc(
        collection(input.firestore, "users", input.auth.currentUser.uid, "audits"),
        payload,
      );
      persistedAuditId = auditRef.id;
    } catch {
      persistenceFailed = true;
    }
  }

  return {
    route,
    modelUsed,
    latencyMs,
    inferenceSource: source.inferenceSource,
    inferenceSourceInferred: source.inferred,
    shield,
    audit,
    persistedAuditId,
    persistenceFailed,
  };
}
