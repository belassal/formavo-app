# formavo-app

Youth/amateur football club management: teams, rosters, scheduling, live match
console, stats, and a read-and-RSVP experience for parents.

## Stack
- React Native + TypeScript (iOS-first; Metro dev builds)
- Firebase via `@react-native-firebase` (Auth, Firestore, Storage, Messaging)
- Cloud Functions (Node 22, `firebase-functions/v1` API, modular admin SDK) in `functions/`
- React Navigation: bottom tabs (Home, Teams, Stats, Settings), stack per tab
- Firebase project: `formavo-prod`

## Project Structure
```
src/
  components/          # Avatar, DateTimePickerModal, MiniPitchDisplay, Location*
  constants/brand.ts   # B.* palette (navy #0a1628 + green #22c55e + neutrals)
  models/              # matchEvent, match (MatchState), lineup, collections (COL)
  navigation/          # RootGate → AppTabs → Home/Teams/Stats/Settings stacks
  screens/
    auth/              # LoginScreen (sign in / sign up, invite hint)
    home/              # HomeScreen — schedule + next-up hero + last result
    club/              # ClubDashboard, ClubPlayers, StaffList/Profile, ClubSettings
    gameDay/           # EventWizard (+ MiniPitchPicker)
    matches/           # MatchDetail, MatchRecap, GameDayPitch (+ MatchHeader, GameDayPitch component)
    teams/             # TeamDetail, TeamSchedule, TrainingDetail, PlayerProfile,
                       # PlayerSeasonCard, PlayerAttendance, OpponentHistory, Stats, Chat, Photos
    settings/          # SettingsScreen (notification prefs), LocationsScreen
    stats/             # Cross-team StatsScreen
  services/            # ALL Firebase logic; screens only consume
firestore.rules        # deployed security rules — see Security below
storage.rules
firestore.indexes.json # COMPLETE composite-index inventory — deploying this
                       # file REPLACES all indexes; never deploy a partial list
                       # (a partial deploy in Aug 2026 wiped prod indexes and
                       # broke rosters/photos/invites)
functions/src/index.ts # all Cloud Functions
```

## Roles & Auth
- Team roles: `coach | assistant | parent` (members keyed by uid at
  `teams/{id}/members/{uid}`). Club roles: `owner | head_coach | asst_coach | staff`
  (`clubs/{id}/members/{uid}`). App permission checks are mostly parent vs not-parent.
- Email/password auth; anonymous sessions upgraded via `linkWithCredential`.
  `RootGate` uses `onIdTokenChanged`.
- **Invites are docs keyed `invite_{emailLower}`** in team/club members collections
  (deterministic IDs are load-bearing: security rules validate self-join against
  them). `acceptTeamInvitesForUser` (called on sign-in/up) discovers invites via
  `collectionGroup('members')` by `invitedEmailLower`, routes by parent collection
  (teams vs clubs share the literal collection name `members`), creates the real
  member doc, records `linkedPlayerIds` for parents, and **deletes** the invite doc.
  Coach, parent, and club-staff invites all send email via the `mail` collection
  (Trigger Email extension).
- Every coach implicitly owns a club (`getOrCreateClubForUser`); the club UI on
  TeamsScreen appears only with >1 team or >1 staff.

## Security (deployed)
- `firestore.rules`: team data readable by team members + members of the team's
  club; writable by coach/assistant + club staff. Parents may only write:
  match-roster RSVP fields (own linked children, validated via `linkedPlayerIds`
  on their member doc), training RSVP arrays, and chat messages
  (`senderId == uid`). Aggregates subcollections are read-only for clients
  (functions write them). `mail` is create-only.
- `storage.rules`: images only, <10MB; team photos coach-only, club logo
  manager-only, own avatar only. Known soft spot: `players/{id}/avatar.jpg` has
  no team in path → any signed-in user may write.
- Rules depend on invite doc IDs and `linkedPlayerIds` — don't change invite
  writing without updating rules.

## Match model — two synced status fields
- `match.status`: `scheduled | live | completed` (top-level, drives badges/RSVP gating).
- `match.state.status`: `draft | live | paused | halftime | final` + clock fields
  (`elapsedSec`, `resumedAt`/`startedAt` epoch-ms) — see `matchClock.ts`.
- These are kept in sync: `markMatchLive`/`markMatchCompleted` (MatchDetail) also
  drive `state` via transactions; GameDay kickoff/full-time also write top-level
  status. Keep it that way.
- Clock display and event minutes are capped at scheduled play + 20' stoppage
  (`computeCappedMinute`, `computeDisplayMinute` shows trailing `+`). An hourly
  function auto-finalizes matches left live 6+ hours.

## Cloud Functions (functions/src/index.ts, all deployed)
- Notifications (all respect `users/{uid}.notificationPrefs` — opt-out; keys:
  `announcements schedule rsvp chat live digest`; Settings screen has toggles):
  announcement, match created, training created, RSVP→coaches, chat message,
  training attendance→coaches, **goal events → live score push to whole team**.
- Aggregates: on match completion (or post-completion score/event edits) build
  `match.summary` (scorers, cards, per-player minutes) then recompute
  `teams/{t}/aggregates/{seasonId|none}` and
  `teams/{t}/playerAggregates/{playerId}_{seasonId|none}` from summaries.
  Recompute-on-write, idempotent. Historical matches were backfilled Aug 2026.
- Scheduled: `weeklyDigest` (Sun 18:00 America/Halifax), `rsvpReminders`
  (daily 17:00, matches inside 48h, once per match via `rsvpReminderSent`),
  `sweepStaleLiveMatches` (hourly).
- Member docs are keyed by uid — recipient lookup is `d.id`, never `d.data().uid`.
- Gotcha: `functions/package.json` must keep `@firebase/app` as a direct dep
  (firebase-admin 14 peer-dep quirk; cloud builds fail without it).

## Key Screens / Features
- **HomeScreen**: week-bucketed schedule + child-switcher (parents with 2+ kids)
  + dark "next up" hero (countdown, RSVP glance: parent own status / coach
  confirmed count) + last-result card. Never renders empty when data exists.
- **GameDayPitchScreen**: live console — clock (MatchHeader), quick events via
  EventWizard (away goals need no roster scorer; optional free-text opponent
  scorer), slot-based lineup with drag layout, saved lineups, minutes tracker.
  `onPitch`/`bench` are slotKey-based, not role-based.
- **MatchRecapScreen**: scoreline hero, goal timeline, multi-goal shot map
  (`MiniPitchDisplay markers` prop), cards, minutes (summary-first, client
  fallback), native share. Entry: Recap pill on completed MatchDetail.
- **PlayerSeasonCardScreen**: shareable stat card; params assembled by
  PlayerProfileScreen.
- **MatchDetailScreen**: bottom-sheet modals, events feed with 📍 goal maps,
  availability/RSVP roll-up, roster management, ratings (Development Log),
  type-opponent-name-to-delete.
- **TeamDetailScreen**: accordions (matches, roster, trainings, announcements,
  coaches, parents), seasons (picker + new-season keep-list flow), chat, photos.
  Parents skip season-bootstrap writes (`isParent` guard).
- Trainings: doc-level RSVP arrays (`confirmedPlayerIds`/`declinedPlayerIds`),
  coach check-in via `attendedPlayerIds`. Match RSVPs live on roster docs
  (`rsvpStatus` etc.) — two different mechanisms.
- Stats screens still aggregate client-side; prefer migrating reads to
  `aggregates`/`playerAggregates` when touching them.

## Design System
- Background `#f2f2f7`; white cards `borderRadius: 14`, 1px `#e5e7eb` border
- Flat rows with thin dividers (`#f3f4f6`) — not per-item borders
- Primary actions solid black `#111`; pills `#f3f4f6` radius 20
- Dark hero surfaces `#0b1220`/`B.navy`; accent green `B.green`
- Segmented toggles: black active / `#f3f4f6` inactive

## Preferences
- Flat-list-with-dividers layout preferred over grouped cards
- Review and approve changes incrementally before moving to the next task
- Design consistency across all screens is a priority

## Known gaps / next work
- Privacy policy draft in `docs/privacy-policy.md` needs legal review; basic
  delete-account exists in Settings (auth + user doc only — memberships remain).
- Recurring trainings: `recurrenceId` written but no edit/delete-series flow.
- `photoService` supports per-match photos (`matchId` param) — no UI passes it.
- Player avatars storage path lacks team scoping (see storage.rules note).
- Android untested; payments not started.
