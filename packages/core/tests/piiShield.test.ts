import { describe, expect, it } from "vitest";
import {
  assertNoRawPii,
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

  it("supports Indian phone numbers and PAN identifiers", () => {
    const shielded = shieldPii(
      "Client: Neha Rao, phone +91 98765 43210, PAN ABCDE1234F.",
    );

    expect(shielded.scrubbed).toContain("[PHONE_1]");
    expect(shielded.scrubbed).toContain("[TAX_ID_1]");
    expect(shielded.scrubbed).not.toContain("Neha Rao");
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
    const source =
      "Contact arjun.mehta@example.com. Backup contact is arjun.mehta@example.com.";
    const shielded = shieldPii(source);

    expect(shielded.entities).toHaveLength(2);
    expect(shielded.entities[0]?.token).toBe("[EMAIL_1]");
    expect(shielded.entities[1]?.token).toBe("[EMAIL_1]");
    expect(Object.keys(shielded.tokenMap)).toEqual(["[EMAIL_1]"]);
    expect(rehydrateText(shielded.scrubbed, shielded.tokenMap)).toBe(source);
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
});
