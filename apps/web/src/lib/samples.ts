import { SAMPLE_SCENARIOS } from "@veilbrief/core";
import type { Scenario, ScenarioId } from "@/lib/types";

const FALLBACK_TEXT: Record<ScenarioId, string> = {
  "freelance-msa": `MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into on March 14, 2026 by Cobalt Harbor Consulting LLC, a Delaware limited liability company, and its independent contractor.

Contractor: Arjun Mehta
Email: arjun.mehta@example.com
Phone: (415) 555-0142
Social Security Number: 123-45-6789
Mailing address: 1288 Market Street, San Francisco, CA 94103
Agreed Fee Cap: $24,000 ($185/hr)

1. SERVICES
Contractor will provide product strategy, architecture review, and engineering support for deliverables on Client's unannounced Project Nightfall lidar pipeline built at Contractor's Koramangala studio. The statement of work may be updated by Client from time to time, and Contractor will accommodate scope revisions requested by email without an equitable adjustment in fee.

2. FEES AND PAYMENT
Client shall pay approved invoices within ninety days after receipt. Client may withhold payment for any amount it disputes in good faith, even when the disputed amount is unrelated to undisputed work.`,
  "enterprise-dpa": `ENTERPRISE DATA PROCESSING ADDENDUM

This addendum governs provider processing of customer personal data. The provider must maintain a current record of processing activities, subprocessors, transfer mechanisms, retention periods, and technical safeguards.`,
  "medical-invoice": `Review the attached medical invoice for duplicate charges, unfamiliar providers, privacy exposure, balance billing, and unsupported facility fees.`,
};

const DEFINITIONS: Array<{
  id: ScenarioId;
  label: string;
  description: string;
  accent: Scenario["accent"];
}> = [
  {
    id: "freelance-msa",
    label: "Freelance MSA",
    description: "IP, Net-90, uncapped indemnity + redlines",
    accent: "emerald",
  },
  {
    id: "enterprise-dpa",
    label: "Enterprise DPA (>12k)",
    description: "Long-context cloud escalation with zero PII",
    accent: "cobalt",
  },
  {
    id: "medical-invoice",
    label: "Invoice Image (Local)",
    description: "On-device multimodal lock with zero cloud egress",
    accent: "amber",
  },
];

export function getSampleScenarios(): Scenario[] {
  return DEFINITIONS.map((definition) => {
    const source = SAMPLE_SCENARIOS.find(
      (scenario) => scenario.id === definition.id,
    );
    const text = source?.text ?? FALLBACK_TEXT[definition.id];
    return {
      ...definition,
      text,
      imageUrl:
        source?.imagePath ??
        (definition.id === "medical-invoice"
          ? "/samples/sample-invoice.png"
          : undefined),
      estimatedChars: text.length,
    };
  });
}
