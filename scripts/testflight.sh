#!/bin/bash
# One-command TestFlight upload: bumps the build number, archives Release,
# and uploads to App Store Connect — fully headless via an ASC API key
# (no Xcode, no keychain prompts). Run from anywhere: npm run testflight
#
# One-time setup (see scripts/testflight.env.example):
#   1. App Store Connect → Users and Access → Integrations → Team Keys →
#      generate a key with the "App Manager" role.
#   2. Download AuthKey_<KEYID>.p8 into ~/.appstoreconnect/private_keys/
#   3. cp scripts/testflight.env.example scripts/testflight.env and fill in
#      the key ID + issuer ID (testflight.env is gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="scripts/testflight.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ Missing $ENV_FILE — copy scripts/testflight.env.example and fill it in." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"
: "${ASC_KEY_ID:?ASC_KEY_ID not set in $ENV_FILE}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID not set in $ENV_FILE}"

KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
if [ ! -f "$KEY_PATH" ]; then
  echo "✗ API key not found at $KEY_PATH" >&2
  echo "  Download it from App Store Connect → Users and Access → Integrations." >&2
  exit 1
fi

# Archives die ugly when the disk fills mid-build (been there) — check first.
AVAIL_GB=$(df -g / | awk 'NR==2 {print $4}')
if [ "$AVAIL_GB" -lt 10 ]; then
  echo "✗ Only ${AVAIL_GB}GB free on disk — need ~10GB for an archive. Free some space first." >&2
  exit 1
fi

# Re-run pod install when the Podfile changed (also regenerates RN codegen
# under ios/build/generated, which archives depend on).
if ! diff -q ios/Podfile.lock ios/Pods/Manifest.lock >/dev/null 2>&1; then
  echo "› Podfile changed — running pod install…"
  (cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install)
fi

# Bump CURRENT_PROJECT_VERSION (all configurations share one value).
PBX="ios/Formavo.xcodeproj/project.pbxproj"
CUR=$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PBX" | sed 's/[^0-9]//g')
NEXT=$((CUR + 1))
sed -i '' "s/CURRENT_PROJECT_VERSION = ${CUR};/CURRENT_PROJECT_VERSION = ${NEXT};/g" "$PBX"
VERSION=$(grep -m1 'MARKETING_VERSION = ' "$PBX" | sed 's/.*= \(.*\);/\1/')
echo "› Uploading ${VERSION} (${NEXT})  [was build ${CUR}]"

ARCHIVE="ios/build/Formavo.xcarchive"
rm -rf "$ARCHIVE"

echo "› Archiving (Release)…"
LANG=en_US.UTF-8 xcodebuild archive \
  -workspace ios/Formavo.xcworkspace \
  -scheme Formavo \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  -quiet

echo "› Uploading to App Store Connect…"
LANG=en_US.UTF-8 xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/ExportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# The archive swaps the RELEASE prebuilt React core into ios/Pods. RN swaps it
# back per-configuration via a marker file, but `pod install` sweeps that marker,
# which can strand Debug/simulator builds on release binaries ("Sealable"
# undefined-symbol linker errors). Swap Debug back now so local dev keeps working.
echo "› Restoring Debug React core for local dev builds…"
RN_VERSION=$(node -p "require('./node_modules/react-native/package.json').version")
(cd ios/Pods && node ../../node_modules/react-native/scripts/replace-rncore-version.js \
  -c Debug -r "$RN_VERSION" -p "$PWD") || echo "  (non-fatal — run it manually if the next simulator build fails to link)"

echo ""
echo "✓ Build ${VERSION} (${NEXT}) uploaded — it appears in TestFlight after Apple processes it (~5–15 min)."
echo "  Remember to commit the build-number bump:"
echo "    git add ios/Formavo.xcodeproj/project.pbxproj && git commit -m 'chore: build ${NEXT}'"
