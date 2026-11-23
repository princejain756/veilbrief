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
import { z } from "zod";
import {
  assertNoRawPii,
  auditWirePayload,
  mergeContextualEntities,
  redactPiiTokens,
  rehydrateText,
  shieldPii,
  type ShieldResult,
  type WireEgressAudit,
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

export const ON_DEVICE_MODEL_LABEL = "Chrome Built-in AI (Gemini Nano)";

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
  onDeviceJsonSchema?: object;
}

export interface HybridModelHandle {
  model: GenerativeModel;
  prepareOnDeviceModel: (
    onProgress?: (progressValue: number) => void,
  ) => Promise<void>;
}

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ResolvedInferenceSource = "on_device" | "in_cloud" | "unknown";

export interface AuditRedFlag {
  title: string;
  severity: string;
  explanation: string;
  clause?: string;
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

export interface ContextualStageResult {
  ran: boolean;
  source: "on_device" | "skipped";
  entitiesAdded: number;
  latencyMs: number;
  reason?: string;
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
  enableContextualOnDeviceScrub?: boolean;
  onDeviceProgress?: (progressValue: number) => void;
  onStreamChunk?: (partialText: string) => void;
  onStageUpdate?: (stage: string, detail: string) => void;
  systemInstruction?: string;
  modelFactory?: typeof createHybridModel;
  probeAvailability?: () => Promise<OnDeviceAvailability>;
}

export interface PersistedAuditRedFlag {
  title: string;
  severity: string;
  explanation: string;
}

export interface ScrubbedAuditPayload {
  platform: AuditPlatform;
  inferenceSource: ResolvedInferenceSource;
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
  inferenceSource: ResolvedInferenceSource;
  inferenceSourceInferred: boolean;
  shield: ShieldResult;
  audit: ParsedAuditResponse;
  egressAudit: WireEgressAudit;
  wirePayloadPreview: string;
  contextualStage: ContextualStageResult;
  streamed: boolean;
  persistedAuditId?: string;
  persistenceFailed: boolean;
}

export class MalformedAuditResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedAuditResponseError";
  }
}

export const AuditResponseZodSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string().trim().min(1),
  redFlags: z.array(
    z.object({
      title: z.string().trim().min(1),
      severity: z.string().trim().min(1),
      explanation: z.string().trim().min(1),
      clause: z.string().trim().optional(),
    }),
  ),
  recommendedEdits: z.array(
    z.object({
      title: z.string().trim().min(1),
      currentText: z.string(),
      suggestedText: z.string().trim().min(1),
      rationale: z.string().trim().min(1),
    }),
  ),
});

export const ContextualScrubZodSchema = z.object({
  entities: z
    .array(
      z.object({
        phrase: z.string().trim().min(4),
        reason: z.string().trim().optional(),
      }),
    )
    .max(12),
});

export const AUDIT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["riskLevel", "summary", "redFlags", "recommendedEdits"],
  properties: {
    riskLevel: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    summary: { type: "string" },
    redFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "explanation"],
        properties: {
          title: { type: "string" },
          severity: { type: "string" },
          explanation: { type: "string" },
          clause: { type: "string" },
        },
      },
    },
    recommendedEdits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "currentText", "suggestedText", "rationale"],
        properties: {
          title: { type: "string" },
          currentText: { type: "string" },
          suggestedText: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

export const CONTEXTUAL_SCRUB_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entities"],
  properties: {
    entities: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "reason"],
        properties: {
          phrase: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const DEFAULT_SYSTEM_INSTRUCTION = [
  "You are a careful freelance contract and document auditor.",
  "Treat existing bracketed tokens such as [PERSON_1], [EMAIL_1], [AMOUNT_1], or [CONTEXT_1] as opaque protected values.",
  "NEVER invent new bracketed placeholders such as [LOCATION_1], [NUMBER], or [OVERAGE_AMOUNT]; write concrete plain-English terms like thirty days or fifteen days instead.",
  "Quote an exact verbatim sentence or phrase from the document in currentText so the caller can match and replace it in-place.",
  "Return only the requested JSON object and preserve existing protected bracket tokens unchanged in currentText and suggestedText.",
].join(" ");

const CONTEXTUAL_SYSTEM_INSTRUCTION = [
  "Identify only quasi-identifying stealth phrases missed by regex: unannounced project codenames, internal lab or studio locations, unique client hardware nicknames, or private executive titles.",
  "Return exact verbatim substrings from the input excerpt.",
  "Do not return generic legal terms or bracketed tokens.",
].join(" ");

export const AUDIT_RESPONSE_SCHEMA = Schema.object({
  properties: {
    riskLevel: Schema.enumString({
      enum: ["low", "medium", "high", "critical"],
      description: "Overall legal or financial risk.",
    }),
    summary: Schema.string({
      description: "A concise scrubbed summary that contains no raw personal data.",
    }),
    redFlags: Schema.array({
      items: Schema.object({
        properties: {
          title: Schema.string(),
          severity: Schema.string(),
          explanation: Schema.string(),
          clause: Schema.string(),
        },
        optionalProperties: ["clause"],
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

const GOOGLE_AI_HOST_PATTERN =
  /generativelanguage\.googleapis\.com|firebasevertexai\.googleapis\.com|aiplatform\.googleapis\.com/i;

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
    const scope = globalThis as {
      LanguageModel?: { availability?: () => Promise<string> };
      ai?: { languageModel?: { availability?: () => Promise<string> } };
    };
    const languageModel = scope.LanguageModel ?? scope.ai?.languageModel;
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
  const onDeviceConstraint = options.onDeviceJsonSchema ?? AUDIT_JSON_SCHEMA;

  const model = getGenerativeModel(ai, {
    mode: options.route.mode,
    onDeviceParams: {
      createOptions: {
        initialPrompts: [
          {
            role: "system",
            content: [{ type: "text", value: systemInstruction }],
          },
        ],
      },
      promptOptions: {
        responseConstraint: onDeviceConstraint,
      },
    },
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
  wireBytesSent = 0,
): {
  inferenceSource: ResolvedInferenceSource;
  inferred: boolean;
} {
  if (reported === InferenceSource.ON_DEVICE) {
    return { inferenceSource: "on_device", inferred: false };
  }
  if (reported === InferenceSource.IN_CLOUD) {
    return { inferenceSource: "in_cloud", inferred: false };
  }

  if (wireBytesSent > 0) {
    return { inferenceSource: "in_cloud", inferred: true };
  }

  if (route.mode === InferenceMode.ONLY_ON_DEVICE && onDevicePrepared) {
    return { inferenceSource: "on_device", inferred: true };
  }

  if (
    route.mode === InferenceMode.ONLY_IN_CLOUD ||
    route.mode === InferenceMode.PREFER_IN_CLOUD
  ) {
    return { inferenceSource: "in_cloud", inferred: true };
  }

  return { inferenceSource: "unknown", inferred: true };
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export function parseAuditResponse(rawText: string): ParsedAuditResponse {
  const candidate = extractJsonObject(rawText);
  if (!candidate) {
    throw new MalformedAuditResponseError("Model returned an empty response.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (error) {
    throw new MalformedAuditResponseError(
      `Model output is not valid JSON: ${
        error instanceof Error ? error.message : "parse error"
      }`,
    );
  }

  const validated = AuditResponseZodSchema.safeParse(parsedJson);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    const path = issue?.path.join(".") || "root";
    throw new MalformedAuditResponseError(
      `Model JSON failed schema validation at "${path}": ${
        issue?.message ?? "invalid payload"
      }`,
    );
  }

  const seenCurrentTexts = new Set<string>();
  const uniqueEdits = validated.data.recommendedEdits.filter((edit) => {
    const normalized = edit.currentText.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    if (seenCurrentTexts.has(normalized)) {
      return false;
    }
    seenCurrentTexts.add(normalized);
    return true;
  });

  return {
    ...validated.data,
    recommendedEdits: uniqueEdits,
  };
}

const UNMAPPED_PLACEHOLDER_PATTERN = /\[[A-Z][A-Z0-9_ -]{1,}\]/;

function rehydrateRecommendedEdits(
  edits: RecommendedEdit[],
  tokenMap: Record<string, string>,
): RecommendedEdit[] {
  return edits
    .map((edit) => ({
      title: rehydrateText(edit.title, tokenMap),
      currentText: rehydrateText(edit.currentText, tokenMap),
      suggestedText: rehydrateText(edit.suggestedText, tokenMap),
      rationale: rehydrateText(edit.rationale, tokenMap),
    }))
    .filter(
      (edit) =>
        !UNMAPPED_PLACEHOLDER_PATTERN.test(edit.suggestedText) &&
        !UNMAPPED_PLACEHOLDER_PATTERN.test(edit.currentText),
    );
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
  inferenceSource: ResolvedInferenceSource;
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
    "Audit this contract or document for material legal, financial, IP, indemnity, or operational risk.",
    "Return riskLevel, summary, redFlags, and recommendedEdits as JSON.",
    "Each recommended edit must target a distinct risky sentence or phrase (do not repeat identical currentText).",
    "For currentText, copy an exact verbatim sentence or phrase that literally appears in the document.",
    "Preserve existing bracketed tokens unchanged. NEVER invent template brackets such as [DATE], [LOCATION], [NUMBER], [SECTION_NUMBER], or [DISPUTE_RESOLUTION_METHOD]; write concrete balanced contract wording (for example: 15 business days, Delaware courts) where specific figures are needed.",
    "Document follows:",
    "",
    scrubbedText,
  ].join("\n");
}

function buildContextualPrompt(scrubbedExcerpt: string): string {
  return [
    "Scan this already regex-scrubbed excerpt for any remaining contextual quasi-identifiers:",
    "- stealth or internal project codenames",
    "- private studio, lab, or coworking location phrases",
    "- distinct internal team or product names that could identify the contractor or client",
    "Return exact verbatim phrases from the excerpt and a brief reason.",
    "Never return bracket tokens like [PERSON_1]. Return {\"entities\": []} if none remain.",
    "",
    scrubbedExcerpt,
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

async function readCapturedRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  if (typeof init?.body === "string") {
    return init.body;
  }
  if (init?.body instanceof Uint8Array) {
    return new TextDecoder().decode(init.body);
  }
  if (init?.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(init.body));
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return null;
    }
  }
  return null;
}

async function captureGoogleAiWireCall<T>(
  operation: () => Promise<T>,
): Promise<{ value: T; wireBody: string | null; wireHost: string | null }> {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== "function") {
    return {
      value: await operation(),
      wireBody: null,
      wireHost: null,
    };
  }

  let wireBody: string | null = null;
  let wireHost: string | null = null;

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (GOOGLE_AI_HOST_PATTERN.test(rawUrl)) {
      try {
        wireHost = new URL(rawUrl).host;
      } catch {
        wireHost = "googleapis.com";
      }
      const captured = await readCapturedRequestBody(input, init);
      if (captured !== null) {
        wireBody = captured;
      }
    }

    return originalFetch(input, init);
  };

  try {
    const value = await operation();
    return { value, wireBody, wireHost };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runContextualOnDeviceScrub(input: {
  baseShield: ShieldResult;
  ai: AI;
  route: ExecutionRoute;
  factory: typeof createHybridModel;
  probe: () => Promise<OnDeviceAvailability>;
  timeoutMs?: number;
}): Promise<{ shield: ShieldResult; stage: ContextualStageResult }> {
  const startedAt = performance.now();

  if (input.route.mode === InferenceMode.ONLY_IN_CLOUD) {
    return {
      shield: input.baseShield,
      stage: {
        ran: false,
        source: "skipped",
        entitiesAdded: 0,
        latencyMs: 0,
        reason: "only_in_cloud policy skipped on-device contextual scrub",
      },
    };
  }

  const availability = await input.probe();
  if (availability !== "available") {
    return {
      shield: input.baseShield,
      stage: {
        ran: false,
        source: "skipped",
        entitiesAdded: 0,
        latencyMs: Math.round(performance.now() - startedAt),
        reason: `Chrome LanguageModel status is ${availability}`,
      },
    };
  }

  const timeoutMs = input.timeoutMs ?? 8_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const localRoute: ExecutionRoute = {
      ...input.route,
      mode: "only_on_device",
      mustScrubForCloud: false,
    };
    const handle = input.factory(input.ai, {
      route: localRoute,
      systemInstruction: CONTEXTUAL_SYSTEM_INSTRUCTION,
      onDeviceJsonSchema: CONTEXTUAL_SCRUB_JSON_SCHEMA,
    });

    const excerpt = input.baseShield.scrubbed.slice(0, 1_800);
    const taskPromise = (async () => {
      await handle.prepareOnDeviceModel();
      return handle.model.generateContent(buildContextualPrompt(excerpt));
    })();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Contextual on-device scrub timed out.")),
        timeoutMs,
      );
    });

    const response = await Promise.race([taskPromise, timeoutPromise]);
    const rawJson = extractJsonObject(response.response.text());
    const parsed = ContextualScrubZodSchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      return {
        shield: input.baseShield,
        stage: {
          ran: true,
          source: "skipped",
          entitiesAdded: 0,
          latencyMs: Math.round(performance.now() - startedAt),
          reason: "Contextual JSON response did not match schema",
        },
      };
    }

    const beforeCount = input.baseShield.entities.length;
    const merged = mergeContextualEntities(
      input.baseShield,
      parsed.data.entities,
    );
    const added = Math.max(0, merged.entities.length - beforeCount);

    return {
      shield: merged,
      stage: {
        ran: true,
        source: "on_device",
        entitiesAdded: added,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    };
  } catch (error) {
    return {
      shield: input.baseShield,
      stage: {
        ran: true,
        source: "skipped",
        entitiesAdded: 0,
        latencyMs: Math.round(performance.now() - startedAt),
        reason:
          error instanceof Error
            ? error.message
            : "Contextual scrub unavailable",
      },
    };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function runHybridAudit(
  input: RunHybridAuditInput,
): Promise<HybridAuditResult> {
  const startedAt = performance.now();
  const config = input.config ?? DEFAULT_REMOTE_CONFIG;

  input.onStageUpdate?.("Stage 1A", "Running deterministic PII shield");
  let shield = shieldPii(input.text, {
    maskAmounts: input.maskAmounts ?? true,
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

  const factory = input.modelFactory ?? createHybridModel;
  const probe = input.probeAvailability ?? probeOnDeviceAvailability;

  let contextualStage: ContextualStageResult = {
    ran: false,
    source: "skipped",
    entitiesAdded: 0,
    latencyMs: 0,
    reason: "Disabled or image packet",
  };

  if (input.enableContextualOnDeviceScrub !== false && !input.image) {
    input.onStageUpdate?.(
      "Stage 1B",
      "Checking local AI for stealth contextual identifiers",
    );
    const contextual = await runContextualOnDeviceScrub({
      baseShield: shield,
      ai: input.ai,
      route,
      factory,
      probe,
    });
    shield = contextual.shield;
    contextualStage = contextual.stage;
  }

  assertNoRawPii(shield.scrubbed, shield.entities);

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

  const candidateModels =
    route.mode === InferenceMode.ONLY_ON_DEVICE || input.image
      ? [route.targetCloudModel]
      : resolveCloudModelCandidates(
          route.targetCloudModel,
          config.cloud_fallback_model,
        );

  let response:
    | Awaited<ReturnType<GenerativeModel["generateContent"]>>["response"]
    | null = null;
  let capturedWireBody: string | null = null;
  let capturedWireHost: string | null = null;
  let onDevicePrepared = false;
  let attemptedCloudModel = route.targetCloudModel;
  let lastError: unknown;
  let streamed = false;

  input.onStageUpdate?.(
    "Stage 2",
    route.mode === InferenceMode.ONLY_ON_DEVICE
      ? "Running private on-device contract review"
      : "Running hybrid contract review",
  );

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
      const canStream =
        Boolean(input.onStreamChunk) &&
        typeof hybridModel.model.generateContentStream === "function";

      const captured = await captureGoogleAiWireCall(async () => {
        if (canStream) {
          const streamResult = await hybridModel.model.generateContentStream(parts);
          let accumulated = "";
          for await (const chunk of streamResult.stream) {
            const delta = chunk.text();
            if (delta) {
              accumulated += delta;
              input.onStreamChunk?.(accumulated);
            }
          }
          streamed = true;
          return streamResult.response;
        }

        const singleResult = await hybridModel.model.generateContent(parts);
        return singleResult.response;
      });

      response = captured.value;
      capturedWireBody = captured.wireBody;
      capturedWireHost = captured.wireHost;
      break;
    } catch (error) {
      lastError = error;
      const hasNext = idx + 1 < candidateModels.length;
      if (!hasNext || !isTransientCloudError(error)) {
        throw error;
      }
    }
  }

  if (!response) {
    throw lastError ?? new Error("Hybrid inference did not return a response.");
  }

  const egressAudit = await auditWirePayload(
    capturedWireBody,
    capturedWireHost,
    shield.entities,
  );
  if (!egressAudit.verifiedZeroRawPii) {
    throw new Error(
      `Network egress audit detected raw PII categories on the wire: ${egressAudit.canaryLeakCategories.join(", ")}`,
    );
  }

  const source = resolveInferenceSource(
    response.inferenceSource,
    route,
    onDevicePrepared,
    egressAudit.wireBytesSent,
  );
  const latencyMs = Math.round(performance.now() - startedAt);
  const modelUsed =
    source.inferenceSource === "on_device"
      ? ON_DEVICE_MODEL_LABEL
      : source.inferenceSource === "in_cloud"
        ? attemptedCloudModel
        : "Unverified runtime";

  const parsed = parseAuditResponse(response.text());
  const audit: ParsedAuditResponse = {
    riskLevel: parsed.riskLevel,
    summary: rehydrateText(parsed.summary, shield.tokenMap),
    redFlags: parsed.redFlags.map((flag) => ({
      ...flag,
      title: rehydrateText(flag.title, shield.tokenMap),
      explanation: rehydrateText(flag.explanation, shield.tokenMap),
      clause: flag.clause ? rehydrateText(flag.clause, shield.tokenMap) : undefined,
    })),
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
    egressAudit,
    wirePayloadPreview: capturedWireBody ?? "",
    contextualStage,
    streamed,
    persistedAuditId,
    persistenceFailed,
  };
}
