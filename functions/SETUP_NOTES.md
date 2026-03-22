# Push Notification Setup Notes

## iOS (requires Xcode)
1. In Xcode: Signing & Capabilities → + Capability → Push Notifications
2. In Xcode: Signing & Capabilities → + Capability → Background Modes → check "Remote notifications"
3. Upload APNs key or certificate to Firebase Console → Project Settings → Cloud Messaging → iOS app

## Android
Android is auto-configured via google-services.json (already in project).

## Deploy Cloud Functions
cd functions
npm install
cd ..
firebase deploy --only functions

## Test notifications
firebase functions:log  (to see trigger logs)
