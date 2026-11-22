"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InputPanel } from "@/components/input-panel";
import { KpiStrip } from "@/components/kpi-strip";
import { OutputPanel, type OutputTab } from "@/components/output-panel";
import { SetupNotice } from "@/components/setup-notice";
import { StatusHeader } from "@/components/status-header";
import {
  configFromRemoteParams,
  executeAudit,
  prepareDevice,
  probeDevice,
} from "@/lib/core-bridge";
import { filenameFromPath } from "@/lib/format";
import { getSampleScenarios } from "@/lib/samples";
import type {
  AuditView,
  DeviceState,
  InferenceMode,
  Scenario,
} from "@/lib/types";
import { useVeilBriefFirebase } from "@/hooks/use-veilbrief-firebase";

const INITIAL_DEVICE: DeviceState = {
  status: "checking",
  progress: 0,
  message: "Checking Chrome built-in AI availability.",
};

function fileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected image could not be read."));
    };
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export default function WorkbenchPage() {
  const scenarios = useMemo(() => getSampleScenarios(), []);
  const initialScenario = scenarios[0];
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    initialScenario?.id ?? ""
  );
  const [text, setText] = useState(initialScenario?.text ?? "");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState(0);
  const [imageLoading, setImageLoading] = useState(false);
  const [mode, setMode] = useState<InferenceMode>("auto");
  const [forcedOffline, setForcedOffline] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [device, setDevice] = useState<DeviceState>(INITIAL_DEVICE);
  const [preparingModel, setPreparingModel] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Ready to audit");
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [history, setHistory] = useState<AuditView[]>([]);
  const [activeTab, setActiveTab] = useState<OutputTab>("audit");
  const [refreshingRemote, setRefreshingRemote] = useState(false);
  const imageRequest = useRef(0);
  const { state: firebase, getRuntime, refreshRemote } =
    useVeilBriefFirebase();
  const runtimeConfig = useMemo(
    () => configFromRemoteParams(firebase.remoteParams),
    [firebase.remoteParams]
  );

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let active = true;
    void probeDevice().then((result) => {
      if (active) setDevice(result);
    });

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const initializeModel = useCallback(async () => {
    setPreparingModel(true);
    setDevice((current) => ({
      ...current,
      status: "preparing",
      progress: 0,
      message: "Starting the user-activated model download.",
    }));

    const result = await prepareDevice((nextProgress) => {
      setDevice((current) => ({
        ...current,
        status: "preparing",
        progress: nextProgress,
        message:
          nextProgress < 1
            ? "Downloading and preparing Gemini Nano 4."
            : "Verifying the on-device model.",
      }));
    });

    setDevice(result);
    setPreparingModel(false);
    if (result.status !== "ready") setError(result.message);
  }, []);

  const loadImage = useCallback(
    async (file: Blob, name: string) => {
      if (!file.type.includes("png") && !file.type.includes("jpeg")) {
        setError("Upload a PNG or JPEG image.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError("Keep image evidence below 8 MB.");
        return;
      }

      try {
        const dataUrl = await fileAsDataUrl(file);
        setImageDataUrl(dataUrl);
        setImageName(name);
        setImageSize(file.size);
        setError("");
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The image could not be prepared."
        );
      }
    },
    []
  );

  const selectScenario = useCallback(
    async (scenario: Scenario) => {
      const requestId = imageRequest.current + 1;
      imageRequest.current = requestId;
      setSelectedScenarioId(scenario.id);
      setText(scenario.text);
      setError("");
      setImageDataUrl(null);
      setImageName("");
      setImageSize(0);

      if (!scenario.imageUrl) return;

      setImageLoading(true);
      try {
        const response = await fetch(scenario.imageUrl);
        if (!response.ok) {
          throw new Error(
            "The sample invoice image is missing from the public assets."
          );
        }
        const blob = await response.blob();
        if (imageRequest.current !== requestId) return;
        await loadImage(blob, filenameFromPath(scenario.imageUrl));
      } catch (nextError) {
        if (imageRequest.current !== requestId) return;
        setError(
          nextError instanceof Error
            ? nextError.message
            : "The sample image could not load."
        );
      } finally {
        if (imageRequest.current === requestId) setImageLoading(false);
      }
    },
    [loadImage]
  );

  const selectFile = useCallback(
    (file: File) => {
      imageRequest.current += 1;
      setSelectedScenarioId("");
      void loadImage(file, file.name);
    },
    [loadImage]
  );

  const clearImage = useCallback(() => {
    imageRequest.current += 1;
    setImageDataUrl(null);
    setImageName("");
    setImageSize(0);
    setImageLoading(false);
  }, []);

  const runAudit = useCallback(async () => {
    if (imageLoading) {
      setError("Wait for the sample image to finish loading.");
      return;
    }

    const runtime = getRuntime();
    if (!runtime.ai) {
      setError(
        "Firebase AI Logic is not ready. Add the public Firebase variables and finish App Check setup before running an audit."
      );
      return;
    }

    if (imageDataUrl && mode === "cloud") {
      setError(
        "Image evidence must stay on-device. Choose Auto Hybrid or Strict Local for this packet."
      );
      return;
    }

    setRunning(true);
    setError("");
    setProgress(0.04);
    setProgressLabel("Preparing the audit");

    try {
      const result = await executeAudit({
        text,
        imageDataUrl: imageDataUrl ?? undefined,
        mode,
        forceOffline: forcedOffline || !browserOnline,
        config: runtimeConfig,
        ai: runtime.ai,
        auth: runtime.auth,
        firestore: runtime.db,
        onProgress: (label, value) => {
          setProgressLabel(label);
          setProgress(value);
        },
      });

      setAudit(result);
      setHistory((current) => [result, ...current].slice(0, 20));
      setActiveTab("audit");
      setProgress(1);
      setProgressLabel("Audit complete");

      if (result.persistenceFailed) {
        setError(
          "The audit finished, but its scrubbed Firestore record could not sync."
        );
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The audit could not complete."
      );
      setProgressLabel("Audit stopped");
    } finally {
      setRunning(false);
    }
  }, [
    browserOnline,
    forcedOffline,
    getRuntime,
    imageDataUrl,
    imageLoading,
    mode,
    runtimeConfig,
    text,
  ]);

  const refreshRemoteConfig = useCallback(() => {
    setRefreshingRemote(true);
    void refreshRemote().finally(() => setRefreshingRemote(false));
  }, [refreshRemote]);

  const metrics = useMemo(() => {
    const local = history.filter((item) => item.inferenceSource === "ON_DEVICE");
    const cloud = history.filter((item) => item.inferenceSource === "IN_CLOUD");
    return {
      onDeviceShare: history.length ? (local.length / history.length) * 100 : 0,
      piiEntities: history.reduce(
        (sum, item) => sum + item.payload.tokens.length,
        0
      ),
      localLatency: average(local.map((item) => item.latencyMs)),
      cloudLatency: average(cloud.map((item) => item.latencyMs)),
      cloudSpendSaved: local.reduce(
        (sum, item) =>
          sum +
          Math.max(
            0.004,
            (item.payload.originalText.length / 1000) * 0.0027
          ),
        0
      ),
      totalRuns: history.length,
    };
  }, [history]);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <StatusHeader
        device={device}
        appCheck={firebase.appCheck}
        auth={firebase.auth}
        browserOnline={browserOnline}
        forcedOffline={forcedOffline}
        preparingModel={preparingModel}
        onPrepareModel={() => void initializeModel()}
        onToggleOffline={() => setForcedOffline((current) => !current)}
      />

      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 sm:py-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="type-page">Document audit desk</h1>
            <p className="type-body mt-1 max-w-[48rem] text-[var(--text-muted)]">
              Keep the source on this device, escalate only shielded text, and
              verify the exact payload before any cloud call.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="pill pill-neutral type-pill">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  firebase.remoteSource === "live"
                    ? "bg-[var(--status-emerald)]"
                    : "bg-[var(--status-amber)]"
                }`}
                aria-hidden="true"
              />
              {firebase.remoteSource === "live"
                ? "Remote policy live"
                : "Policy defaults"}
            </span>
            {history.length > 0 && (
              <span className="numeral type-meta text-[var(--text-faint)]">
                {history.length} session runs
              </span>
            )}
          </div>
        </div>

        <KpiStrip
          onDeviceShare={metrics.onDeviceShare}
          piiEntities={metrics.piiEntities}
          localLatency={metrics.localLatency}
          cloudLatency={metrics.cloudLatency}
          cloudSpendSaved={metrics.cloudSpendSaved}
          totalRuns={metrics.totalRuns}
        />

        <div className="mt-4">
          <SetupNotice
            device={device}
            appCheck={firebase.appCheck}
            onPrepareModel={() => void initializeModel()}
          />
        </div>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <InputPanel
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            text={text}
            imageDataUrl={imageDataUrl}
            imageName={imageName}
            imageSize={imageSize}
            imageLoading={imageLoading}
            mode={mode}
            forcedOffline={forcedOffline || !browserOnline}
            maxOnDeviceChars={runtimeConfig.max_on_device_chars}
            running={running}
            progressLabel={progressLabel}
            progress={progress}
            error={error}
            onTextChange={(value) => {
              setSelectedScenarioId("");
              setText(value);
            }}
            onScenarioSelect={(scenario) => void selectScenario(scenario)}
            onFileSelected={selectFile}
            onClearImage={clearImage}
            onModeChange={setMode}
            onRun={() => void runAudit()}
          />

          <OutputPanel
            audit={audit}
            activeTab={activeTab}
            running={running}
            progressLabel={progressLabel}
            progress={progress}
            remoteParams={firebase.remoteParams}
            remoteSource={firebase.remoteSource}
            refreshingRemote={refreshingRemote}
            feed={firebase.feed}
            uid={firebase.auth.uid}
            authReady={firebase.auth.status === "ready"}
            onTabChange={setActiveTab}
            onRefreshRemote={refreshRemoteConfig}
          />
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-line)] pt-3 text-[11px] text-[var(--text-faint)]">
          <span>
            Cloud prompts contain protected tokens only. Raw text and token maps
            stay local.
          </span>
          <span className="numeral">
            Session egress assertion:{" "}
            {history.every((item) => item.payload.rawPiiBytesSent === 0)
              ? "0 raw PII bytes"
              : "review required"}
          </span>
        </footer>
      </main>
    </div>
  );
}
