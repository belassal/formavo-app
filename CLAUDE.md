# formavo-app

## Stack
- React Native + TypeScript
- Firebase/Firestore
- React Navigation (stack-based)
- iOS-first design language

## Design System
- Background: `#f2f2f7` (iOS system gray)
- Card containers: `borderRadius: 14`, 1px `#e5e7eb` border, white fill
- Layout: flat rows with thin dividers (NOT individual item borders per row)
- Pill buttons: `#f3f4f6` background, `borderRadius: 20`
- Primary actions: solid black buttons
- Secondary/empty state text: `#9ca3af`

## Completed Screens & Components

### TeamsScreen
- Restyled to match design system

### TeamDetailScreen
- Single grouped container with flat divider rows (not individual card borders)
- Roster section: collapsible accordion, collapsed by default, rotating `›` chevron, count badge, alphabetical sorting via `localeCompare`
- Matches section: collapsible accordion, same pattern as Roster

### MatchDetailScreen
- All modals (Add Roster, Add Event, Edit Event, Edit Match) use consistent bottom-sheet pattern:
  - Fixed headers
  - `#f3f4f6` filled inputs
  - Segmented toggles
  - Sticky footers with solid black Save buttons

### GameDayPitch.tsx
- Fixed stale ref bug: `startRef` was not updating after initial render, causing goalkeeper/defender positions to render off-screen

## Preferences
- **Flat-list-with-dividers** layout is preferred over grouped cards with individual item borders
- Review and approve changes incrementally before moving to the next task
- Design consistency across all screens is a priority — apply the design system above to any new screens or components