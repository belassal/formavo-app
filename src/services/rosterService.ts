import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type RosterStatus = 'active' | 'inactive';

function safeLower(s: any) {
  return String(s || '').toLowerCase();
}

/**
 * Listen to the team's roster (not match roster).
 * Data lives at: teams/{teamId}/roster/{playerId}
 */
export function listenTeamRoster(
  teamId: string,
  status: RosterStatus,
  onData: (rows: any[]) => void
) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.roster)
    .where('status', '==', status)
    .onSnapshot((snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(rows);
    });
}

/**
 * Edit player number & position on TEAM roster.
 */
export async function updateTeamRosterPlayer(params: {
  teamId: string;
  playerId: string;
  number?: string;
  position?: string;
}) {
  const { teamId, playerId, number = '', position = '' } = params;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.roster)
    .doc(playerId);

  await ref.set(
    {
      number: String(number || '').trim(),
      position: String(position || '').trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Move player between Active and Inactive tabs.
 */
export async function setTeamRosterPlayerStatus(params: {
  teamId: string;
  playerId: string;
  status: RosterStatus;
}) {
  const { teamId, playerId, status } = params;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.roster)
    .doc(playerId);

  await ref.set(
    {
      status,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Client-side sort: roster by jersey number (numeric first), then name.
 * Call this in UI before render.
 */
export function sortRosterByNumber(rows: any[]) {
  return [...rows].sort((a, b) => {
    const na = parseInt(String(a.number ?? ''), 10);
    const nb = parseInt(String(b.number ?? ''), 10);
    const aOk = Number.isFinite(na);
    const bOk = Number.isFinite(nb);

    if (aOk && bOk) return na - nb;
    if (aOk) return -1;
    if (bOk) return 1;

    return safeLower(a.playerName || a.name).localeCompare(safeLower(b.playerName || b.name));
  });
}

