# Chess Vision

Chess Vision is a native React Native app for iPhone and Android. It turns a full-board photo into a correctable chess position, then evaluates the corrected legal FEN with up to three on-device Stockfish principal variations.

It is no longer a PWA or web app. Camera access, photo import, touch calibration, and the engine use native Android/iOS integrations.

## What the app does today

1. Opens the device camera or photo library.
2. Requires all four physical outside board corners to be marked and confirmed.
3. Shows an editable, accessible 8×8 board with a piece palette and resulting FEN.
4. Rejects malformed or illegal positions before analysis.
5. Runs Stockfish locally in the native development build and returns up to three principal variations at depth 14.

Automatic recognition is deliberately not enabled yet. The current generated classifier is synthetic-only and has not passed held-out real-board photo evaluation. After calibration, the native app opens an empty editable board and explains that manual correction is required; it does not pretend to recognise pieces.

## Native development

Install Node.js and then install dependencies:

```bash
npm install
```

This project uses a native Stockfish module, so it must run in an Expo development build — **not Expo Go**. Generate/run a development build with an installed Android SDK or Xcode:

```bash
npm run android
npm run ios
```

Once that development build is on a device or simulator, start Metro and connect it:

```bash
npm run start
```

The app identifiers are `com.bentigerashley.chessvision` for Android and iOS. Camera and photo-library permission text is configured in [`app.json`](app.json).

## Verification

```bash
npm test
npm run typecheck
npx expo config --type public
npm run export:android
npm run export:ios
```

JavaScript exports validate Metro resolution. They do not compile a native binary or prove the native Stockfish process starts. Before a preview or production build is accepted, run a development build in EAS/CI or a local native toolchain and record this smoke test:

1. Start the app on an Android device/emulator and an iOS simulator/device.
2. Create a known legal corrected FEN.
3. Confirm Stockfish initialises and returns three ordered lines.
4. Cancel an active analysis and leave the screen; confirm the app remains responsive.

## App Store and Google Play handoff

[`eas.json`](eas.json) includes `development`, `preview`, and `production` profiles. A publisher with the project’s Expo, Apple Developer, and Google Play credentials can build with EAS, for example:

```bash
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform all
```

Store submission itself is intentionally not part of this repository: it needs publisher-owned signing keys, store listings, privacy declarations, screenshots, and account access. Complete [`docs/release-checklist.md`](docs/release-checklist.md), particularly the native engine smoke test and Stockfish licence review, before submitting either store build.

## Recognition model and synthetic data

Synthetic rendering, dataset generation, and model training are private developer workflows under [`training/`](training/README.md). They are not imported by the mobile app and their generated outputs remain ignored. The real-photo evaluator reports piece-only and occupied-square performance separately from the `empty` class, complete-board accuracy, correction burden, and an explicit promotion verdict. Promote a model only after its full held-out real-photo report passes and a separate mobile preprocessing/runtime decision is made; then replace the intentional fallback in [`src/services/recognition.ts`](src/services/recognition.ts).

## Engine licensing

The native bridge package is pinned in [`package.json`](package.json), but it bundles Stockfish source. Stockfish is GPLv3 software; before distribution, verify the exact native dependency/version, preserve upstream notices, and meet the applicable source/attribution obligations. The implementation checklist records the required release evidence.
