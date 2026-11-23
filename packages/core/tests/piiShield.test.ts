import { describe, expect, it } from "vitest";
import {
  assertNoRawPii,
  auditWirePayload,
  mergeContextualEntities,
  passesIbanMod97,
  rehydrateText,
  shieldPii,
  type PiiCategory,
} from "../src/index.js";

describe("shieldPii", () => {
  const source = [
    "Contractor: Arjun Mehta",
    "Email: arjun.mehta@example.com",
    "Phone: (415) 555-0142",
    "SSN: 123-45-6789",
    "MRN-482910",
    "Account number: 123456789012",
    "Address: 1288 Market Street, San Francisco, CA 94103",
    "Invoice total: $1,280.50",
  ].join("\n");

  it("detects each supported category and leaves no raw values", () => {
    const shielded = shieldPii(source, { maskAmounts: true });
    const expectedCategories: PiiCategory[] = [
      "PERSON",
      "EMAIL",
      "PHONE",
      "TAX_ID",
      "ACCOUNT",
      "ADDRESS",
      "AMOUNT",
    ];

    expect(
      [...new Set(shielded.entities.map((entity) => entity.category))].sort(),
    ).toEqual([...expectedCategories].sort());

    for (const entity of shielded.entities) {
      expect(shielded.scrubbed).not.toContain(entity.original);
      expect(shielded.tokenMap[entity.token]).toBe(entity.original);
    }

    expect(() =>
      assertNoRawPii(shielded.scrubbed, shielded.entities),
    ).not.toThrow();
    expect(shielded.scrubbed).toContain("[EMAIL_1]");
    expect(shielded.scrubbed).toContain("[PERSON_1]");
  });

  it("round-trips through token rehydration", () => {
    const shielded = shieldPii(source, { maskAmounts: true });

    expect(rehydrateText(shielded.scrubbed, shielded.tokenMap)).toBe(source);
    expect(shielded.diffSegments.some((segment) => segment.type === "entity")).toBe(
      true,
    );
  });

  it("does not misclassify legal obligations like 'Client shall pay' as person names", () => {
    const contractText = [
      "2. FEES AND PAYMENT",
      "Client shall pay approved invoices within ninety days after receipt.",
      "Contractor will deliver the work and Signatory acknowledges the terms.",
      "Attn: Privacy Operations",
      "Contractor: Arjun Mehta",
    ].join("\n");

    const shielded = shieldPii(contractText, { maskAmounts: true });
    const people = shielded.entities.filter((e) => e.category === "PERSON");

    expect(people.map((p) => p.original)).toEqual(["Arjun Mehta"]);
    expect(shielded.scrubbed).toContain("Client shall pay approved invoices");
    expect(shielded.scrubbed).toContain("Contractor will deliver the work");
    expect(shielded.scrubbed).toContain("Attn: Privacy Operations");
  });

  it("supports Indian phones, uppercase PAN, Mod-97 IBANs, and Indian addresses", () => {
    const shielded = shieldPii(
      [
        "Client: Neha Rao",
        "Phone: +91 98765 43210",
        "PAN: ABCDE1234F",
        "Reference code: lowercase1x (must not match PAN)",
        "IBAN: DE89370400440532013000",
        "Fake IBAN: DE00370400440532013000",
        "Mailing address: 42, 3rd Cross, J.P. Nagar 4th Phase, Bengaluru 560078",
      ].join("\n"),
      { maskAmounts: true },
    );

    expect(shielded.scrubbed).toContain("[PERSON_1]");
    expect(shielded.scrubbed).toContain("[PHONE_1]");
    expect(shielded.scrubbed).toContain("[TAX_ID_1]");
    expect(shielded.scrubbed).toContain("lowercase1x");
    expect(shielded.scrubbed).toContain("DE00370400440532013000");
    expect(shielded.scrubbed).not.toContain("DE89370400440532013000");
    expect(shielded.scrubbed).not.toContain("Bengaluru 560078");
    expect(passesIbanMod97("DE89370400440532013000")).toBe(true);
    expect(passesIbanMod97("DE00370400440532013000")).toBe(false);
  });

  it("does not slice longer numeric IDs into false phone matches", () => {
    const shielded = shieldPii(
      "Internal ticket ID 98765432109876 and Account number: 1234567890.",
    );

    expect(shielded.entities.filter((e) => e.category === "PHONE")).toHaveLength(0);
    expect(shielded.entities.find((e) => e.category === "ACCOUNT")?.original).toBe(
      "1234567890",
    );
  });

  it("supports multiword person cues, EIN values, and non-dollar amounts", () => {
    const shielded = shieldPii(
      "Client Name: Priya Shah\nEIN: 12-3456789\nRetainer: ₹2,50,000.00\nFee: 1.250,00 EUR",
      { maskAmounts: true },
    );

    expect(shielded.scrubbed).toContain("[PERSON_1]");
    expect(shielded.scrubbed).toContain("[TAX_ID_1]");
    expect(shielded.scrubbed).toContain("[AMOUNT_1]");
    expect(shielded.scrubbed).toContain("[AMOUNT_2]");
    expect(shielded.scrubbed).not.toContain("Priya Shah");
    expect(shielded.scrubbed).not.toContain("12-3456789");
  });

  it("uses a stable token for repeated values and preserves round-trip text", () => {
    const text =
      "Contact arjun.mehta@example.com. Backup contact is arjun.mehta@example.com.";
    const shielded = shieldPii(text);

    expect(shielded.entities).toHaveLength(2);
    expect(shielded.entities[0]?.token).toBe("[EMAIL_1]");
    expect(shielded.entities[1]?.token).toBe("[EMAIL_1]");
    expect(Object.keys(shielded.tokenMap)).toEqual(["[EMAIL_1]"]);
    expect(rehydrateText(shielded.scrubbed, shielded.tokenMap)).toBe(text);
  });

  it("merges on-device contextual phrases into [CONTEXT_N] tokens and round-trips", () => {
    const text =
      "Contractor: Arjun Mehta will build Project Nightfall at the Koramangala studio.";
    const base = shieldPii(text, { maskAmounts: true });
    const merged = mergeContextualEntities(base, [
      { phrase: "Project Nightfall", reason: "Stealth codename" },
      { phrase: "Koramangala studio", reason: "Private studio location" },
    ]);

    expect(merged.scrubbed).toBe(
      "Contractor: [PERSON_1] will build [CONTEXT_1] at the [CONTEXT_2].",
    );
    expect(merged.tokenMap["[CONTEXT_1]"]).toBe("Project Nightfall");
    expect(merged.tokenMap["[CONTEXT_2]"]).toBe("Koramangala studio");
    expect(rehydrateText(merged.scrubbed, merged.tokenMap)).toBe(text);
  });

  it("throws when a raw entity survives in scrubbed output", () => {
    const shielded = shieldPii("Email: arjun.mehta@example.com");
    expect(() =>
      assertNoRawPii(
        "Email: arjun.mehta@example.com and [EMAIL_1]",
        shielded.entities,
      ),
    ).toThrow(/EMAIL/);
  });

  it("computes SHA-256 and detects leaked raw PII in wire payloads", async () => {
    const shielded = shieldPii("Contractor: Arjun Mehta\nEmail: arjun@example.com");
    const cleanAudit = await auditWirePayload(
      JSON.stringify({ contents: [{ parts: [{ text: shielded.scrubbed }] }] }),
      "firebasevertexai.googleapis.com",
      shielded.entities,
    );
    expect(cleanAudit.verifiedZeroRawPii).toBe(true);
    expect(cleanAudit.wirePayloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cleanAudit.wireBytesSent).toBeGreaterThan(20);

    const dirtyAudit = await auditWirePayload(
      JSON.stringify({ contents: [{ parts: [{ text: "Leak arjun@example.com" }] }] }),
      "firebasevertexai.googleapis.com",
      shielded.entities,
    );
    expect(dirtyAudit.verifiedZeroRawPii).toBe(false);
    expect(dirtyAudit.canaryLeakCategories).toContain("EMAIL");
    expect(dirtyAudit.rawPiiBytesLeaked).toBeGreaterThan(0);

    const onDeviceAudit = await auditWirePayload(null, null, shielded.entities);
    expect(onDeviceAudit.wireBytesSent).toBe(0);
    expect(onDeviceAudit.wirePayloadSha256).toBeNull();
    expect(onDeviceAudit.verifiedZeroRawPii).toBe(true);
  });
});
