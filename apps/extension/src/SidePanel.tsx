import {
  ON_DEVICE_MODEL_LABEL,
  probeOnDeviceAvailability,
  runHybridAudit,
} from "@veilbrief/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Cpu,
  FileText,
  Fingerprint,
  Highlighter,
  Loader2,
  Lock,
  Moon,
  Replace,
  RotateCcw,
  ScanText,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  auditPreview,
  chooseRoute,
  prepareLocalModel,
  shieldText,
  type AuditPreview,
  type ExecutionRoute,
  type ShieldPreview,
} from "./core";
import { ensureCloudSession, firebaseConfigured } from "./firebase";
import {
  applyRedlineOnActiveTab,
  captureActiveTabSelection,
  highlightClauseOnActiveTab,
} from "./pageActions";

type Theme = "light" | "dark";
type ModelState = "idle" | "preparing" | "ready" | "unsupported" | "error";
type CloudState = "connecting" | "ready" | "local" | "error";
type SaveState = "idle" | "saving" | "saved" | "local" | "error";

const SAMPLE_MSA = `MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into by Cobalt Harbor Consulting LLC and its contractor. Contractor: Arjun Mehta, Email: arjun.mehta@example.com, Phone: (415) 555-0142, Fee: $24,000.

2. FEES AND PAYMENT
Client shall pay approved invoices within ninety days after receipt. Contractor assigns all prior and future inventions without limitation and indemnifies Client without any liability cap.`;

const REDACTION_TOKEN =
  /(\[[A-Z][A-Z0-9_ -]*\d+\]|<<[^>]+>>|<[^>\s]+(?: [^>]+)?>)/g;

function renderShieldedText(text: string) {
  const segments = text.split(REDACTION_TOKEN);
  return segments.map((segment, index) => {
    const tokenPattern =
      /^(\[[A-Z][A-Z0-9_ -]*\d+\]|<<[^>]+>>|<[^>\s]+(?: [^>]+)?>)$/;
    if (!tokenPattern.test(segment)) {
      return <span key={`${index}-${segment.slice(0, 8)}`}>{segment}</span>;
    }

    return (
      <mark className="redaction-token" key={`${index}-${segment}`}>
        {segment}
      </mark>
    );
  });
}

function shortUid(uid: string): string {
  return uid.slice(0, 6).toUpperCase();
}

function RouteBadge({ route }: { route: ExecutionRoute }) {
  const onDevice = route === "ON_DEVICE";
  return (
    <span className={`route-badge ${onDevice ? "on-device" : "in-cloud"}`}>
      {onDevice ? <Cpu aria-hidden="true" /> : <Cloud aria-hidden="true" />}
      {route}
    </span>
  );
}

export default function SidePanel() {
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  const [selectionText, setSelectionText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("No selection");
  const [shield, setShield] = useState<ShieldPreview | null>(null);
  const [showShield, setShowShield] = useState(true);
  const [routePreview, setRoutePreview] = useState<ExecutionRoute>("ON_DEVICE");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [modelState, setModelState] = useState<ModelState>("idle");
  const [modelMessage, setModelMessage] = useState("Cloud fallback active");
  const [modelProgress, setModelProgress] = useState(0);
  const [audit, setAudit] = useState<AuditPreview | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [pageStatus, setPageStatus] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [cloudState, setCloudState] = useState<CloudState>(
    firebaseConfigured() ? "connecting" : "local",
  );
  const [cloudUid, setCloudUid] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let alive = true;
    void probeOnDeviceAvailability().then((status) => {
      if (!alive) return;
      if (status === "available") {
        setModelState("ready");
        setModelMessage("Ready for on-device inference");
      } else if (status === "downloadable" || status === "downloading") {
        setModelState("idle");
        setModelMessage("Click Prepare Nano to enable local weights");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const runShield = useCallback(
    async (text: string): Promise<ShieldPreview | null> => {
      if (!text.trim()) {
        setScanError("No selection loaded.");
        return null;
      }

      setIsScanning(true);
      setScanError("");
      setAudit(null);
      setAuditError("");
      setPageStatus("");
      setSaveState("idle");

      try {
        const preview = shieldText(text);
        const route = chooseRoute(text);
        setShield(preview);
        setRoutePreview(route);
        setShowShield(true);
        return preview;
      } catch (error) {
        setScanError(
          error instanceof Error ? error.message : "Local shield failed.",
        );
        return null;
      } finally {
        setIsScanning(false);
      }
    },
    [],
  );

  useEffect(() => {
    let alive = true;

    const consumePending = (payload: unknown) => {
      if (!alive || !payload || typeof payload !== "object") return;
      const record = payload as { text?: unknown };
      if (typeof record.text !== "string" || !record.text.trim()) return;

      const normalized = record.text.trim();
      setSelectionText(normalized);
      setSourceLabel("Selected from tab");
      void runShield(normalized);
      // Clear staged selection immediately from session RAM after loading.
      void chrome.storage.session?.remove("pendingSelection");
    };

    chrome.storage.session?.get(["pendingSelection"], (result) => {
      consumePending(result.pendingSelection);
    });

    const onStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "session" && changes.pendingSelection?.newValue) {
        consumePending(changes.pendingSelection.newValue);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);

    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onStorageChange);
    };
  }, [runShield]);

  useEffect(() => {
    if (!firebaseConfigured()) {
      setCloudState("local");
      return;
    }

    let alive = true;
    void ensureCloudSession()
      .then((session) => {
        if (!alive) return;
        setCloudUid(shortUid(session.uid));
        setCloudState("ready");
      })
      .catch(() => {
        if (alive) setCloudState("error");
      });

    return () => {
      alive = false;
    };
  }, []);

  const handleScanSelection = useCallback(async () => {
    const captured = await captureActiveTabSelection();
    const target = captured || selectionText;
    if (!target.trim()) {
      setScanError("Highlight text on the page or load Sample MSA first.");
      return;
    }
    setSelectionText(target);
    setSourceLabel(captured ? "Active tab selection" : sourceLabel);
    void runShield(target);
  }, [runShield, selectionText, sourceLabel]);

  const handleSample = useCallback(() => {
    setSelectionText(SAMPLE_MSA);
    setSourceLabel("Sample MSA");
    void runShield(SAMPLE_MSA);
  }, [runShield]);

  const handleInitializeModel = useCallback(async () => {
    if (!firebaseConfigured()) {
      setModelState("error");
      setModelMessage("Add Firebase environment values first");
      return;
    }

    setModelState("preparing");
    setModelProgress(0);
    setModelMessage("Preparing local runtime");

    try {
      setCloudState("connecting");
      const session = await ensureCloudSession();
      setCloudUid(shortUid(session.uid));
      setCloudState("ready");

      const result = await prepareLocalModel(
        session.ai,
        session.config,
        (progress) => {
          setModelProgress(progress);
          setModelMessage(`Preparing ${Math.round(progress * 100)}%`);
        },
      );
      setModelState(result.state);
      setModelMessage(result.message);
    } catch (error) {
      setModelState("error");
      setModelMessage(
        error instanceof Error ? error.message : "Local runtime unavailable",
      );
      setCloudState("error");
    }
  }, []);

  const handleAudit = useCallback(async () => {
    if (!selectionText.trim()) {
      setAuditError("No selection loaded.");
      return;
    }

    setIsAuditing(true);
    setAuditError("");
    setPageStatus("");
    setSaveState("idle");

    try {
      const localShield =
        shield?.sourceText === selectionText
          ? shield
          : await runShield(selectionText);

      if (!localShield) {
        throw new Error("Local shield did not return a result.");
      }

      setCloudState("connecting");
      const session = await ensureCloudSession();
      setCloudUid(shortUid(session.uid));
      setCloudState("ready");
      setRoutePreview(chooseRoute(selectionText, session.config));

      const result = await runHybridAudit({
        platform: "chrome-extension",
        text: selectionText,
        ai: session.ai,
        auth: session.auth,
        firestore: session.firestore,
        config: session.config,
        isOffline: !navigator.onLine,
      });
      const preview = auditPreview(result);
      setAudit(preview);
      setSaveState(
        result.persistenceFailed
          ? "error"
          : result.persistedAuditId
            ? "saved"
            : "local",
      );
    } catch (error) {
      setAuditError(
        error instanceof Error ? error.message : "Hybrid audit failed.",
      );
      setCloudState(firebaseConfigured() ? "error" : "local");
    } finally {
      setIsAuditing(false);
    }
  }, [runShield, selectionText, shield]);

  const selectionLength = selectionText.trim().length;
  const entityTypes = useMemo(() => {
    if (!shield) return [];
    return [...new Set(shield.entities.map((entity) => entity.kind))].slice(0, 6);
  }, [shield]);

  const cloudLabel = useMemo(() => {
    if (cloudState === "ready") {
      return cloudUid ? `Anonymous ${cloudUid}` : "Anonymous";
    }
    if (cloudState === "connecting") return "Private session";
    if (cloudState === "error") return "Cloud unavailable";
    return "Local mode";
  }, [cloudState, cloudUid]);

  const modelTone =
    modelState === "ready"
      ? "success"
      : modelState === "error" || modelState === "unsupported"
        ? "warning"
        : "muted";

  return (
    <div className="shield-app">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">
            <ShieldCheck aria-hidden="true" />
          </span>
          <span className="brand-copy">
            <span className="brand-name">VeilBrief</span>
            <span className="brand-product">Hybrid AI Shield</span>
          </span>
        </div>
        <div className="header-actions">
          <span className={`session-state ${cloudState}`} title={cloudLabel}>
            <span className="status-dot" />
            <span>{cloudLabel}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={
              theme === "light" ? "Use dark appearance" : "Use light appearance"
            }
            onClick={() =>
              setTheme((current) => (current === "light" ? "dark" : "light"))
            }
          >
            {theme === "light" ? (
              <Moon aria-hidden="true" />
            ) : (
              <Sun aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <main>
        <section className="input-section" aria-labelledby="input-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">01</span>
              <h2 id="input-heading">Page selection</h2>
            </div>
            <span className="numeral meta-value">
              {selectionLength.toLocaleString()} chars
            </span>
          </div>

          <div className="source-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => void handleScanSelection()}
              disabled={isScanning}
            >
              {isScanning ? (
                <Loader2 className="spin" aria-hidden="true" />
              ) : (
                <ScanText aria-hidden="true" />
              )}
              Scan Page Selection
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={handleSample}
              disabled={isScanning}
            >
              <FileText aria-hidden="true" />
              Sample MSA
            </button>
          </div>

          <div className="source-meta">
            <span>{sourceLabel}</span>
            {selectionText ? (
              <span className="numeral">{selectionLength.toLocaleString()}</span>
            ) : null}
          </div>
          <div className="source-preview">
            {selectionText ? (
              <p>{selectionText.slice(0, 420)}</p>
            ) : (
              <div className="empty-line" />
            )}
          </div>
        </section>

        <section className="shield-section" aria-labelledby="shield-heading">
          <div className="section-heading">
            <div>
              <span className="section-kicker">02</span>
              <h2 id="shield-heading">Local PII shield</h2>
            </div>
            <span className="count-pill numeral">
              {shield?.count ?? 0} protected
            </span>
          </div>

          <div className="shield-toolbar">
            <div className="segmented" aria-label="Preview mode">
              <button
                type="button"
                className={showShield ? "active" : ""}
                aria-pressed={showShield}
                onClick={() => setShowShield(true)}
              >
                <Lock aria-hidden="true" />
                Shielded
              </button>
              <button
                type="button"
                className={!showShield ? "active" : ""}
                aria-pressed={!showShield}
                onClick={() => setShowShield(false)}
              >
                <RotateCcw aria-hidden="true" />
                Original
              </button>
            </div>
            <span className="local-label">
              <Fingerprint aria-hidden="true" />
              session RAM only
            </span>
          </div>

          <div className="diff-panel" aria-live="polite">
            {shield ? (
              <p>
                {showShield
                  ? renderShieldedText(shield.redactedText)
                  : shield.sourceText}
              </p>
            ) : (
              <span className="muted-copy">No shielded preview</span>
            )}
          </div>

          {entityTypes.length > 0 ? (
            <div className="entity-row">
              {entityTypes.map((type) => (
                <span className="entity-chip" key={type}>
                  {type}
                </span>
              ))}
            </div>
          ) : null}

          {scanError ? (
            <p className="inline-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              {scanError}
            </p>
          ) : null}
        </section>

        <section className="model-band" aria-labelledby="model-heading">
          <div className="model-copy">
            <span className={`model-icon ${modelTone}`}>
              <Cpu aria-hidden="true" />
            </span>
            <div>
              <h2 id="model-heading">{ON_DEVICE_MODEL_LABEL}</h2>
              <p className={`model-status ${modelTone}`}>{modelMessage}</p>
            </div>
          </div>
          <button
            type="button"
            className="button compact"
            title={
              modelState === "preparing"
                ? `${Math.round(modelProgress * 100)}% prepared`
                : modelMessage
            }
            onClick={() => void handleInitializeModel()}
            disabled={modelState === "preparing"}
          >
            {modelState === "preparing" ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : modelState === "ready" ? (
              <Check aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            Prepare Nano
          </button>
        </section>

        <section className="audit-section" aria-labelledby="audit-heading">
          <div className="section-heading audit-heading">
            <div>
              <span className="section-kicker">03</span>
              <h2 id="audit-heading">Hybrid audit & inline redline</h2>
            </div>
            <RouteBadge route={audit?.route ?? routePreview} />
          </div>

          <button
            type="button"
            className="button audit-button"
            onClick={() => void handleAudit()}
            disabled={isAuditing || !selectionText.trim()}
          >
            {isAuditing ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            {isAuditing ? "Auditing" : "Run Hybrid Audit"}
            <ChevronRight aria-hidden="true" />
          </button>

          {audit ? (
            <div className="audit-results" aria-live="polite">
              <div className="provenance-row">
                <span className="provenance-label">{audit.modelUsed}</span>
                <RouteBadge route={audit.route} />
                <span className={`save-state ${saveState}`}>
                  {saveState === "saving"
                    ? "Saving"
                    : saveState === "saved"
                      ? "Firestore synced"
                      : saveState === "local"
                        ? "Local result"
                        : saveState === "error"
                          ? "Save unavailable"
                          : ""}
                </span>
              </div>

              <div className="wire-proof-bar numeral">
                <span>{audit.rawPiiBytesLeaked} B raw PII leaked</span>
                {audit.wirePayloadSha256 ? (
                  <span>sha256:{audit.wirePayloadSha256.slice(0, 10)}</span>
                ) : (
                  <span>0 B wire</span>
                )}
              </div>

              {audit.summary ? (
                <p className="audit-summary">{audit.summary}</p>
              ) : null}

              <div className="result-group">
                <div className="result-heading">
                  <span>Red flags</span>
                  <span className="numeral">{audit.redFlags.length}</span>
                </div>
                {audit.redFlags.length > 0 ? (
                  <ol className="finding-list">
                    {audit.redFlags.map((flag, index) => (
                      <li key={`${index}-${flag}`}>
                        <span className="finding-index numeral">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted-copy">No red flags returned</p>
                )}
              </div>

              <div className="result-group">
                <div className="result-heading">
                  <span>Counter-clauses</span>
                  <span className="rehydrate-label">
                    <Lock aria-hidden="true" />
                    {audit.rehydratedEntityCount > 0
                      ? `${audit.rehydratedEntityCount} ${
                          audit.rehydratedEntityCount === 1 ? "token" : "tokens"
                        } restored`
                      : "locally rehydrated"}
                  </span>
                </div>

                {pageStatus ? (
                  <p className="page-action-status">{pageStatus}</p>
                ) : null}

                {audit.counterClauses.length > 0 ? (
                  <ol className="finding-list clauses">
                    {audit.counterClauses.map((clause, index) => (
                      <li key={`${index}-${clause.title}`} className="clause-card">
                        <div className="clause-title">
                          {String(index + 1).padStart(2, "0")}. {clause.title}
                        </div>
                        {clause.currentText ? (
                          <div className="clause-old">- {clause.currentText}</div>
                        ) : null}
                        <div className="clause-new">+ {clause.suggestedText}</div>
                        <div className="clause-actions">
                          {clause.currentText ? (
                            <>
                              <button
                                type="button"
                                className="button compact"
                                onClick={() =>
                                  void highlightClauseOnActiveTab(
                                    clause.currentText,
                                  ).then((res) => setPageStatus(res.message))
                                }
                              >
                                <Highlighter aria-hidden="true" />
                                Highlight
                              </button>
                              <button
                                type="button"
                                className="button compact"
                                onClick={() =>
                                  void applyRedlineOnActiveTab(
                                    clause.currentText,
                                    clause.suggestedText,
                                  ).then((res) => setPageStatus(res.message))
                                }
                              >
                                <Replace aria-hidden="true" />
                                Apply on Page
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            className="button compact"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                clause.suggestedText,
                              );
                              setCopiedIdx(index);
                              window.setTimeout(() => setCopiedIdx(null), 1500);
                            }}
                          >
                            {copiedIdx === index ? (
                              <Check aria-hidden="true" />
                            ) : (
                              <Copy aria-hidden="true" />
                            )}
                            {copiedIdx === index ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted-copy">No counter-clauses returned</p>
                )}
              </div>
            </div>
          ) : null}

          {auditError ? (
            <p className="inline-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              {auditError}
            </p>
          ) : null}
        </section>
      </main>

      <footer>
        <span>
          <ShieldCheck aria-hidden="true" />
          Zero persistent PII
        </span>
        <span className="numeral">MV3 / INLINE REDLINE</span>
      </footer>
    </div>
  );
}
