export const COL = {
  users: 'users',
  players: 'players',
  teams: 'teams',
  members: 'members',
  teamRefs: 'teamRefs', // users/{uid}/teamRefs/{teamId}
  playerMemberships: 'playerMemberships',
  matches: 'matches',
  roster: 'roster',
  events: 'events', // teams/{teamId}/matches/{matchId}/events/{eventId}
  lineups: 'lineups', // teams/{teamId}/lineups/{lineupId}
  announcements: 'announcements', // teams/{teamId}/announcements/{announcementId}
} as const;

