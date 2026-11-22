"use client";

import { AlertTriangle, ExternalLink, ShieldAlert } from "lucide-react";
import type { AppCheckState, DeviceState } from "@/lib/types";

interface SetupNoticeProps {
  device: DeviceState;
  appCheck: AppCheckState;
  onPrepareModel: () => void;
}

export function SetupNotice({
  device,
  appCheck,
  onPrepareModel,
}: SetupNoticeProps) {
  const needsModel = device.status === "unavailable";
  const needsAppCheck =
    appCheck.status === "needs-setup" || appCheck.status === "error";

  if (!needsModel && !needsAppCheck) return null;

  return (
    <section
      className="rounded-[7px] border border-[color-mix(in_srgb,var(--status-amber)_34%,transparent)] bg-[var(--status-amber-soft)] px-3.5 py-3"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-amber-ink)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-[620] text-[var(--status-amber-ink)]">
            Finish the browser setup for private inference
          </div>
          <div className="mt-1 flex flex-col gap-1.5 text-[12px] leading-[18px] text-[var(--text-muted)]">
            {needsModel && (
              <p className="m-0">
                Open this workbench in Chrome with the built-in LanguageModel
                available, then use Initialize On-Device Model. Strict local
                mode stays visible but cannot start until the model is ready.
              </p>
            )}
            {needsAppCheck && (
              <p className="m-0">
                Register this origin in Firebase App Check, or add your local
                debug token to the public App Check environment variable and
                restart. No token should be committed.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {needsModel && (
            <button
              type="button"
              className="button-secondary !min-h-7 whitespace-nowrap !px-2 text-[11px]"
              onClick={onPrepareModel}
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Retry setup
            </button>
          )}
          <a
            className="button-ghost !min-h-7 !px-1.5 text-[11px]"
            href="https://console.firebase.google.com/"
            target="_blank"
            rel="noreferrer"
            title="Open Firebase console"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Console</span>
          </a>
        </div>
      </div>
    </section>
  );
}
