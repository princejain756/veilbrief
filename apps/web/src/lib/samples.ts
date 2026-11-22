import { SAMPLE_SCENARIOS } from "@veilbrief/core";
import type { Scenario, ScenarioId } from "@/lib/types";

const FALLBACK_TEXT: Record<ScenarioId, string> = {
  "freelance-msa": `MASTER SERVICES AGREEMENT

Client: Northstar Robotics, Inc.
Consultant: Mira Sen Consulting LLC
Contact: mira.sen@example.com
Tax ID: 12-3456789

1. Payment
Client will pay Consultant net 90 days after receipt of an invoice and may withhold disputed amounts.

2. Intellectual property
All deliverables, methods, notes, and pre-existing tools become Client property on creation. Consultant grants a perpetual worldwide license to all background IP.

3. Liability
Consultant indemnifies Client for all claims, including claims caused by Client materials. The liability cap does not apply to Client.

4. Non-compete
For 24 months after termination, Consultant will not work with any company that competes with Client in robotics, automation, logistics, manufacturing, or adjacent industries.`,
  "medical-invoice": `Review the attached medical invoice for duplicate charges, unfamiliar providers, privacy exposure, balance billing, and unsupported facility fees.

Patient: Jordan Ellis
Date of birth: 03/14/1988
Account: MRN-4829107
Email: jordan.ellis@example.com
Phone: (415) 555-0182

The invoice lists imaging twice on the same date and adds an itemized facility surcharge without a matching authorization reference.`,
  "enterprise-dpa": `ENTERPRISE DATA PROCESSING ADDENDUM

This addendum governs provider processing of customer personal data. The provider must maintain a current record of processing activities, subprocessors, transfer mechanisms, retention periods, and technical safeguards.`,
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
    description: "Payment, IP, liability, and non-compete clauses",
    accent: "emerald",
  },
  {
    id: "medical-invoice",
    label: "Medical Invoice PNG",
    description: "Inline vision audit with protected patient details",
    accent: "amber",
  },
  {
    id: "enterprise-dpa",
    label: "Enterprise DPA >12k chars",
    description: "Long-context privacy and subprocessor review",
    accent: "cobalt",
  },
];

export function getSampleScenarios(): Scenario[] {
  return DEFINITIONS.map((definition) => {
    const source = SAMPLE_SCENARIOS.find(
      (scenario) => scenario.id === definition.id
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
