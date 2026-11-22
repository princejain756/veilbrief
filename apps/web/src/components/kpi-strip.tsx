"use client";

import {
  CircleDollarSign,
  Cpu,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import {
  formatCurrency,
  formatInteger,
  formatPercent,
} from "@/lib/format";

interface KpiStripProps {
  onDeviceShare: number;
  piiEntities: number;
  localLatency: number;
  cloudLatency: number;
  cloudSpendSaved: number;
  totalRuns: number;
}

interface KpiCardProps {
  label: string;
  value: string;
  secondary?: string;
  hint: string;
  icon: React.ReactNode;
}

function KpiCard({ label, value, secondary, hint, icon }: KpiCardProps) {
  return (
    <div className="app-card min-h-[7rem] p-3.5 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="type-kpi-label text-[var(--text-muted)]">{label}</span>
        <span className="text-[var(--text-faint)]">{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="numeral type-kpi-value text-[var(--text-ink)]">
          {value}
        </span>
        {secondary && (
          <span className="numeral text-[13px] font-[560] text-[var(--text-muted)]">
            {secondary}
          </span>
        )}
      </div>
      <div className="type-meta mt-1 text-[var(--text-faint)]">{hint}</div>
    </div>
  );
}

export function KpiStrip({
  onDeviceShare,
  piiEntities,
  localLatency,
  cloudLatency,
  cloudSpendSaved,
  totalRuns,
}: KpiStripProps) {
  return (
    <section
      aria-label="Workbench metrics"
      className="grid grid-cols-2 gap-3 xl:grid-cols-4"
    >
      <KpiCard
        label="On-Device Share"
        value={formatPercent(onDeviceShare)}
        hint={
          totalRuns
            ? `${formatInteger(totalRuns)} audit runs this session`
            : "No audit runs yet"
        }
        icon={<Cpu className="h-4 w-4" aria-hidden="true" />}
      />
      <KpiCard
        label="PII Entities Shielded Locally"
        value={formatInteger(piiEntities)}
        hint="Exact replacements kept outside cloud prompts"
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
      />
      <KpiCard
        label="Avg Latency"
        value={formatInteger(localLatency)}
        secondary={`ms local / ${formatInteger(cloudLatency)} ms cloud`}
        hint="Measured across completed audits"
        icon={<TimerReset className="h-4 w-4" aria-hidden="true" />}
      />
      <KpiCard
        label="Est. Cloud Spend Saved"
        value={formatCurrency(cloudSpendSaved)}
        hint="Approximate model spend avoided by local runs"
        icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
      />
    </section>
  );
}
