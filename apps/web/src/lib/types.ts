export type InferenceMode = "auto" | "local" | "cloud";
export type InferenceSource = "ON_DEVICE" | "IN_CLOUD" | "UNKNOWN";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type { AuditPlatform as Platform } from "@veilbrief/core";
import type { AuditPlatform as Platform } from "@veilbrief/core";

export type ScenarioId =
  | "freelance-msa"
  | "enterprise-dpa"
  | "medical-invoice";

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  text: string;
  imageUrl?: string;
  estimatedChars: number;
  accent: "emerald" | "cobalt" | "amber";
}

export interface PiiToken {
  token: string;
  original: string;
  type: string;
  source?: "deterministic" | "on_device_context";
}

export interface RedFlag {
  title: string;
  detail: string;
  severity: RiskLevel;
  clause?: string;
}

export interface RecommendedEdit {
  title: string;
  original?: string;
  replacement: string;
  rationale?: string;
}

export interface RedlineDecision {
  status: "pending" | "accepted" | "rejected";
  customText?: string;
}

export interface AuditPayload {
  originalText: string;
  scrubbedText: string;
  wirePayloadPreview: string;
  wireHost: string | null;
  wireBytesSent: number;
  wirePayloadSha256: string | null;
  verifiedZeroRawPii: boolean;
  tokens: PiiToken[];
  rawPiiBytesSent: number;
  contextualEntitiesAdded: number;
  contextualStageNote: string;
}

export interface AuditView {
  id: string;
  createdAt: number;
  inferenceSource: InferenceSource;
  modelName: string;
  latencyMs: number;
  riskLevel: RiskLevel;
  executiveSummary: string;
  redFlags: RedFlag[];
  recommendedEdits: RecommendedEdit[];
  payload: AuditPayload;
  mode: InferenceMode;
  platform: Platform;
  streamed: boolean;
  contextualStageSource: "on_device" | "skipped";
}

export interface RemoteParam {
  key: string;
  label: string;
  value: string;
  type: "string" | "boolean" | "number";
}

export interface AuditFeedItem {
  id: string;
  platform: Platform;
  source: InferenceSource;
  riskLevel: RiskLevel;
  modelName: string;
  createdAt: number;
  latencyMs?: number;
}

export interface DeviceState {
  status: "checking" | "available" | "unavailable" | "preparing" | "ready";
  progress: number;
  message: string;
}

export interface AppCheckState {
  status: "checking" | "ready" | "needs-setup" | "error";
  message: string;
}

export interface AuthState {
  status: "checking" | "ready" | "error";
  uid?: string;
  message: string;
}

export interface FirebaseState {
  appCheck: AppCheckState;
  auth: AuthState;
  remoteParams: RemoteParam[];
  feed: AuditFeedItem[];
  remoteSource: "defaults" | "live";
}

export interface SessionStats {
  onDeviceShare: number;
  piiEntities: number;
  localLatency: number;
  cloudLatency: number;
  cloudSpendSaved: number;
  totalRuns: number;
}
