"use client";

import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Cpu,
  HelpCircle,
  KeyRound,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { shortUid } from "@/lib/format";
import type {
  AppCheckState,
  AuthState,
  DeviceState,
} from "@/lib/types";

interface StatusHeaderProps {
  device: DeviceState;
  appCheck: AppCheckState;
  auth: AuthState;
  browserOnline: boolean;
  forcedOffline: boolean;
  preparingModel: boolean;
  onPrepareModel: () => void;
  onToggleOffline: () => void;
}

function appCheckTone(status: AppCheckState["status"]) {
  if (status === "ready") return "pill-emerald";
  if (status === "needs-setup" || status === "error") return "pill-amber";
  return "pill-neutral";
}

function deviceTone(status: DeviceState["status"]) {
  if (status === "ready" || status === "available") return "pill-emerald";
  if (status === "unavailable") return "pill-cobalt";
  return "pill-neutral";
}

function deviceLabel(status: DeviceState["status"]) {
  if (status === "ready") return "On-Device Nano Ready";
  if (status === "available") return "On-Device Nano Available";
  if (status === "unavailable") return "Cloud Shield Active";
  if (status === "preparing") return "Preparing Nano";
  return "Checking Device";
}

export function StatusHeader({
  device,
  appCheck,
  auth,
  browserOnline,
  forcedOffline,
  preparingModel,
  onPrepareModel,
  onToggleOffline,
}: StatusHeaderProps) {
  const [showFlagsGuide, setShowFlagsGuide] = useState(false);

  return (
    <header className="relative border-b border-[var(--border-line)] bg-[var(--bg-surface)]">
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Image
              src="/icon.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-[7px] border border-[var(--border-line)] object-cover"
              priority
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-[680] tracking-[0] text-[var(--text-ink)]">
                  VeilBrief
                </span>
                <span className="hidden rounded-[4px] border border-[var(--border-line)] bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[10px] font-[600] text-[var(--text-muted)] sm:inline">
                  Redline Desk
                </span>
                <Link
                  href="/demo-portal"
                  className="hidden rounded-[4px] border border-[var(--border-line)] px-1.5 py-0.5 text-[10px] font-[560] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-ink)] sm:inline"
                >
                  Demo Portal
                </Link>
              </div>
              <div className="type-meta hidden text-[var(--text-faint)] sm:block">
                Local-first freelance contract shield
              </div>
            </div>
          </div>

          <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
            <div className={`pill type-pill ${deviceTone(device.status)}`}>
              {device.status === "unavailable" ? (
                <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{deviceLabel(device.status)}</span>
            </div>

            {device.status === "available" || device.status === "preparing" ? (
              <button
                type="button"
                className="button-secondary !min-h-7 !py-1 text-[11px]"
                onClick={onPrepareModel}
                disabled={preparingModel}
                title="Download and initialize Chrome built-in Gemini Nano"
              >
                {preparingModel ? (
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Prepare On-Device Nano
              </button>
            ) : (
              device.status === "unavailable" && (
                <button
                  type="button"
                  className="button-ghost !min-h-7 !px-2 text-[11px]"
                  onClick={() => setShowFlagsGuide((open) => !open)}
                  aria-expanded={showFlagsGuide}
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Enable Chrome Nano
                </button>
              )
            )}

            <div className={`pill type-pill ${appCheckTone(appCheck.status)}`}>
              {appCheck.status === "ready" ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                App Check
                <span className="hidden 2xl:inline">
                  {appCheck.status === "ready"
                    ? " verified"
                    : appCheck.status === "checking"
                      ? " checking"
                      : " setup"}
                </span>
              </span>
            </div>

            <div className="pill pill-neutral type-pill font-code">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-sans font-[550]">
                {auth.status === "ready" ? "UID" : "Anonymous Auth"}
              </span>
              {auth.status === "ready" && <span>{shortUid(auth.uid)}</span>}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div
              className={`pill type-pill ${
                browserOnline ? "pill-emerald" : "pill-amber"
              }`}
            >
              {browserOnline ? (
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{browserOnline ? "Online" : "Offline"}</span>
            </div>

            <button
              type="button"
              className={`button-secondary !min-h-8 !px-2.5 text-[11px] ${
                forcedOffline ? "border-[var(--status-amber)]" : ""
              }`}
              onClick={onToggleOffline}
              aria-pressed={forcedOffline}
              title={
                forcedOffline
                  ? "Allow scrubbed cloud escalation"
                  : "Force local-only execution"
              }
            >
              {forcedOffline ? (
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{forcedOffline ? "Offline Lock" : "Hybrid Online"}</span>
            </button>

            <ThemeToggle />
          </div>
        </div>

        {device.status === "preparing" && (
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--border-line)] pt-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--status-emerald)] transition-[width] duration-300"
                style={{ width: `${Math.round(device.progress * 100)}%` }}
              />
            </div>
            <span className="numeral type-meta min-w-12 text-right text-[var(--text-muted)]">
              {Math.round(device.progress * 100)}%
            </span>
          </div>
        )}

        {showFlagsGuide && (
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-[7px] border border-[var(--border-line)] bg-[var(--bg-subtle)] p-3 text-[12px] text-[var(--text-muted)]">
            <div className="space-y-1">
              <div className="font-[620] text-[var(--text-ink)]">
                Optional: Enable Chrome Built-in Gemini Nano for offline runs
              </div>
              <p className="m-0">
                1. In desktop Chrome 138+, open{" "}
                <code className="font-code text-[11px]">
                  chrome://flags/#optimization-guide-on-device-model
                </code>{" "}
                (Enabled BypassPerfRequirement) and{" "}
                <code className="font-code text-[11px]">
                  chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
                </code>{" "}
                (Enabled), then relaunch.
              </p>
              <p className="m-0">
                2. Return here and click{" "}
                <button
                  type="button"
                  className="underline hover:text-[var(--text-ink)]"
                  onClick={onPrepareModel}
                >
                  Prepare On-Device Nano
                </button>
                . Until then, VeilBrief scrubs all PII locally and routes to Firebase Cloud AI.
              </p>
            </div>
            <button
              type="button"
              className="button-ghost !min-h-6 !px-1.5"
              onClick={() => setShowFlagsGuide(false)}
              aria-label="Close setup guide"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
