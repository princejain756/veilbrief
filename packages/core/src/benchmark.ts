import { rehydrateText, shieldPii, type PiiCategory } from "./piiShield.js";

export interface AnnotatedEntity {
  category: PiiCategory;
  value: string;
}

export interface BenchmarkContract {
  id: string;
  label: string;
  text: string;
  expectedEntities: AnnotatedEntity[];
  forbiddenFalsePositives: string[];
}

export interface BenchmarkMetrics {
  contractsEvaluated: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  stressTrapsAvoided: number;
  stressTrapsTotal: number;
  roundTripExact: number;
}

export const SYNTHETIC_BENCHMARK_CORPUS: BenchmarkContract[] = [
  {
    id: "01-us-freelance-msa",
    label: "US SaaS Consulting MSA",
    text: "Contractor: Arjun Mehta\nEmail: arjun.mehta@example.com\nPhone: (415) 555-0142\nSSN: 123-45-6789\nMailing address: 1288 Market Street, San Francisco, CA 94103\nClient shall pay Contractor $24,000 within 90 days.",
    expectedEntities: [
      { category: "PERSON", value: "Arjun Mehta" },
      { category: "EMAIL", value: "arjun.mehta@example.com" },
      { category: "PHONE", value: "(415) 555-0142" },
      { category: "TAX_ID", value: "123-45-6789" },
      { category: "ADDRESS", value: "1288 Market Street, San Francisco, CA 94103" },
      { category: "AMOUNT", value: "$24,000" },
    ],
    forbiddenFalsePositives: ["Client shall pay", "shall pay Contractor"],
  },
  {
    id: "02-india-freelance-pan",
    label: "India AI Consulting SOW",
    text: "Consultant: Neha Rao\nEmail: neha.rao@bengalurudev.in\nPhone: +91 98765 43210\nPAN: ABCDE1234F\nMailing address: 42, 3rd Cross, J.P. Nagar 4th Phase, Bengaluru 560078\nRetainer: ₹2,50,000.00\nContractor will retain background IP.",
    expectedEntities: [
      { category: "PERSON", value: "Neha Rao" },
      { category: "EMAIL", value: "neha.rao@bengalurudev.in" },
      { category: "PHONE", value: "+91 98765 43210" },
      { category: "TAX_ID", value: "ABCDE1234F" },
      { category: "ADDRESS", value: "42, 3rd Cross, J.P. Nagar 4th Phase, Bengaluru 560078" },
      { category: "AMOUNT", value: "₹2,50,000.00" },
    ],
    forbiddenFalsePositives: ["Contractor will retain", "will retain background"],
  },
  {
    id: "03-eu-sepa-iban",
    label: "German Engineering Retainer",
    text: "Signatory: Lukas Weber\nContact: lukas.weber@example.de\nIBAN: DE89370400440532013000\nMonthly Fee: 4,800.00 EUR\nCompany may terminate only for cause.",
    expectedEntities: [
      { category: "PERSON", value: "Lukas Weber" },
      { category: "EMAIL", value: "lukas.weber@example.de" },
      { category: "ACCOUNT", value: "DE89370400440532013000" },
      { category: "AMOUNT", value: "4,800.00 EUR" },
    ],
    forbiddenFalsePositives: ["Company may terminate"],
  },
  {
    id: "04-uk-design-contractor",
    label: "UK Product Design SOW",
    text: "Representative: Claire Bennett\nEmail: claire@studio-north.co.uk\nIBAN: GB29NWBK60161331926819\nAddress: 14 Clerkenwell Road, London EC1M 5PS\nDay Rate: $950.00\nClient will indemnify Designer.",
    expectedEntities: [
      { category: "PERSON", value: "Claire Bennett" },
      { category: "EMAIL", value: "claire@studio-north.co.uk" },
      { category: "ACCOUNT", value: "GB29NWBK60161331926819" },
      { category: "ADDRESS", value: "14 Clerkenwell Road, London EC1M 5PS" },
      { category: "AMOUNT", value: "$950.00" },
    ],
    forbiddenFalsePositives: ["Client will indemnify"],
  },
  {
    id: "05-legal-verb-stress-trap",
    label: "Boilerplate Legal Clause Stress Test",
    text: "Client shall pay undisputed invoices within 30 days. Contractor will deliver source files upon payment. Signatory acknowledges fiduciary duties. Attn: Privacy Operations. Consultant shall maintain commercial coverage.",
    expectedEntities: [],
    forbiddenFalsePositives: [
      "Client shall pay",
      "Contractor will deliver",
      "Signatory acknowledges fiduciary",
      "Privacy Operations",
      "Consultant shall maintain",
    ],
  },
  {
    id: "06-ein-agency-subcontract",
    label: "Delaware Subcontractor Agreement",
    text: "Contractor Name: Priya Shah\nEmail: priya@vertex-studio.example\nEIN: 12-3456789\nPhone: 415-555-0199\nFee: $18,500",
    expectedEntities: [
      { category: "PERSON", value: "Priya Shah" },
      { category: "EMAIL", value: "priya@vertex-studio.example" },
      { category: "TAX_ID", value: "12-3456789" },
      { category: "PHONE", value: "415-555-0199" },
      { category: "AMOUNT", value: "$18,500" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "07-medical-claim-review",
    label: "Out-of-Network Medical Billing Notice",
    text: "Patient: Maya Lin\nMRN-482910\nEmail: maya.lin@example.com\nPhone: (646) 555-0114\nFacility surcharge: $185.00\nDuplicate imaging line: $420.00",
    expectedEntities: [
      { category: "PERSON", value: "Maya Lin" },
      { category: "ACCOUNT", value: "482910" },
      { category: "EMAIL", value: "maya.lin@example.com" },
      { category: "PHONE", value: "(646) 555-0114" },
      { category: "AMOUNT", value: "$185.00" },
      { category: "AMOUNT", value: "$420.00" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "08-enterprise-dpa-contacts",
    label: "Enterprise DPA Signatory Block",
    text: "Customer notice contact:\nName: Elena Vasquez\nEmail: elena.vasquez@example.com\nPhone: (212) 555-0187\nAddress: 455 Madison Avenue, New York, NY 10022\nProcessor security contact:\nName: Daniel Okafor\nEmail: daniel.okafor@example.com",
    expectedEntities: [
      { category: "PERSON", value: "Elena Vasquez" },
      { category: "EMAIL", value: "elena.vasquez@example.com" },
      { category: "PHONE", value: "(212) 555-0187" },
      { category: "ADDRESS", value: "455 Madison Avenue, New York, NY 10022" },
      { category: "PERSON", value: "Daniel Okafor" },
      { category: "EMAIL", value: "daniel.okafor@example.com" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "09-indian-gst-retainer",
    label: "Indian Security Audit Engagement",
    text: "Client Name: Vikram Desai\nPhone: +91-9123456780\nPAN: BNZPM2501F\nBank account: 914010034829101\nAudit Fee: INR 1,75,000",
    expectedEntities: [
      { category: "PERSON", value: "Vikram Desai" },
      { category: "PHONE", value: "+91-9123456780" },
      { category: "TAX_ID", value: "BNZPM2501F" },
      { category: "ACCOUNT", value: "914010034829101" },
      { category: "AMOUNT", value: "INR 1,75,000" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "10-credit-card-expense-addendum",
    label: "Reimbursable Corporate Travel Addendum",
    text: "Signatory: Jordan Ellis\nCorporate Card: 4532 0151 1283 0366\nContact: jordan.ellis@example.org\nPre-approved cap: $3,200.00",
    expectedEntities: [
      { category: "PERSON", value: "Jordan Ellis" },
      { category: "ACCOUNT", value: "4532 0151 1283 0366" },
      { category: "EMAIL", value: "jordan.ellis@example.org" },
      { category: "AMOUNT", value: "$3,200.00" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "11-fractional-ml-advisor",
    label: "Fractional ML Advisor Agreement",
    text: "Advisor notice:\nContractor: Hannah Kim\nEmail: hannah.kim@ml-advisory.example\nPhone: +1 650 555 0175\nSSN: 987-65-4321\nMonthly stipend: $6,500",
    expectedEntities: [
      { category: "PERSON", value: "Hannah Kim" },
      { category: "EMAIL", value: "hannah.kim@ml-advisory.example" },
      { category: "PHONE", value: "+1 650 555 0175" },
      { category: "TAX_ID", value: "987-65-4321" },
      { category: "AMOUNT", value: "$6,500" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "12-long-id-boundary-check",
    label: "Order ID & Lowercase Non-PAN Boundary Stress",
    text: "Tracking ID: 9988776655443322 (not a phone or Luhn card: 4111 1111 1111 1112). Ref token: abcde1234f. Fake IBAN: FR00123456789012345678901. Signatory may assign subcontractors only with written consent.",
    expectedEntities: [],
    forbiddenFalsePositives: [
      "9988776655443322",
      "4111 1111 1111 1112",
      "abcde1234f",
      "FR00123456789012345678901",
      "Signatory may assign",
    ],
  },
  {
    id: "13-us-mobile-app-sow",
    label: "iOS Contract Engineering SOW",
    text: "Contractor: Mateo Silva\nEmail: mateo@swiftcraft.dev\nAddress: 742 Evergreen Terrace, Suite 2B, Austin, TX 78701\nMilestone payout: $45,000 USD\nClient shall verify milestones within 5 business days.",
    expectedEntities: [
      { category: "PERSON", value: "Mateo Silva" },
      { category: "EMAIL", value: "mateo@swiftcraft.dev" },
      { category: "ADDRESS", value: "742 Evergreen Terrace, Suite 2B, Austin, TX 78701" },
      { category: "AMOUNT", value: "$45,000 USD" },
    ],
    forbiddenFalsePositives: ["Client shall verify"],
  },
  {
    id: "14-apostrophe-hyphen-person",
    label: "Apostrophe & Hyphenated Signatory Names",
    text: "Signatory: Anne-Marie O'Connor\nEmail: am.oconnor@example.com\nPhone: (312) 555-0133\nKill fee: $2,750",
    expectedEntities: [
      { category: "PERSON", value: "Anne-Marie O'Connor" },
      { category: "EMAIL", value: "am.oconnor@example.com" },
      { category: "PHONE", value: "(312) 555-0133" },
      { category: "AMOUNT", value: "$2,750" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "15-repeated-multi-party-nda",
    label: "Mutual NDA with Repeated Contact Tokens",
    text: "Contact: Helena Brooks (helena.brooks@example.com). Duplicate notices also go to helena.brooks@example.com. Phone: (206) 555-0166.",
    expectedEntities: [
      { category: "PERSON", value: "Helena Brooks" },
      { category: "EMAIL", value: "helena.brooks@example.com" },
      { category: "EMAIL", value: "helena.brooks@example.com" },
      { category: "PHONE", value: "(206) 555-0166" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "16-indemnity-cap-contract",
    label: "Security Pen-Test MSA",
    text: "Consultant: Rohan Kulkarni\nPhone: 9820123456\nPAN: AAACR5055K\nLiability Cap: $15,000\nContractor is solely responsible for taxes.",
    expectedEntities: [
      { category: "PERSON", value: "Rohan Kulkarni" },
      { category: "PHONE", value: "9820123456" },
      { category: "TAX_ID", value: "AAACR5055K" },
      { category: "AMOUNT", value: "$15,000" },
    ],
    forbiddenFalsePositives: ["Contractor is solely"],
  },
  {
    id: "17-french-sepa-iban",
    label: "Paris Localization Contract",
    text: "Contractor: Camille Laurent\nEmail: camille@lingua.fr\nIBAN: FR1420041010050500013M02606\nFixed Fee: EUR 7,400",
    expectedEntities: [
      { category: "PERSON", value: "Camille Laurent" },
      { category: "EMAIL", value: "camille@lingua.fr" },
      { category: "ACCOUNT", value: "FR1420041010050500013M02606" },
      { category: "AMOUNT", value: "EUR 7,400" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "18-texas-freight-broker-msa",
    label: "Texas Logistics Software MSA",
    text: "Client Name: Omar Farooq\nEIN: 84-2190441\nAccount no.: 78001234991\nMailing address: 910 Congress Avenue, Austin, TX 78701\nMonthly retainer: $9,200",
    expectedEntities: [
      { category: "PERSON", value: "Omar Farooq" },
      { category: "TAX_ID", value: "84-2190441" },
      { category: "ACCOUNT", value: "78001234991" },
      { category: "ADDRESS", value: "910 Congress Avenue, Austin, TX 78701" },
      { category: "AMOUNT", value: "$9,200" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "19-indian-upi-invoice-schedule",
    label: "Mumbai Video Production SOW",
    text: "Consultant: Ananya Iyer\nPhone: +91 98190 11223\nEmail: ananya@framecut.in\nMailing address: 18 Carter Road, Bandra West, Mumbai 400050\nFee: Rs. 1,40,000",
    expectedEntities: [
      { category: "PERSON", value: "Ananya Iyer" },
      { category: "PHONE", value: "+91 98190 11223" },
      { category: "EMAIL", value: "ananya@framecut.in" },
      { category: "ADDRESS", value: "18 Carter Road, Bandra West, Mumbai 400050" },
      { category: "AMOUNT", value: "Rs. 1,40,000" },
    ],
    forbiddenFalsePositives: [],
  },
  {
    id: "20-multi-line-clean-clauses",
    label: "Clean Commercial Clause Audit",
    text: "Client shall provide written notice at least thirty days prior to non-renewal. Contractor retains all pre-existing libraries. Payment due Net-30 at $150/hr capped at $18,000.",
    expectedEntities: [
      { category: "AMOUNT", value: "$150" },
      { category: "AMOUNT", value: "$18,000" },
    ],
    forbiddenFalsePositives: ["Client shall provide", "Contractor retains all"],
  },
];

export function evaluateBenchmark(): BenchmarkMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let roundTripExact = 0;
  let stressTrapsAvoided = 0;
  let stressTrapsTotal = 0;

  for (const doc of SYNTHETIC_BENCHMARK_CORPUS) {
    const result = shieldPii(doc.text, { maskAmounts: true });
    if (rehydrateText(result.scrubbed, result.tokenMap) === doc.text) {
      roundTripExact += 1;
    }

    const expectedPool = doc.expectedEntities.map((e) => ({
      ...e,
      matched: false,
    }));

    for (const detected of result.entities) {
      const idx = expectedPool.findIndex(
        (exp) =>
          !exp.matched &&
          exp.category === detected.category &&
          exp.value === detected.original,
      );
      if (idx >= 0) {
        expectedPool[idx]!.matched = true;
        truePositives += 1;
      } else {
        falsePositives += 1;
      }
    }

    for (const exp of expectedPool) {
      if (!exp.matched) {
        falseNegatives += 1;
      }
    }

    for (const trap of doc.forbiddenFalsePositives) {
      stressTrapsTotal += 1;
      if (result.scrubbed.includes(trap)) {
        stressTrapsAvoided += 1;
      }
    }
  }

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 1;
  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 1;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    contractsEvaluated: SYNTHETIC_BENCHMARK_CORPUS.length,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    stressTrapsAvoided,
    stressTrapsTotal,
    roundTripExact,
  };
}
