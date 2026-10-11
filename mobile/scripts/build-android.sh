#!/usr/bin/env bash
# Build, download and verify a signed Deloo Android APK (macOS).
#
#   mobile/scripts/build-android.sh            # new build on EAS (profile: preview → APK)
#   mobile/scripts/build-android.sh <build-id> # just download + verify an existing EAS build
#
# Builds run on Expo's servers (EAS Build) with the project's release keystore, which lives in the
# sylva-studio Expo account (never on this Mac). Verification uses JDK 17 + Android build-tools in
# ~/.local/android-tools (installed once, no admin rights). Output: ~/Desktop/Deloo APK/.
#
# Day-to-day changes don't need a new APK: ship them over the air with
#   cd mobile && npx eas-cli update --channel preview --message "what changed"
# A new APK is only needed for native changes (new permission, native library, SDK upgrade, icon/name).
set -euo pipefail

cd "$(dirname "$0")/.."
TOOLS="$HOME/.local/android-tools"
# Java 17 (Azul Zulu JRE, or any JDK 17) and build-tools 36 (Google's archive unpacks as android-16).
JAVA_BIN="$(find "$TOOLS" -path '*/bin/java' -type f 2>/dev/null | head -1)"
JAVA_HOME="${JAVA_BIN%/bin/java}"
BT="$(ls -d "$TOOLS"/sdk/build-tools/*/ 2>/dev/null | head -1)"; BT="${BT%/}"
OUT="$HOME/Desktop/Deloo APK"
export JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

if [[ -z "$JAVA_BIN" || ! -x "$BT/apksigner" ]]; then
  echo "Installing verification tools once (user-local, official sources)…"
  mkdir -p "$TOOLS/jre" "$TOOLS/sdk/build-tools"
  ZURL="$(curl -s "https://api.azul.com/metadata/v1/zulu/packages/?java_version=17&os=macos&arch=aarch64&archive_type=tar.gz&java_package_type=jre&latest=true&release_status=ga&availability_types=CA&page_size=1" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["download_url"])')"
  curl -fL -C - --retry 5 -o "$TOOLS/jre.tar.gz" "$ZURL" && tar -xzf "$TOOLS/jre.tar.gz" -C "$TOOLS/jre" --strip-components=1 && rm "$TOOLS/jre.tar.gz"
  curl -fL -C - --retry 5 -o "$TOOLS/bt.zip" "https://dl.google.com/android/repository/build-tools_r36_macosx.zip" \
    && unzip -q -o "$TOOLS/bt.zip" -d "$TOOLS/sdk/build-tools" && rm "$TOOLS/bt.zip"
  exec "$0" "$@"
fi

BUILD_ID="${1:-}"
if [[ -z "$BUILD_ID" ]]; then
  echo "Starting EAS build (android, preview)…"
  BUILD_ID="$(npx eas-cli build --platform android --profile preview --non-interactive --no-wait --json \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
fi
echo "Build: https://expo.dev/accounts/sylva-studio/projects/deloo/builds/$BUILD_ID"

while :; do
  J="$(npx eas-cli build:view "$BUILD_ID" --json)"
  STATUS="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' <<<"$J")"
  case "$STATUS" in
    FINISHED) break ;;
    ERRORED|CANCELED) echo "Build $STATUS. See the logs at the link above."; exit 1 ;;
    *) echo "  $STATUS…"; sleep 30 ;;
  esac
done

URL="$(python3 -c 'import json,sys; a=json.load(sys.stdin)["artifacts"]; print(a.get("applicationArchiveUrl") or a["buildUrl"])' <<<"$J")"
VERSION="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("appVersion","")+"-"+str(d.get("appBuildVersion","")))' <<<"$J")"
mkdir -p "$OUT"
APK="$OUT/Deloo-$VERSION-$(date +%Y%m%d).apk"
curl -fL -C - --retry 5 --progress-bar -o "$APK" "$URL"

echo; echo "== Signature";  "$BT/apksigner" verify --verbose --print-certs "$APK" | grep -E "Verified using|Number of signers|Signer #1 certificate (DN|SHA-256)"
echo; echo "== Identity";   "$BT/aapt2" dump badging "$APK" | grep -E "^package:|^minSdkVersion|^targetSdkVersion|^launchable-activity|^application-label:"
echo; echo "== Alignment";  "$BT/zipalign" -c -P 16 4 "$APK" && echo "aligned"
echo; echo "== File";       ls -lh "$APK" | awk '{print $5, $9, $10, $11}'; shasum -a 256 "$APK"
echo; echo "Done: $APK"
