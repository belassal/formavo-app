import { db } from './firebase';
import { COL } from '../models/collections';
import { STAFF_POSITIONS } from '../models/staffPosition';
import type { ClubMember } from './clubService';

// Club-managed staff position catalog: clubs/{c}/config/staffPositions
// { positions: string[] }. Missing doc = the built-in defaults. All pickers
// (club invite, team invite, staff profile) read this list so titles stay a
// controlled vocabulary that reports can count on.

const configRef = (clubId: string) =>
  db.collection(COL.clubs).doc(clubId).collection('config').doc('staffPositions');

export const DEFAULT_POSITIONS: string[] = [...STAFF_POSITIONS];

export function listenClubPositions(clubId: string, onData: (positions: string[]) => void) {
  return configRef(clubId).onSnapshot(
    (snap) => {
      const list = (snap.data() as any)?.positions;
      onData(Array.isArray(list) && list.length > 0 ? list : DEFAULT_POSITIONS);
    },
    (err) => {
      console.log('[staffPositionService] listen error:', err);
      onData(DEFAULT_POSITIONS);
    }
  );
}

/** Seeds the doc with the defaults on first write, then applies `mutate`. */
async function withPositions(clubId: string, mutate: (list: string[]) => string[]) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(configRef(clubId));
    const current: string[] =
      (snap.data() as any)?.positions?.length > 0 ? (snap.data() as any).positions : DEFAULT_POSITIONS;
    tx.set(configRef(clubId), { positions: mutate(current) }, { merge: true });
  });
}

/** Adds a position if not already present (case-insensitive). Best-effort safe. */
export async function addClubPosition(clubId: string, title: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  await withPositions(clubId, (list) =>
    list.some((p) => p.toLowerCase() === t.toLowerCase()) ? list : [...list, t]
  );
}

export async function removeClubPosition(clubId: string, title: string): Promise<void> {
  await withPositions(clubId, (list) => list.filter((p) => p !== title));
}

/**
 * Renames a position in the catalog AND on every club member currently
 * holding it (teamPositions map, invites included). The syncClubMemberTeams
 * function then mirrors the new title onto team member docs + teamRefs.
 */
export async function renameClubPosition(params: {
  clubId: string;
  oldTitle: string;
  newTitle: string;
}): Promise<void> {
  const { clubId, oldTitle } = params;
  const newTitle = params.newTitle.trim();
  if (!newTitle || newTitle === oldTitle) return;

  await withPositions(clubId, (list) => {
    const next = list.map((p) => (p === oldTitle ? newTitle : p));
    // Collapse duplicates if the new name already existed.
    return next.filter((p, i) => next.indexOf(p) === i);
  });

  const membersSnap = await db.collection(COL.clubs).doc(clubId).collection(COL.clubMembers).get();
  const batch = db.batch();
  let writes = 0;
  for (const doc of membersSnap.docs) {
    const positions = (doc.data() as any)?.teamPositions as Record<string, string> | undefined;
    if (!positions) continue;
    if (!Object.values(positions).includes(oldTitle)) continue;
    const next: Record<string, string> = {};
    for (const [teamId, title] of Object.entries(positions)) {
      next[teamId] = title === oldTitle ? newTitle : title;
    }
    batch.update(doc.ref, { teamPositions: next });
    writes++;
  }
  if (writes) await batch.commit();
}

/** How many club members (incl. pending invites) hold each position. */
export function positionUsageCounts(members: ClubMember[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of members) {
    for (const title of Object.values(m.teamPositions ?? {})) {
      counts[title] = (counts[title] ?? 0) + 1;
    }
  }
  return counts;
}
