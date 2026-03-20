# formavo-app

## Stack
- React Native + TypeScript
- Firebase/Firestore (via `@react-native-firebase`)
- React Navigation (native stack, tab-based root)
- iOS-first design language

## Project Structure
```
src/
  components/          # Shared UI (DateTimePickerModal, MiniPitchDisplay)
  models/              # TypeScript types (matchEvent, match, collections)
  navigation/          # Root navigator + stack definitions
  screens/
    auth/              # Login / sign-up screens
    gameDay/           # GameDayPitchScreen + EventWizard
    matches/           # MatchesScreen, MatchDetailScreen, MatchHeader
    teams/             # TeamsScreen, TeamDetailScreen
  services/            # Firebase logic (teamService, matchService, playerService, etc.)
```

## Design System
- Background: `#f2f2f7` (iOS system gray)
- Card containers: `borderRadius: 14`, 1px `#e5e7eb` border, white fill
- Layout: flat rows with thin dividers (`#f3f4f6`) — NOT individual item borders
- Pill buttons: `#f3f4f6` background, `borderRadius: 20`
- Primary actions: solid black (`#111`) buttons
- Secondary/empty state text: `#9ca3af`
- Segmented toggles: black active state, `#f3f4f6` inactive

## Key Models

### MatchEvent (`src/models/matchEvent.ts`)
```ts
type MatchEventType = 'goal' | 'card' | 'sub' | 'note';
type MatchEvent = {
  id, type, minute,
  // goal
  side, pos, assistPos, scorerId, scorerName, assistId, assistName,
  // card
  playerId, playerName, cardColor,
  // sub
  inPlayerId, inPlayerName, outPlayerId, outPlayerName,
}
```

### Match state clock
- `state.status`: `'draft' | 'live' | 'paused' | 'final'`
- `computeElapsedSec(state, now)` and `computeMinute(state, now)` in `matchClock.ts`

## Key Services

| Service | Purpose |
|---------|---------|
| `matchService.ts` | `addMatchEvent`, `buildGoalEvent`, `buildCardEvent`, `buildSubEvent`, `listenMatches`, `listenMatchEvents` |
| `teamService.ts` | `createTeam`, `listenMyTeams`, `inviteCoach`, `listenTeamMembers` |
| `playerService.ts` | `addPlayerToTeam`, `listenTeamMemberships` |
| `formation.ts` | `buildSlots(formation)` → slot positions for pitch rendering |

## Auth
- Real email/password auth via Firebase
- Anonymous sessions upgraded via `linkWithCredential` on sign-up
- Sign-in uses `signInWithEmailAndPassword` directly
- `RootGate` uses `onIdTokenChanged` (not `onAuthStateChanged`) so it fires after `linkWithCredential`

## GameDay Pitch

### Slot system
- Each match roster player can be assigned a `slotKey` (e.g. `GK`, `L1`, `L2`, `L3`)
- `playerToSlotKey`: `playerId → slotKey`
- `slotToPlayerId`: `slotKey → playerId`
- `onPitch`: players who currently **have** a slotKey (accounts for subs — bench players who came on)
- `bench`: players who **don't** have a slotKey and are present
- Always use `onPitch` (slotKey-based) rather than `role`-based filtering for live pitch state

### Substitution flow
1. EventWizard logs sub event (`buildSubEvent`)
2. `outPlayer` slotKey → null; `inPlayer` slotKey → outPlayer's old slot
3. `onPitch`/`bench` memos update automatically from the roster listener

### Player bubble badges
- **⚽ badge** (top-right, yellow): goal count per player. Shows `⚽ N` if N > 1
- **Card badge** (top-left): yellow square or red square. Red overrides yellow.

## Shared Components

### MiniPitchDisplay (`src/components/MiniPitchDisplay.tsx`)
- Read-only pitch with standard markings (penalty areas, 6-yard boxes, corner arcs)
- Props: `goalPos?: PitchPos`, `assistPos?: PitchPos`
- Yellow ⚽ marker = goal location; blue dot = assist origin
- Pitch size: 300×220, scaled from real 68m×105m pitch proportions

### EventWizard (`src/screens/gameDay/components/EventWizard.tsx`)
- Presets: `{ type: 'goal', side }` | `{ type: 'card' }` | `{ type: 'sub' }`
- Props: `starters` (on-pitch players) + `bench` (available to come on)
- MiniPitchPicker: interactive tap-to-mark with all standard pitch markings
- Always pass `assistPos: p.assistPos` alongside `pos: p.pos` to `buildGoalEvent`

## Screens Summary

### TeamsScreen
- Restyled to design system

### TeamDetailScreen
- Roster + Matches: collapsible accordions, collapsed by default, rotating `›` chevron, count badge, alphabetical sort
- Coaches accordion: shows all team members, "+ Invite" button opens email invite modal
- `inviteCoach()` + `listenTeamMembers()` from `teamService`

### MatchesScreen
- Team picker pills (horizontal scroll)
- Status filter: All / Scheduled / Live / Final
- Flat card list with dividers, navigates to MatchDetail on tap

### MatchDetailScreen
- All modals use bottom-sheet pattern (fixed header, `#f3f4f6` inputs, sticky black Save button)
- Events section: goal rows are tappable → shows `MiniPitchDisplay` with goal + assist positions
- Goals with recorded positions show a 📍 indicator
- Add Event supports: ⚽ Goal, 🟨 Card, ↕ Sub

### GameDayPitchScreen
- Fixed stale ref bug in `SlotBubble` (`startRef` not updating after initial render)
- MatchHeader quick buttons: Home Goal / Away Goal / Card / Sub
- Player tap → goal/card log modal
- Slot tap → assign player modal (allowed during live for sub corrections)

### StatsScreen (`src/screens/teams/StatsScreen.tsx`)
- Route: `TeamStats { teamId, teamName }` — navigated from TeamDetailScreen banner
- Two segments: **Team** (W/D/L record, goals, form) and **Players** (leaderboard)
- Team stats: computed from completed matches (`state.status === 'final'` or `status === 'completed'`)
- Player stats: goals/assists/yellow/red cards aggregated from all match events (home goals only for scorer/assist)
- Player leaderboard sortable by Goals / Assists / Cards; top row highlighted
- Pull-to-refresh supported
- No Firestore writes — pure client-side aggregation on read

## Preferences
- Flat-list-with-dividers layout preferred over grouped cards with individual borders
- Review and approve changes incrementally before moving to the next task
- Design consistency across all screens is a priority
