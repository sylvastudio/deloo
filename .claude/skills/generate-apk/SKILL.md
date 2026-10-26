---
name: generate-apk
description: Build, download and verify a signed Deloo Android APK. Use when the founder says "generate apk", "build the apk", "new apk", "make an apk" or asks for an installable Android file.
---

# Generate the Deloo APK

The working recipe from the original "build a real, signed Android APK" prompt (saved in
~/Desktop/prompt/library/prompts/2026-10-10-build-signed-android-apk.md). Its result is
`mobile/scripts/build-android.sh`. Run that script. Don't redo the setup.

## Steps

1. **Is a new APK needed?** Only native changes need one: icons, splash, app name, permissions,
   native libraries, SDK upgrades, and app.json fields outside `updates`. JS/TS-only changes ship
   over the air instead (`cd mobile && npx eas-cli update --channel preview --environment preview --message "…"`).
   If nothing native changed since the last APK, say so and offer the OTA update. Build anyway if
   the founder still wants the file.
2. **Commit first.** EAS uploads the working tree, so the APK should match a commit. If there are
   uncommitted changes, say what they are before building.
3. **Run it** from the repo root, in the background (builds take 10 to 20 minutes on Expo's servers):
   ```
   mobile/scripts/build-android.sh            # new build
   mobile/scripts/build-android.sh <build-id> # resume: download and verify an existing EAS build
   ```
   If the EAS build was started but the script stopped while waiting, resume with the build id it
   printed. Never start a second build for the same change.
   If this session's permissions block the command, give the founder the exact line to run with `!`.
4. **Report** from the script's output only. Give the APK's full path (in `~/Desktop/Deloo APK/`),
   its size, SHA-256, signer certificate SHA-256, package, version, and min/target SDK. Say what was
   verified (signature, identity, alignment) and that it wasn't installed on a device by us.
   Install steps: copy the file to the phone, open it, allow "install unknown apps", and install
   over the old one (same signing key, so data is kept).

## Never

- Never fake or rename a file as an APK, or claim success before `apksigner verify` passes.
- Never touch the release keystore. It lives in the sylva-studio Expo account; EAS uses it remotely.
- Never print EAS secrets or env values.
