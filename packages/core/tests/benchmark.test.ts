import { describe, expect, it } from "vitest";
import { evaluateBenchmark } from "../src/index.js";

describe("20-contract synthetic PII shield benchmark", () => {
  it("achieves high precision/recall, zero stress-trap false positives, and 100% rehydration accuracy", () => {
    const metrics = evaluateBenchmark();
    expect(metrics.contractsEvaluated).toBe(20);
    expect(metrics.roundTripExact).toBe(20);
    expect(metrics.stressTrapsAvoided).toBe(metrics.stressTrapsTotal);
    expect(metrics.precision).toBeGreaterThanOrEqual(0.97);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.97);
    expect(metrics.f1).toBeGreaterThanOrEqual(0.97);
  });
});
