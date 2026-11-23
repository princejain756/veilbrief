# VeilBrief

VeilBrief is a hybrid on-device contract redliner built with Firebase AI Logic, Chrome Built-in AI (Gemini Nano), and Apple Foundation Models. Before a single sentence reaches a cloud model, VeilBrief extracts PDFs and Word documents in the browser, scrubs personal and financial identifiers locally, runs an optional on-device contextual scrub with Gemini Nano, streams structured redlines, and hashes the outgoing HTTP payload to prove zero raw PII left the tab.

- Live web workbench: https://veilbrief.prince.sh
- Chrome extension signature test portal: https://veilbrief.prince.sh/demo-portal
- Demo video: https://www.youtube.com/watch?v=DicvlodZiJg

## How the privacy pipeline works

Every contract passes through a deterministic local pipeline before any inference runs:

1. **Zero-upload document extraction (Web).** Local `.pdf`, `.docx`, `.txt`, and `.md` files are parsed inside browser memory with `pdfjs-dist` (`public/pdf.worker.min.mjs`) and `mammoth`. The original binary never touches a server.
2. **Stage 1A deterministic PII and financial shield (`@veilbrief/core`).** `packages/core/src/piiShield.ts` masks emails, bounded US and Indian phone numbers, SSNs, EINs, uppercase Indian PAN identifiers, IBAN numbers validated via ISO-13616 Mod-97, card numbers validated via Luhn, international street addresses, labeled monetary amounts (optional toggle, enabled by default), and repeated entity mentions. Strict Title-Case checks plus a legal-verb stoplist prevent false positives on clauses such as `"Client shall pay approved invoices within ninety days"`.
3. **Stage 1B on-device Nano contextual scrub (`Chrome Built-in AI`).** When built-in Prompt API support is available, Firebase AI Logic calls `onDeviceParams` (`createOptions.initialPrompts` and `promptOptions.responseConstraint`) to flag stealth codenames, office neighborhoods, or unreleased products (such as `[CONTEXT_1]` for `"unannounced Project Nightfall lidar pipeline"` and `[CONTEXT_2]` for `"Koramangala studio"`) before cloud fallback runs.
4. **Hybrid routing and streaming (`packages/core/src/firebaseHybrid.ts`).** Under Firebase Remote Config defaults, short contracts stay local (`only_on_device` when Offline Lock is active, or `prefer_on_device` up to `max_on_device_chars`), while long or heavy agreements escalate to Firebase AI Logic (`gemini-3.5-flash-lite`, fallback `gemini-3.8-flash`) protected by Firebase App Check. Responses stream via `generateContentStream` and parse fail-closed through `zod` (`AuditResponseZodSchema`, throwing `MalformedAuditResponseError` on invalid JSON). Inference attribution reports `ON_DEVICE`, `IN_CLOUD`, or `UNKNOWN` honestly from SDK telemetry.
5. **Cryptographic wire audit (`auditWirePayload`).** A scoped `globalThis.fetch` interceptor captures outgoing request bodies to Google AI hosts, computes a `SHA-256` digest with `globalThis.crypto.subtle`, and runs an independent canary scan over the exact bytes that left the browser. Anonymized counters and scrubbed summaries sync per anonymous UID to Cloud Firestore (`users/{uid}/audits/{auditId}`).
6. **Local rehydration, redline review, and clean export.** Bracket tokens rehydrate back to original entity names and dollar amounts only inside client RAM for review. Users can accept, reject, or edit each counter-clause, preview the diff, and export a patched `.docx`, `.md`, or PII-free `.json` Privacy Receipt (`apps/web/src/lib/redline-export.ts`).

## Workspace surfaces

| Surface | Package / Path | Role |
| --- | --- | --- |
| Shared Core | `packages/core` (`@veilbrief/core`) | TypeScript PII shield, ISO-13616/Luhn validators, entity propagation, Remote Config policy, `zod` fail-closed schemas, SHA-256 wire auditor, synthetic benchmark runner. |
| Next.js 16 Workbench | `apps/web` | Browser PDF/DOCX parser, 3-stage pipeline inspector, raw HTTP wire body + SHA-256 verifier, Accept/Reject/Edit redline workbench, `.docx`/`.md`/Privacy Receipt export, and `/demo-portal`. |
| Chrome MV3 Extension | `apps/extension` | SidePanel (`SidePanel.tsx`) using ephemeral `chrome.storage.session` RAM state, `Scan Page Selection`, and `Highlight` / `Apply on Page` live DOM clause swapping (`pageActions.ts`). |
| Apple Swift 6 App | `apps/ios` | `VeilBriefCore` + `VeilBriefApp` SwiftUI client (`PIIShield.swift`, `HybridInferenceEngine.swift`, `FirebaseBootstrap.swift`, `ContentView.swift`) targeting iOS 26 / macOS 26 Foundation Models and Firebase cloud fallback. |

## Verification and synthetic benchmark results

Measured across the repository test suites and our 20-contract synthetic adversarial benchmark corpus (`scripts/run-benchmark.mjs` and `packages/core/src/benchmark.ts`):

| Check | Scope | Result |
| --- | --- | --- |
| Core Vitest suite | `npm run test --workspace=@veilbrief/core` | `5/5` files, `28/28` tests passed |
| PII Shield benchmark | `node scripts/run-benchmark.mjs` (20-contract synthetic corpus) | `84 TP`, `0 FP`, `0 FN` (`Precision 1.00`, `Recall 1.00`, `F1 1.00`) |
| Legal-verb stress traps | Clauses like `"Client shall pay..."`, `"Contractor will deliver..."` | `20/20` avoided (`0` false positives) |
| Round-trip rehydration | Exact byte recovery after token masking + restoration | `20/20` exact round-trip matches |
| Apple Swift 6 XCTests | `swift test --package-path apps/ios` in Xcode 26.3 | `5/5` tests in `PIIShieldTests` passed; `VeilBriefApp` builds cleanly |

*Note on synthetic and hardware-gated checks:* The 20-contract benchmark measures synthetic adversarial contracts created in this repo rather than third-party datasets. In desktop Chrome 157 (`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` + `#optimization-guide-on-device-model`), we verified live on-device Gemini Nano Stage 1B contextual masking (`[CONTEXT_1]`, `[CONTEXT_2]`) and `Offline Lock` execution with `0 B` network payload. Apple on-device Foundation Models inference requires Apple Intelligence enabled hardware running iOS 26 or macOS 26.

## Firebase setup

1. Create a Firebase project and register a Web app and an Apple app (`com.princejain.veilbrief` for Xcode).
2. Enable **Firebase AI Logic** with the **Gemini Developer API** backend so client calls route through Firebase without embedding raw API keys in client code. [Firebase AI Logic setup](https://firebase.google.com/docs/ai-logic/get-started)
3. Enable **Anonymous** authentication under **Authentication**.
4. Create **Cloud Firestore** with per-UID rules:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/audits/{auditId} {
      allow read, create: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

5. Configure **Remote Config** parameters matching `packages/core/src/routingPolicy.ts` defaults:

| Parameter | Built-in default |
| --- | --- |
| `cloud_model_name` | `gemini-3.5-flash-lite` |
| `cloud_fallback_model` | `gemini-3.8-flash` |
| `default_inference_mode` | `prefer_on_device` |
| `max_on_device_chars` | `12000` |
| `enforce_local_pii_shield` | `true` |

6. Enable **App Check**: reCAPTCHA Enterprise / v3 for hosted web (`veilbrief.prince.sh`), Firebase debug tokens for localhost web and unpacked extensions, and App Attest / DeviceCheck for release Apple builds (`FirebaseBootstrap.swift`).

Audit documents stored under `users/{uid}/audits/{auditId}` contain anonymized telemetry fields (`platform`, `inferenceSource`, `modelUsed`, `riskLevel`, `summary`, `redFlags`, `piiEntitiesCount`, `latencyMs`, `createdAt`) after PII stripping.

## Run locally and verify Chrome Built-in AI + Extension

Use Node.js 22+ and npm from the repository root:

```sh
npm install
npm run build --workspace=@veilbrief/core
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/extension/.env.example apps/extension/.env.local
cp -n apps/ios/VeilBrief/GoogleService-Info.plist.example apps/ios/VeilBrief/GoogleService-Info.plist
```

Start the web workbench:

```sh
npm run dev --workspace=@veilbrief/web
```

Build the unpacked Chrome extension (uses RAM-only `chrome.storage.session`):

```sh
npm run build --workspace=@veilbrief/extension -- --mode development
```

Load `apps/extension/dist` in `chrome://extensions` with **Developer mode** enabled, open `https://veilbrief.prince.sh/demo-portal`, highlight Clause 4, open the **VeilBrief Hybrid AI Shield** side panel, click **Scan Page Selection**, run **Run Hybrid Audit**, and click **Apply on Page** to see the clause swapped and highlighted emerald inline.

To test Chrome Built-in AI (Gemini Nano) locally on desktop Chrome 139+:
1. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and `chrome://flags/#optimization-guide-on-device-model` (`Enabled BypassPerfRequirement`).
2. Relaunch Chrome, click **Prepare Nano** in the web workbench or extension, and wait for `await LanguageModel.availability()` to report `available`.
3. Enable **Offline Lock** (`only_on_device`) or run Stage 1B contextual masking to observe `ON_DEVICE` attribution and `0 B` HTTP wire egress.

Run the local test and build suite:

```sh
npm run build
npm test
node scripts/run-benchmark.mjs
swift test --package-path apps/ios
git check-ignore .vercel apps/web/.env.local apps/extension/.env.local apps/ios/VeilBrief/GoogleService-Info.plist
```
