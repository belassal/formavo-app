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

## Club requests (owner approval)
- `ADMIN_NOTIFY_EMAIL` — where new club requests are emailed. The CLI prompts
  for it on first deploy and stores it in `functions/.env`; or create that file
  yourself with `ADMIN_NOTIFY_EMAIL=you@example.com` before deploying.
- Approve a request: Firestore console → `clubRequests/{id}` → set `status`
  to `approved` (or `rejected`). `onClubRequestUpdated` provisions the club,
  makes the requester its owner, and emails them.
- Existing clubs (created before this flow) need a plan before their owners
  can add teams: `node scripts/backfillClubPlans.js --dry-run`, then without
  the flag. Run it BEFORE deploying the new firestore.rules.

## Test notifications
firebase functions:log  (to see trigger logs)
