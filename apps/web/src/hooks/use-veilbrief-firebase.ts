"use client";

import { initVeilBriefFirebase } from "@veilbrief/core";
import type { HybridRemoteConfig } from "@veilbrief/core";
import type { AI } from "firebase/ai";
import type { AppCheck } from "firebase/app-check";
import { getToken } from "firebase/app-check";
import type { Auth } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import {
  fetchAndActivate,
  getAll,
  type RemoteConfig,
} from "firebase/remote-config";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  configFromRemoteParams,
  getDefaultRemoteParams,
} from "@/lib/core-bridge";
import type {
  AuditFeedItem,
  FirebaseState,
  InferenceSource,
  Platform,
  RemoteParam,
  RiskLevel,
} from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

interface RuntimeRefs {
  ai?: AI;
  auth?: Auth;
  db?: Firestore;
  remoteConfig?: RemoteConfig;
  appCheck?: AppCheck | null;
  config: HybridRemoteConfig;
  warnings: string[];
}

export interface FirebaseRuntime {
  ai?: AI;
  auth?: Auth;
  db?: Firestore;
  remoteConfig?: RemoteConfig;
  appCheck?: AppCheck | null;
  config: HybridRemoteConfig;
  warnings: string[];
}

const INITIAL_STATE: FirebaseState = {
  appCheck: {
    status: "checking",
    message: "Checking Firebase App Check.",
  },
  auth: {
    status: "checking",
    message: "Waiting for anonymous identity.",
  },
  remoteParams: getDefaultRemoteParams(),
  feed: [],
  remoteSource: "defaults",
};

function envConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function hasFirebaseConfig(config: ReturnType<typeof envConfig>) {
  return Boolean(config.apiKey && config.projectId && config.appId);
}

function normalizePlatform(value: unknown): Platform {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text === "macos") return "macos";
  if (text.includes("ios")) return "ios";
  if (text.includes("extension") || text.includes("chrome")) {
    return "chrome-extension";
  }
  return "web";
}

function normalizeSource(value: unknown): InferenceSource {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("cloud") || text.includes("in_cloud")) return "IN_CLOUD";
  if (text.includes("device") || text.includes("on_device")) return "ON_DEVICE";
  return "UNKNOWN";
}

function normalizeRisk(value: unknown): RiskLevel {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (text.includes("critical")) return "critical";
  if (text.includes("high")) return "high";
  if (text.includes("medium") || text.includes("moderate")) return "medium";
  return "low";
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === "object") {
    const record = value as UnknownRecord;
    if (typeof record.toDate === "function") {
      try {
        const date = (record.toDate as () => Date)();
        if (date instanceof Date) return date.getTime();
      } catch {
        return Date.now();
      }
    }
    if (typeof record.seconds === "number") return record.seconds * 1000;
  }
  return Date.now();
}

function remoteValue(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const record = value as UnknownRecord;
  for (const accessor of ["asString", "asBoolean", "asNumber"] as const) {
    if (typeof record[accessor] === "function") {
      try {
        return String((record[accessor] as () => unknown)());
      } catch {
        break;
      }
    }
  }
  return String(record.value ?? record.stringValue ?? "");
}

function mergeRemoteParams(raw: unknown): RemoteParam[] {
  const defaults = getDefaultRemoteParams();
  const values =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  return defaults.map((param) => {
    const incoming = values[param.key];
    return {
      ...param,
      value: incoming ? remoteValue(incoming) : param.value,
    };
  });
}

function feedItem(id: string, raw: unknown): AuditFeedItem {
  const record = raw && typeof raw === "object" ? (raw as UnknownRecord) : {};
  return {
    id,
    platform: normalizePlatform(record.platform ?? record.surface),
    source: normalizeSource(
      record.inferenceSource ?? record.source ?? record.routeMode
    ),
    riskLevel: normalizeRisk(record.riskLevel ?? record.risk ?? record.severity),
    modelName:
      typeof record.modelUsed === "string"
        ? record.modelUsed
        : typeof record.modelName === "string"
        ? record.modelName
        : typeof record.model === "string"
          ? record.model
          : "VeilBrief audit",
    createdAt: normalizeTimestamp(
      record.createdAt ?? record.timestamp ?? record.completedAt
    ),
    latencyMs:
      typeof record.latencyMs === "number"
        ? record.latencyMs
        : typeof record.latency === "number"
          ? record.latency
          : undefined,
  };
}

export function useVeilBriefFirebase() {
  const [state, setState] = useState<FirebaseState>(INITIAL_STATE);
  const refs = useRef<RuntimeRefs>({
    config: configFromRemoteParams(getDefaultRemoteParams()),
    warnings: [],
  });

  const getRuntime = useCallback((): FirebaseRuntime => {
    const runtime = refs.current;
    return {
      ai: runtime.ai,
      auth: runtime.auth,
      db: runtime.db,
      remoteConfig: runtime.remoteConfig,
      appCheck: runtime.appCheck,
      config: runtime.config,
      warnings: runtime.warnings,
    };
  }, []);

  const refreshRemote = useCallback(async () => {
    const remoteConfig = refs.current.remoteConfig;
    if (!remoteConfig) return;

    try {
      remoteConfig.settings.minimumFetchIntervalMillis = 0;
      await fetchAndActivate(remoteConfig);
      const params = mergeRemoteParams(getAll(remoteConfig));
      refs.current.config = configFromRemoteParams(params);
      setState((current) => ({
        ...current,
        remoteParams: params,
        remoteSource: "live",
      }));
    } catch {
      const params = mergeRemoteParams(getAll(remoteConfig));
      refs.current.config = configFromRemoteParams(params);
      setState((current) => ({
        ...current,
        remoteParams: params,
        remoteSource: "defaults",
      }));
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribeAuth: Unsubscribe | undefined;

    async function connect() {
      const config = envConfig();
      const debugToken = process.env.NODE_ENV === "development"
        ? process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN
        : undefined;
      const recaptchaSiteKey =
        process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY;

      if (!hasFirebaseConfig(config)) {
        setState((current) => ({
          ...current,
          appCheck: {
            status: "needs-setup",
            message: "Add the public Firebase environment variables.",
          },
          auth: {
            status: "error",
            message: "Firebase Anonymous Auth is not configured.",
          },
          remoteSource: "defaults",
        }));
        return;
      }

      try {
        const runtime = await initVeilBriefFirebase({
          ...config,
          appCheckDebugToken: debugToken,
          recaptchaSiteKey,
        });
        if (disposed) return;

        refs.current.ai = runtime.ai;
        refs.current.auth = runtime.auth;
        refs.current.db = runtime.firestore;
        refs.current.remoteConfig = runtime.remoteConfig;
        refs.current.appCheck = runtime.appCheck;
        refs.current.config = runtime.config;
        refs.current.warnings = runtime.warnings;

        let appCheckMessage = "App Check attestation is active.";
        let appCheckStatus: FirebaseState["appCheck"]["status"] = "ready";
        if (!runtime.appCheck) {
          appCheckStatus = "needs-setup";
          appCheckMessage =
            "Add NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY or register a debug token.";
        } else {
          try {
            await getToken(runtime.appCheck, false);
          } catch {
            appCheckStatus = "needs-setup";
            appCheckMessage =
              "Register this origin in App Check or add a local debug token.";
          }
        }

        const params = mergeRemoteParams(getAll(runtime.remoteConfig));
        refs.current.config = configFromRemoteParams(params);
        const live = !runtime.warnings.some((warning) =>
          warning.toLowerCase().includes("remote config fetch failed")
        );

        setState((current) => ({
          ...current,
          appCheck: { status: appCheckStatus, message: appCheckMessage },
          auth: {
            status: "ready",
            uid: runtime.user?.uid,
            message: "Anonymous Firebase identity is active.",
          },
          remoteParams: params,
          remoteSource: live ? "live" : "defaults",
        }));

        unsubscribeAuth = onAuthStateChanged(runtime.auth, (user) => {
          if (!user || disposed) return;
          setState((current) => ({
            ...current,
            auth: {
              status: "ready",
              uid: user.uid,
              message: "Anonymous Firebase identity is active.",
            },
          }));
        });
      } catch (error) {
        if (disposed) return;
        const message =
          error instanceof Error ? error.message : "Firebase initialization failed.";
        setState((current) => ({
          ...current,
          appCheck: {
            status: "error",
            message:
              "Firebase initialization failed. Check the public config and App Check setup.",
          },
          auth: {
            status: "error",
            message,
          },
          remoteSource: "defaults",
        }));
      }
    }

    void connect();
    return () => {
      disposed = true;
      unsubscribeAuth?.();
    };
  }, []);

  useEffect(() => {
    const db = refs.current.db;
    const uid = state.auth.uid;
    if (!db || !uid) return;

    let unsubscribe: Unsubscribe | undefined;
    const collectionRef = collection(db, "users", uid, "audits");
    const consume = (snapshot: {
      docs: Array<{ id: string; data: () => UnknownRecord }>;
    }) => {
      setState((current) => ({
        ...current,
        feed: snapshot.docs.map((item) => feedItem(item.id, item.data())),
      }));
    };

    unsubscribe = onSnapshot(
      query(collectionRef, orderBy("createdAt", "desc"), limit(20)),
      consume,
      () => {
        unsubscribe?.();
        unsubscribe = onSnapshot(query(collectionRef, limit(20)), consume, () => {
          setState((current) => ({
            ...current,
            feed: [],
          }));
        });
      }
    );

    return () => unsubscribe?.();
  }, [state.auth.uid]);

  return {
    state,
    getRuntime,
    refreshRemote,
  };
}
