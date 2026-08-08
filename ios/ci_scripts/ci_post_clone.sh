#!/bin/sh
# Xcode Cloud post-clone: install JS toolchain + dependencies for the RN build.
set -e

export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_AUTO_UPDATE=1

echo "=== Installing Node + CocoaPods ==="
brew install node@20 cocoapods
brew link --overwrite node@20
export PATH="/opt/homebrew/opt/node@20/bin:/usr/local/opt/node@20/bin:$PATH"
node --version

echo "=== Installing npm dependencies ==="
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci

echo "=== Installing pods ==="
cd ios
pod install

echo "=== ci_post_clone complete ==="
