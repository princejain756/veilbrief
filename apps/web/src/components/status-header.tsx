"use client";

import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Cpu,
  KeyRound,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import Image from "next/image";
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
  if (status === "unavailable") return "pill-amber";
  return "pill-neutral";
}

function deviceLabel(status: DeviceState["status"]) {
  if (status === "ready") return "Gemini Nano 4 ready";
  if (status === "available") return "Gemini Nano 4 available";
  if (status === "unavailable") return "Setup needed";
  if (status === "preparing") return "Preparing model";
  return "Checking device";
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
  return (
    <header className="border-b border-[var(--border-line)] bg-[var(--bg-surface)]">
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
                  Workbench
                </span>
              </div>
              <div className="type-meta hidden text-[var(--text-faint)] sm:block">
                Local-first contract review
              </div>
            </div>
          </div>

          <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
            <div className={`pill type-pill ${deviceTone(device.status)}`}>
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{deviceLabel(device.status)}</span>
            </div>
            <button
              type="button"
              className="button-secondary !min-h-7 !py-1 text-[11px]"
              onClick={onPrepareModel}
              disabled={preparingModel || device.status === "ready"}
              title="Trigger Chrome's user-activated on-device model setup"
            >
              {preparingModel ? (
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                  aria-hidden="true"
                />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Initialize On-Device Model
            </button>

            <div className={`pill type-pill ${appCheckTone(appCheck.status)}`}>
              {appCheck.status === "ready" ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>App Check</span>
              <span className="hidden 2xl:inline">
                {appCheck.status === "ready"
                  ? "verified"
                  : appCheck.status === "checking"
                    ? "checking"
                    : "setup"}
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
              <span>{browserOnline ? "Browser online" : "Browser offline"}</span>
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
              <span>{forcedOffline ? "Offline only" : "Online mode"}</span>
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
      </div>
    </header>
  );
}
