import { describe, expect, it } from "vitest";
import type { AI } from "firebase/ai";
import {
  buildScrubbedAuditPayload,
  DEFAULT_REMOTE_CONFIG,
  MalformedAuditResponseError,
  parseAuditResponse,
  resolveInferenceSource,
  runHybridAudit,
  shieldPii,
} from "../src/index.js";

describe("parseAuditResponse & inference attribution", () => {
  it("fails closed with MalformedAuditResponseError when output is invalid", () => {
    expect(() => parseAuditResponse("not json at all")).toThrow(
      MalformedAuditResponseError,
    );
    expect(() =>
      parseAuditResponse(JSON.stringify({ riskLevel: "unknown", summary: "ok" })),
    ).toThrow(MalformedAuditResponseError);
  });

  it("never maps unverified prefer_on_device responses to on_device", () => {
    const resolved = resolveInferenceSource(
      undefined,
      {
        mode: "prefer_on_device",
        targetCloudModel: "gemini-3.5-flash-lite",
        mustScrubForCloud: true,
        reason: "short_doc_prefer_on_device",
      },
      true,
      0,
    );
    expect(resolved.inferenceSource).toBe("unknown");

    const wireResolved = resolveInferenceSource(
      undefined,
      {
        mode: "prefer_on_device",
        targetCloudModel: "gemini-3.5-flash-lite",
        mustScrubForCloud: true,
        reason: "short_doc_prefer_on_device",
      },
      false,
      256,
    );
    expect(wireResolved.inferenceSource).toBe("in_cloud");
  });
});

describe("buildScrubbedAuditPayload", () => {
  it("removes raw PII values and token placeholders from persisted findings", () => {
    const source =
      "Patient: Maya Lin. Email maya.lin@example.com. MRN-482910.";
    const shield = shieldPii(source);
    const payload = buildScrubbedAuditPayload({
      platform: "web",
      inferenceSource: "on_device",
      modelUsed: "Chrome Built-in AI (Gemini Nano)",
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
      modelUsed: "Chrome Built-in AI (Gemini Nano)",
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

  it("falls back to secondary cloud model when primary returns HTTP 500 high demand and streams chunks", async () => {
    const attemptedModels: string[] = [];
    const streamedChunks: string[] = [];

    const validJson = JSON.stringify({
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
          currentText: "Pay [PERSON_1] [AMOUNT_1] within 90 days.",
          suggestedText: "Pay [PERSON_1] [AMOUNT_1] within 30 days at [EMAIL_1].",
          rationale: "Standard commercial billing.",
        },
      ],
    });

    const result = await runHybridAudit({
      platform: "web",
      text: "Contractor: Arjun Mehta\nEmail: arjun.mehta@example.com\nFee: $12,000\nPay Arjun Mehta $12,000 within 90 days.",
      ai: {} as AI,
      config: {
        ...DEFAULT_REMOTE_CONFIG,
        cloud_model_name: "gemini-3.8-flash",
        cloud_fallback_model: "gemini-3.5-flash-lite",
      },
      requestedMode: "only_in_cloud",
      persist: false,
      onStreamChunk: (partial) => streamedChunks.push(partial),
      modelFactory: (_ai, options) => {
        attemptedModels.push(options.route.targetCloudModel);
        return {
          prepareOnDeviceModel: async () => {},
          model: {
            generateContentStream: async (parts: Array<{ text?: string } | string>) => {
              const wire = JSON.stringify(parts);
              expect(wire).not.toContain("Arjun Mehta");
              expect(wire).not.toContain("arjun.mehta@example.com");
              expect(wire).not.toContain("$12,000");

              if (options.route.targetCloudModel === "gemini-3.8-flash") {
                throw new Error(
                  "AI: [500 ] This model is currently experiencing high demand. (AI/fetch-error)",
                );
              }
              return {
                stream: (async function* () {
                  yield { text: () => validJson.slice(0, 40) };
                  yield { text: () => validJson.slice(40) };
                })(),
                response: Promise.resolve({
                  inferenceSource: "in_cloud",
                  text: () => validJson,
                }),
              };
            },
          } as never,
        };
      },
    });

    expect(attemptedModels).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(result.modelUsed).toBe("gemini-3.5-flash-lite");
    expect(result.inferenceSource).toBe("in_cloud");
    expect(result.streamed).toBe(true);
    expect(streamedChunks).toHaveLength(2);
    expect(result.audit.summary).toContain("Arjun Mehta");
    expect(result.audit.recommendedEdits[0]?.suggestedText).toBe(
      "Pay Arjun Mehta $12,000 within 30 days at arjun.mehta@example.com.",
    );
  });

  it("runs Stage 1B on-device contextual scrub before Stage 2 cloud review when Chrome Nano is available", async () => {
    const cloudPayloads: string[] = [];

    const result = await runHybridAudit({
      platform: "web",
      text: "Contractor: Arjun Mehta will deliver Project Nightfall from the Koramangala studio.",
      ai: {} as AI,
      requestedMode: "prefer_on_device",
      persist: false,
      probeAvailability: async () => "available",
      modelFactory: (_ai, options) => {
        const isContextual = Boolean(
          options.onDeviceJsonSchema &&
            "properties" in options.onDeviceJsonSchema &&
            "entities" in (options.onDeviceJsonSchema as { properties: Record<string, unknown> }).properties,
        );

        return {
          prepareOnDeviceModel: async () => {},
          model: {
            generateContent: async (input: unknown) => {
              if (isContextual) {
                return {
                  response: {
                    inferenceSource: "on_device",
                    text: () =>
                      JSON.stringify({
                        entities: [
                          { phrase: "Project Nightfall", reason: "Stealth codename" },
                          { phrase: "Koramangala studio", reason: "Private work location" },
                        ],
                      }),
                  },
                } as never;
              }

              const serialized = JSON.stringify(input);
              cloudPayloads.push(serialized);
              expect(serialized).not.toContain("Project Nightfall");
              expect(serialized).not.toContain("Koramangala studio");
              expect(serialized).toContain("[CONTEXT_1]");
              expect(serialized).toContain("[CONTEXT_2]");

              return {
                response: {
                  inferenceSource: "in_cloud",
                  text: () =>
                    JSON.stringify({
                      riskLevel: "high",
                      summary: "IP clause covers [CONTEXT_1] built at [CONTEXT_2].",
                      redFlags: [],
                      recommendedEdits: [
                        {
                          title: "Carve out prior studio work",
                          currentText: "deliver [CONTEXT_1] from the [CONTEXT_2]",
                          suggestedText: "deliver [CONTEXT_1] built cleanly at [CONTEXT_2]",
                          rationale: "Protects contractor studio background IP.",
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

    expect(cloudPayloads).toHaveLength(1);
    expect(result.contextualStage.ran).toBe(true);
    expect(result.contextualStage.source).toBe("on_device");
    expect(result.contextualStage.entitiesAdded).toBe(2);
    expect(result.shield.tokenMap["[CONTEXT_1]"]).toBe("Project Nightfall");
    expect(result.shield.tokenMap["[CONTEXT_2]"]).toBe("Koramangala studio");
    expect(result.audit.summary).toContain("Project Nightfall");
    expect(result.audit.recommendedEdits[0]?.currentText).toBe(
      "deliver Project Nightfall from the Koramangala studio",
    );
  });

  it("escalates documents exceeding max_on_device_chars to cloud when requestedMode is omitted and deduplicates edits sharing currentText", async () => {
    const longContract = `${"Confidentiality clause with Contractor: Arjun Mehta (arjun@example.com). ".repeat(200)}`;
    expect(longContract.length).toBeGreaterThan(12_000);

    const observedModes: string[] = [];
    const result = await runHybridAudit({
      platform: "web",
      text: longContract,
      ai: {} as AI,
      requestedMode: undefined,
      persist: false,
      probeAvailability: async () => "unavailable",
      modelFactory: (_ai, options) => {
        observedModes.push(options.route.mode);
        return {
          prepareOnDeviceModel: async () => {},
          model: {
            generateContent: async () => ({
              response: {
                inferenceSource: "in_cloud",
                text: () =>
                  JSON.stringify({
                    riskLevel: "medium",
                    summary: "Repeated obligations flagged for [PERSON_1].",
                    redFlags: [],
                    recommendedEdits: [
                      {
                        title: "Cap obligations",
                        currentText: "Confidentiality clause with Contractor: [PERSON_1]",
                        suggestedText: "Mutual confidentiality clause with Contractor: [PERSON_1] lasting 3 years",
                        rationale: "Adds reciprocal scope and fixed duration.",
                      },
                      {
                        title: "Duplicate rewrite on same text",
                        currentText: "  confidentiality clause with contractor: [PERSON_1] ",
                        suggestedText: "Alternate rewrite",
                        rationale: "Should be deduplicated.",
                      },
                    ],
                  }),
              },
            }),
          } as never,
        };
      },
    });

    expect(observedModes).toEqual(["prefer_in_cloud"]);
    expect(result.route.mode).toBe("prefer_in_cloud");
    expect(result.route.reason).toBe("long_doc_cloud_scrubbed");
    expect(result.inferenceSource).toBe("in_cloud");
    expect(result.audit.recommendedEdits).toHaveLength(1);
    expect(result.audit.recommendedEdits[0]?.title).toBe("Cap obligations");
  });

  it("drops recommendedEdits that retain unmapped invented placeholder brackets after rehydration", async () => {
    const result = await runHybridAudit({
      platform: "chrome-extension",
      text: "Contractor: Arjun Mehta agrees to cap total liability at $24,000.",
      ai: {} as AI,
      requestedMode: "only_on_device",
      persist: false,
      probeAvailability: async () => "unavailable",
      modelFactory: () => ({
        prepareOnDeviceModel: async () => {},
        model: {
          generateContent: async () => ({
            response: {
              inferenceSource: "on_device",
              text: () =>
                JSON.stringify({
                  riskLevel: "medium",
                  summary: "Checked [PERSON_1] liability cap.",
                  redFlags: [],
                  recommendedEdits: [
                    {
                      title: "Concrete cap with mapped token",
                      currentText: "cap total liability at [AMOUNT_1]",
                      suggestedText: "cap total liability at [AMOUNT_1] payable within 15 days",
                      rationale: "Rehydrates real dollar cap.",
                    },
                    {
                      title: "Hallucinated placeholder edit",
                      currentText: "Contractor: [PERSON_1]",
                      suggestedText: "Contractor: [PERSON_1] notices due within [NUMBER] days at [SECTION_NUMBER]",
                      rationale: "Should be dropped because [NUMBER] is unmapped.",
                    },
                  ],
                }),
            },
          }),
        } as never,
      }),
    });

    expect(result.audit.recommendedEdits).toHaveLength(1);
    expect(result.audit.recommendedEdits[0]?.title).toBe(
      "Concrete cap with mapped token",
    );
    expect(result.audit.recommendedEdits[0]?.suggestedText).toBe(
      "cap total liability at $24,000 payable within 15 days",
    );
  });
});
