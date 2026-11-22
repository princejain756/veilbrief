import { describe, expect, it } from "vitest";
import {
  buildScrubbedAuditPayload,
  shieldPii,
} from "../src/index.js";

describe("buildScrubbedAuditPayload", () => {
  it("removes raw PII values and token placeholders from persisted findings", () => {
    const source =
      "Patient: Maya Lin. Email maya.lin@example.com. MRN-482910.";
    const shield = shieldPii(source);
    const payload = buildScrubbedAuditPayload({
      platform: "web",
      inferenceSource: "on_device",
      modelUsed: "Gemini Nano 4",
      latencyMs: 42,
      audit: {
        riskLevel: "high",
        summary: "Billing records for Maya Lin reference [PERSON_1].",
        redFlags: [
          {
            title: "Duplicate billing for Maya Lin",
            severity: "high",
            explanation:
              "The record mentions maya.lin@example.com and [PERSON_1] with MRN-482910.",
          },
          {
            title: "Unlisted contact",
            severity: "medium",
            explanation: "Send follow-up to nina.patel@example.com.",
          },
        ],
        recommendedEdits: [],
      },
      shield,
    });
    expect(payload).toEqual({
      platform: "web",
      inferenceSource: "on_device",
      modelUsed: "Gemini Nano 4",
      riskLevel: "high",
      summary: expect.stringContaining("[REDACTED]"),
      redFlags: expect.any(Array),
      piiEntitiesCount: shield.entities.length,
      latencyMs: 42,
      createdAt: expect.anything(),
    });
    const serialized = JSON.stringify(payload);

    for (const rawValue of [
      "Maya Lin",
      "maya.lin@example.com",
      "MRN-482910",
      "nina.patel@example.com",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(rawValue.toLowerCase());
    }
    for (const token of Object.keys(shield.tokenMap)) {
      expect(serialized).not.toContain(token);
    }

    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("tokenMap");
    expect(serialized).not.toContain("currentText");
  });
});
