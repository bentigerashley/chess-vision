# Native release checklist

Use this checklist before accepting a preview build or submitting Chess Vision to Google Play or the App Store.

## Build evidence

- [ ] Build the `development` EAS profile or use `npm run android` / `npm run ios` with a native toolchain.
- [ ] On Android, capture a complete board photo, correct a known legal FEN, and verify Stockfish returns three ordered lines.
- [ ] Repeat the known-FEN Stockfish smoke test on iOS.
- [ ] Cancel an active search and navigate away; verify no crash, blocked UI, or stale result.
- [ ] Run `npm test`, `npm run typecheck`, `npx expo config --type public`, `npm run export:android`, and `npm run export:ios` from the release commit.

## Store preparation

- [ ] Confirm `com.bentigerashley.chessvision` is available and registered with the publishing Apple and Google accounts.
- [ ] Supply app icons, launch assets, store screenshots, descriptions, support URL, and privacy disclosures.
- [ ] Review camera and photo-library data handling against the submitted privacy forms.
- [ ] Verify that photo import uses the system picker without broad library permission; the camera permission is requested only when taking a new photo.
- [ ] Build and sign preview/production artifacts through the publisher-owned EAS and store accounts.

## Stockfish and native dependency review

- [ ] Record the exact `@udaychauhan/react-native-stockfish` version and the Stockfish source revision included in the native build.
- [ ] Review the bridge licence and Stockfish GPLv3 obligations for the chosen distribution model with the release owner or counsel.
- [ ] Include the required notices, source offer/source availability, and in-app or store attribution before production submission.
- [ ] Re-run the native smoke test if the engine bridge, its native build settings, or Stockfish source changes.
