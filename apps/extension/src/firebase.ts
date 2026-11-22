import { initVeilBriefFirebase } from "@veilbrief/core";

function envValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

const firebaseConfig = {
  isLocalDev: import.meta.env.MODE === "development",
  apiKey: envValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: envValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: envValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: envValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: envValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: envValue(import.meta.env.VITE_FIREBASE_APP_ID),
  recaptchaSiteKey: envValue(
    import.meta.env.VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY
  ),
  appCheckDebugToken: import.meta.env.MODE === "development"
    ? envValue(import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN)
    : ""
};

type CloudSession = Awaited<ReturnType<typeof createSession>>;
let sessionPromise: Promise<CloudSession> | null = null;

export function firebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

async function createSession() {
  if (!firebaseConfigured()) {
    throw new Error(
      "Firebase configuration is incomplete. Add the VITE_FIREBASE_* values."
    );
  }

  const runtime = await initVeilBriefFirebase(firebaseConfig);
  const uid = runtime.user?.uid;
  if (!uid) throw new Error("Firebase anonymous identity is unavailable.");
  return { ...runtime, uid };
}

export function ensureCloudSession(): Promise<CloudSession> {
  if (!sessionPromise) {
    sessionPromise = createSession().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }

  return sessionPromise;
}
