export type InferenceMode = "auto" | "local" | "cloud";
export type InferenceSource = "ON_DEVICE" | "IN_CLOUD";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type { AuditPlatform as Platform } from "@veilbrief/core";
import type { AuditPlatform as Platform } from "@veilbrief/core";

export type ScenarioId =
  | "freelance-msa"
  | "medical-invoice"
  | "enterprise-dpa";

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

export interface AuditPayload {
  originalText: string;
  scrubbedText: string;
  tokens: PiiToken[];
  rawPiiBytesSent: number;
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
