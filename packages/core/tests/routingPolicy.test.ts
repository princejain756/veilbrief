import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_CONFIG,
  selectExecutionRoute,
} from "../src/index.js";

describe("selectExecutionRoute", () => {
  it("locks to on-device processing while offline", () => {
    const route = selectExecutionRoute(DEFAULT_REMOTE_CONFIG, {
      textLength: 900,
      isOffline: true,
    });

    expect(route).toEqual({
      mode: "only_on_device",
      targetCloudModel: "gemini-3.8-flash",
      mustScrubForCloud: false,
      reason: "offline_only_on_device",
    });
  });

  it("prefers on-device processing for a short document", () => {
    const route = selectExecutionRoute(DEFAULT_REMOTE_CONFIG, {
      textLength: 4_000,
    });

    expect(route.mode).toBe("prefer_on_device");
    expect(route.reason).toBe("short_doc_prefer_on_device");
    expect(route.mustScrubForCloud).toBe(true);
  });

  it("escalates a long document to a scrubbed cloud route", () => {
    const route = selectExecutionRoute(DEFAULT_REMOTE_CONFIG, {
      textLength: DEFAULT_REMOTE_CONFIG.max_on_device_chars + 1,
    });

    expect(route.mode).toBe("prefer_in_cloud");
    expect(route.reason).toBe("long_doc_cloud_scrubbed");
    expect(route.mustScrubForCloud).toBe(true);
    expect(route.targetCloudModel).toBe("gemini-3.8-flash");
  });

  it("honors a strict local-only remote policy", () => {
    const route = selectExecutionRoute(
      {
        ...DEFAULT_REMOTE_CONFIG,
        default_inference_mode: "only_on_device",
      },
      {
        textLength: 50_000,
      },
    );

    expect(route.mode).toBe("only_on_device");
    expect(route.mustScrubForCloud).toBe(false);
  });

  it("uses Remote Config cloud model overrides", () => {
    const route = selectExecutionRoute(
      {
        ...DEFAULT_REMOTE_CONFIG,
        cloud_model_name: "gemini-3.5-flash-lite",
        cloud_fallback_model: "gemini-3.8-flash",
      },
      {
        textLength: 40_000,
      },
    );

    expect(route.targetCloudModel).toBe("gemini-3.5-flash-lite");
  });

  it("routes PDF and heavy inputs to the fallback model with a shield", () => {
    const route = selectExecutionRoute(DEFAULT_REMOTE_CONFIG, {
      textLength: 2_000,
      isPdfOrHeavy: true,
    });

    expect(route.mode).toBe("prefer_in_cloud");
    expect(route.targetCloudModel).toBe("gemini-3.5-flash-lite");
    expect(route.reason).toBe("pdf_or_heavy_fallback_scrubbed");
    expect(route.mustScrubForCloud).toBe(true);
  });

  it("never selects a unsupported Gemini 2.5 model", () => {
    const route = selectExecutionRoute(
      {
        ...DEFAULT_REMOTE_CONFIG,
        cloud_model_name: "unsupported-primary",
        cloud_fallback_model: "unsupported-fallback",
      },
      {
        textLength: 40_000,
      },
    );

    expect(route.targetCloudModel).toBe("gemini-3.8-flash");
  });
});
