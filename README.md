# VeilBrief

VeilBrief audits contracts, invoices, and selected page text for risks and suggests revisions. It replaces detected personal information with tokens before sending document text to a model. Suggested edits can restore those values in memory. Firestore history stores scrubbed findings and audit metadata.

- Live web workbench: https://veilbrief.prince.sh
- Walkthrough demo video: https://www.youtube.com/watch?v=UpsVoGQAXi0

## Architecture

| Surface | Role |
| --- | --- |
| `@veilbrief/core` | TypeScript PII shield, routing policy, Firebase initialization, structured audit responses, and the shared Firestore writer. |
| Next.js 16 web app | Document workbench with a redaction preview, audit results, and history. PNG and JPEG evidence requires strict local inference. |
| Chrome MV3 extension | Audits selected page text from a context menu and shows the audit in a side panel. |
| SwiftUI iOS and macOS app | Swift Package with a native PII shield, Apple Foundation Models, Firebase cloud inference, and audit history. |

Chrome uses Gemini Nano 4 through the Prompt API. Apple devices use Foundation Models on iOS 26 or macOS 26 with Apple Intelligence enabled. Automatic routing prefers the device for short text and the cloud for longer text. Strict local mode keeps inference on the device. The PII shield uses pattern matching, so review the redaction preview before cloud inference.

## Firebase setup

1. In the Firebase console, create a project and register a Web app and an Apple app. The example Apple bundle ID is `com.princejain.veilbrief`. Use the matching ID in your Xcode app target.
2. Open **AI Logic** and set up the **Gemini Developer API** backend. The Firebase client SDK uses the registered app configuration. Keep Gemini API credentials server side. [Firebase AI Logic setup](https://firebase.google.com/docs/ai-logic/get-started)
3. In **Authentication**, enable **Anonymous** sign-in. Each installation uses its own anonymous UID. Audit history follows that UID.
4. Create a **Cloud Firestore** database. For a dedicated demo project, publish the following rules to give authenticated users read and create access to their own audits.

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

5. Publish these **Remote Config** parameters, or run with the same built-in defaults.

   | Key | Default |
   | --- | --- |
   | `cloud_model_name` | `gemini-3.8-flash` |
   | `cloud_fallback_model` | `gemini-3.5-flash-lite` |
   | `default_inference_mode` | `prefer_on_device` |
   | `max_on_device_chars` | `12000` |
   | `enforce_local_pii_shield` | `true` |

   The fallback model is selected for inputs classified as PDF or heavy. The apps scrub document text before inference in every mode.

6. Register your apps in **App Check**. Use reCAPTCHA v3 for the hosted web app and register its domain. For the localhost web app and unpacked extension, create a debug token under **Manage debug tokens** for the Firebase Web app. Register the Apple debug token from the Xcode console for debug builds. Use a distribution-appropriate App Check provider for released Apple builds. [App Check for Firebase AI Logic](https://firebase.google.com/docs/ai-logic/app-check)

An audit at `users/{uid}/audits/{auditId}` has fields `platform`, `inferenceSource`, `modelUsed`, `riskLevel`, `summary`, `redFlags`, `piiEntitiesCount`, `latencyMs`, and `createdAt`. Source is `on_device` or `in_cloud`. Each red flag has `title`, `severity`, and `explanation`. Firestore supplies the timestamp.

## Run the clients

Use Node.js 22 or newer and npm for the JavaScript workspaces. From the repository root:

```sh
npm install
npm run build --workspace=@veilbrief/core
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/extension/.env.example apps/extension/.env.local
cp -n apps/ios/VeilBrief/GoogleService-Info.plist.example apps/ios/VeilBrief/GoogleService-Info.plist
```

**Web.** Fill `apps/web/.env.local` with the registered Firebase Web app values. For localhost set `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` to the registered debug token and leave the reCAPTCHA value blank. For a hosted web deployment set `NEXT_PUBLIC_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY` and leave the debug value blank.

```sh
npm run dev --workspace=@veilbrief/web
```

Open [localhost:3000](http://localhost:3000).

**Chrome extension.** Fill `apps/extension/.env.local` with the Firebase Web app values and `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`. Leave the reCAPTCHA value blank for the unpacked extension. Build the local judge copy with:

```sh
npm run build --workspace=@veilbrief/extension -- --mode development
```

Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked** with `apps/extension/dist`. Select text on a regular web page, right-click it, and choose **Audit Privately with VeilBrief**. Keep the unpacked debug build private because Vite includes the configured debug token in its output.

**Apple.** Replace the example values in the ignored plist with the values from the registered Apple app, or download its Firebase plist to that same path. With Xcode installed, launch the SwiftPM executable on macOS from the directory below. In an iOS Xcode app target, include the SwiftUI app sources, link the `VeilBriefCore` package product, and add the configured plist to the target's bundle resources.

```sh
cd apps/ios
swift run VeilBriefApp
```

Keep both `.env.local` files and the filled plist local. The templates contain placeholders.

## Chrome Gemini Nano 4 for judges

1. Update desktop Chrome at `chrome://settings/help`. Firebase supports on-device inference starting at Chrome 139.
2. At `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, select **Enabled** and relaunch Chrome.
3. Select **Initialize On-Device Model** in the web app or **Initialize Gemini Nano 4** in the extension and wait for the model download. In the corresponding DevTools console, `await LanguageModel.availability()` should return `available` after preparation.
4. In the web app, choose **Strict local** and run the sample MSA. Check that the result shows `ON_DEVICE`. Run a text sample in **Scrubbed cloud** and check `IN_CLOUD` and the Firestore record. [Firebase Chrome hybrid setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)

## Verify locally

```sh
npm test
npm run build
swift test --package-path apps/ios
git check-ignore apps/web/.env.local apps/extension/.env.local apps/ios/VeilBrief/GoogleService-Info.plist
```

Use the web and extension builds to check TypeScript and bundling. A live smoke test requires valid App Check, Firebase configuration, and compatible hardware for local inference.
