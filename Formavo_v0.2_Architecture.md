# Formavo v0.2 -- Core Feature Architecture Plan

## Navigation Structure

-   TeamsScreen
-   TeamHomeScreen
-   EventsScreen
-   EventDetailScreen

## Data Model Expansion

    clubs/{clubId}
      teams/{teamId}
        events/{eventId}
          statEvents/{statEventId}

## Screens to Implement

-   Team Home (team overview)
-   Events list
-   Event detail with stats

## Security Direction

Current: allow read, write: if request.auth != null;

Next: Implement club-level role-based access control.
