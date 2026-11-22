import type { Platform, RiskLevel } from "@/lib/types";

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatChars(value: number): string {
  return `${formatInteger(value)} chars`;
}

export function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return "just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function riskLabel(value: RiskLevel): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function riskClass(value: RiskLevel): string {
  if (value === "critical" || value === "high") return "pill-crimson";
  if (value === "medium") return "pill-amber";
  return "pill-emerald";
}

export function sourceLabel(value: "ON_DEVICE" | "IN_CLOUD"): string {
  return value === "ON_DEVICE" ? "On device" : "In cloud";
}

export function platformLabel(value: Platform): string {
  if (value === "chrome-extension") return "Chrome extension";
  if (value === "macos") return "macOS";
  if (value === "ios") return "iOS";
  return "Web";
}

export function inferModeLabel(value: string): string {
  if (value === "auto") return "Auto hybrid";
  if (value === "local") return "Strict local";
  if (value === "cloud") return "Scrubbed cloud";
  return value;
}

export function shortUid(value: string | undefined): string {
  if (!value) return "No UID";
  return `${value.slice(0, 8)}...`;
}

export function filenameFromPath(value: string): string {
  const clean = value.split("?")[0] ?? value;
  return clean.split("/").filter(Boolean).at(-1) ?? "document";
}
