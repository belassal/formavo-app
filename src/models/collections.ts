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
  clubs: 'clubs', // clubs/{clubId}
  clubMembers: 'members', // clubs/{clubId}/members/{memberId}
  clubPlayers: 'players', // clubs/{clubId}/players/{playerId}
  seasons: 'seasons', // teams/{teamId}/seasons/{seasonId}
  trainings: 'trainings', // teams/{teamId}/trainings/{trainingId}
  messages: 'messages',   // teams/{teamId}/messages/{messageId}
  photos: 'photos',       // teams/{teamId}/photos/{photoId}
  ratings: 'ratings',     // teams/{teamId}/matches/{matchId}/ratings/{playerId}
} as const;

