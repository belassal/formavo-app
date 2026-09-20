// models/staffPosition.ts
//
// Per-team staff positions. The position is a display TITLE stored per team
// (clubs/{c}/members/{uid}.teamPositions[teamId], mirrored onto
// teams/{t}/members/{uid}.title by the syncClubMemberTeams function).
// Permissions stay on the coarse team role (coach | assistant) — only the
// Head Coach position maps to 'coach'; everything else is 'assistant'
// (rules treat both as staff, so this only affects labels and defaults).

export const STAFF_POSITIONS = [
  'Head Coach',
  'Assistant Coach',
  'Team Manager',
  'GK Coach',
  'Stats Specialist',
  'Physio',
] as const;

export type ClubRoleForDefault = 'owner' | 'head_coach' | 'asst_coach' | 'staff';

/** Default per-team position when none is chosen explicitly. */
export function defaultPositionForClubRole(role: ClubRoleForDefault): string {
  if (role === 'owner' || role === 'head_coach') return 'Head Coach';
  if (role === 'asst_coach') return 'Assistant Coach';
  return 'Team Manager';
}

export function positionToTeamRole(title: string): 'coach' | 'assistant' {
  return title === 'Head Coach' ? 'coach' : 'assistant';
}
