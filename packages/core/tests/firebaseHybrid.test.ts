import { describe, expect, it } from "vitest";
import type { AI } from "firebase/ai";
import {
  buildScrubbedAuditPayload,
  DEFAULT_REMOTE_CONFIG,
  runHybridAudit,
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

  it("falls back to secondary cloud model when primary returns HTTP 500 high demand", async () => {
    const attemptedModels: string[] = [];
    const result = await runHybridAudit({
      platform: "web",
      text: "Contractor: Arjun Mehta\nEmail: arjun.mehta@example.com\nNet-90 payment applies.",
      ai: {} as AI,
      config: {
        ...DEFAULT_REMOTE_CONFIG,
        cloud_model_name: "gemini-3.8-flash",
        cloud_fallback_model: "gemini-3.5-flash-lite",
      },
      requestedMode: "only_in_cloud",
      persist: false,
      modelFactory: (_ai, options) => {
        attemptedModels.push(options.route.targetCloudModel);
        return {
          prepareOnDeviceModel: async () => {},
          model: {
            generateContent: async (parts: Array<{ text?: string } | string>) => {
              const wire = JSON.stringify(parts);
              expect(wire).not.toContain("Arjun Mehta");
              expect(wire).not.toContain("arjun.mehta@example.com");

              if (options.route.targetCloudModel === "gemini-3.8-flash") {
                throw new Error(
                  "AI: [500 ] This model is currently experiencing high demand. (AI/fetch-error)",
                );
              }
              return {
                response: {
                  inferenceSource: "in_cloud",
                  text: () =>
                    JSON.stringify({
                      riskLevel: "medium",
                      summary: "Payment window favors payer for [PERSON_1].",
                      redFlags: [
                        {
                          title: "Net-90 payment term",
                          severity: "medium",
                          explanation: "Ninety day delay for [PERSON_1].",
                        },
                      ],
                      recommendedEdits: [
                        {
                          title: "Shorten payment window",
                          currentText: "Pay [PERSON_1] within 90 days.",
                          suggestedText: "Pay [PERSON_1] within 30 days at [EMAIL_1].",
                          rationale: "Standard commercial billing.",
                        },
                      ],
                    }),
                },
              } as never;
            },
          } as never,
        };
      },
    });

    expect(attemptedModels).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(result.modelUsed).toBe("gemini-3.5-flash-lite");
    expect(result.inferenceSource).toBe("in_cloud");
    expect(result.audit.recommendedEdits[0]?.suggestedText).toBe(
      "Pay Arjun Mehta within 30 days at arjun.mehta@example.com.",
    );
  });
});
