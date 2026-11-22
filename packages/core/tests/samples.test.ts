import { describe, expect, it } from "vitest";
import { DEFAULT_REMOTE_CONFIG, SAMPLE_SCENARIOS } from "../src/index.js";

describe("SAMPLE_SCENARIOS", () => {
  it("contains the three required synthetic scenarios", () => {
    expect(SAMPLE_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "freelance-msa",
      "medical-invoice",
      "enterprise-dpa",
    ]);
  });

  it("points the medical invoice at the sample image", () => {
    const invoice = SAMPLE_SCENARIOS.find(
      (scenario) => scenario.id === "medical-invoice",
    );

    expect(invoice?.imagePath).toBe("/samples/sample-invoice.png");
    expect(invoice?.text).toContain("$420.00");
    expect(invoice?.text).toContain("$185.00");
  });

  it("keeps the enterprise DPA above the remote-config character threshold", () => {
    const dpa = SAMPLE_SCENARIOS.find(
      (scenario) => scenario.id === "enterprise-dpa",
    );

    expect(dpa?.text.length).toBeGreaterThan(13_000);
    expect(dpa?.text.length).toBeGreaterThan(
      DEFAULT_REMOTE_CONFIG.max_on_device_chars,
    );
  });
});
