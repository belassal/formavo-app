import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type ClubPlayer = {
  id: string;
  name: string;
  nameLower: string;
  firstName?: string;
  lastName?: string;
  number?: string;
  positions?: string[];  // multi-position array (source of truth)
  position?: string;     // joined display string kept in sync for roster views
  avatarUrl?: string;
  dob?: string;           // ISO date string e.g. "2012-04-15"
  phone?: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  notes?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
};

// ── Create ────────────────────────────────────────────────────────────────────

export async function createClubPlayer(params: {
  clubId: string;
  name: string;
  number?: string;
  position?: string;
  createdBy: string;
}): Promise<string> {
  const { clubId, name, number = '', position = '', createdBy } = params;
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Player name is required');

  const ref = db.collection(COL.clubs).doc(clubId).collection(COL.clubPlayers).doc();
  await ref.set({
    name: trimmed,
    nameLower: trimmed.toLowerCase(),
    number: number.trim(),
    position: position.trim(),
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function listenClubPlayers(
  clubId: string,
  onData: (players: ClubPlayer[]) => void,
): () => void {
  return db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubPlayers)
    .orderBy('nameLower')
    .onSnapshot(
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubPlayer))),
      (err) => { console.warn('[clubPlayers] listen error', err); onData([]); },
    );
}

export function listenClubPlayerSearch(
  clubId: string,
  query: string,
  onData: (players: ClubPlayer[]) => void,
): () => void {
  const q = query.trim().toLowerCase();
  if (!q) { onData([]); return () => {}; }

  return db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubPlayers)
    .orderBy('nameLower')
    .startAt(q)
    .endAt(q + '\uf8ff')
    .limit(20)
    .onSnapshot(
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubPlayer))),
      (err) => { console.warn('[clubPlayerSearch] error', err); onData([]); },
    );
}

export async function updateClubPlayer(params: {
  clubId: string;
  playerId: string;
  firstName?: string;
  lastName?: string;
  number?: string;
  positions?: string[];
  avatarUrl?: string;
  dob?: string;
  phone?: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  notes?: string;
}): Promise<void> {
  const { clubId, playerId, firstName, lastName, positions, ...rest } = params;
  const patch: any = { updatedAt: serverTimestamp(), ...rest };
  if (firstName !== undefined) patch.firstName = firstName.trim();
  if (lastName !== undefined) patch.lastName = lastName.trim();
  if (firstName !== undefined || lastName !== undefined) {
    const f = (firstName ?? '').trim();
    const l = (lastName ?? '').trim();
    patch.name = [f, l].filter(Boolean).join(' ') || 'Unknown';
    patch.nameLower = patch.name.toLowerCase();
  }
  if (positions !== undefined) {
    patch.positions = positions;
    patch.position = positions.join(' · '); // joined string for roster display
  }
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubPlayers)
    .doc(playerId)
    .set(patch, { merge: true });
}

export async function getClubPlayer(params: {
  clubId: string;
  playerId: string;
}): Promise<ClubPlayer | null> {
  const snap = await db
    .collection(COL.clubs)
    .doc(params.clubId)
    .collection(COL.clubPlayers)
    .doc(params.playerId)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as any) } as ClubPlayer;
}

/**
 * Propagates name/number/position/avatarUrl from the club player registry
 * back into every team's playerMemberships doc for this player.
 *
 * Strategy (two passes to handle teams not yet tagged with clubId):
 * 1. Query teams by clubId field (works for newly created teams)
 * 2. Also check teamIds stored on the club player doc itself
 */
export async function syncClubPlayerToMemberships(params: {
  clubId: string;
  playerId: string;
  name: string;
  number: string;
  positions: string[];
  avatarUrl?: string | null;
}): Promise<void> {
  const { clubId, playerId, name, number, positions, avatarUrl } = params;

  const patch: any = {
    playerName: name,
    number,
    position: positions.join(' · '), // joined for display in roster views
    updatedAt: serverTimestamp(),
  };
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl ?? null;

  // Collect all team IDs to update (deduplicated)
  const teamIds = new Set<string>();

  // Pass 1: teams tagged with clubId in Firestore
  const teamsSnap = await db
    .collection(COL.teams)
    .where('clubId', '==', clubId)
    .get();
  teamsSnap.docs.forEach((d) => teamIds.add(d.id));

  // Pass 2: teamIds stored on the club player doc (populated during migration)
  const playerSnap = await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubPlayers)
    .doc(playerId)
    .get();
  const storedTeamIds: string[] = (playerSnap.data() as any)?.teamIds ?? [];
  storedTeamIds.forEach((id) => teamIds.add(id));

  if (teamIds.size === 0) return;

  const batch = db.batch();

  await Promise.all(
    Array.from(teamIds).map(async (teamId) => {
      const memRef = db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.playerMemberships)
        .doc(playerId);

      const memSnap = await memRef.get();
      if (!memSnap.exists) return;

      batch.set(memRef, patch, { merge: true });
    }),
  );

  await batch.commit();
}

// ── Career stats ──────────────────────────────────────────────────────────────

export type CareerSeason = {
  teamId: string;
  teamName: string;
  seasonId: string;
  seasonLabel: string;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

export async function getPlayerCareerStats(params: {
  clubId: string;
  playerId: string;
}): Promise<CareerSeason[]> {
  const { clubId, playerId } = params;

  // Get all teams in the club
  const teamsSnap = await db
    .collection(COL.teams)
    .where('clubId', '==', clubId)
    .get();

  const results: CareerSeason[] = [];

  await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const teamId = teamDoc.id;
      const teamName = teamDoc.data().name || 'Unknown Team';

      // Get all seasons for this team
      const seasonsSnap = await db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.seasons)
        .get();

      await Promise.all(
        seasonsSnap.docs.map(async (seasonDoc) => {
          const seasonId = seasonDoc.id;
          const seasonLabel = seasonDoc.data().label || seasonId;

          // Count matches where this player was a starter or bench
          const matchesSnap = await db
            .collection(COL.teams)
            .doc(teamId)
            .collection(COL.matches)
            .where('seasonId', '==', seasonId)
            .get();

          let appearances = 0;
          let goals = 0;
          let assists = 0;
          let yellowCards = 0;
          let redCards = 0;

          await Promise.all(
            matchesSnap.docs.map(async (matchDoc) => {
              const matchId = matchDoc.id;

              // Check if player was in the roster
              const rosterDoc = await db
                .collection(COL.teams)
                .doc(teamId)
                .collection(COL.matches)
                .doc(matchId)
                .collection(COL.roster)
                .doc(playerId)
                .get();

              if (rosterDoc.exists) {
                const r = rosterDoc.data() as any;
                if (r.role === 'starter') appearances += 1;
              }

              // Get all events for this match and filter by player
              const eventsSnap = await db
                .collection(COL.teams)
                .doc(teamId)
                .collection(COL.matches)
                .doc(matchId)
                .collection(COL.events)
                .get();

              eventsSnap.docs.forEach((ev) => {
                const e = ev.data() as any;
                if (e.type === 'goal' && e.scorerId === playerId) goals += 1;
                if (e.type === 'goal' && e.assistId === playerId) assists += 1;
                if (e.type === 'card' && e.playerId === playerId) {
                  if (e.cardColor === 'yellow') yellowCards += 1;
                  if (e.cardColor === 'red') redCards += 1;
                }
              });
            }),
          );

          if (appearances > 0 || goals > 0) {
            results.push({
              teamId, teamName, seasonId, seasonLabel,
              appearances, goals, assists, yellowCards, redCards,
            });
          }
        }),
      );
    }),
  );

  // Sort by most recent first (by seasonLabel alphabetically descending)
  return results.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
}

// ── Migration ─────────────────────────────────────────────────────────────────
// Migrates players from global `players/{id}` collection into
// `clubs/{clubId}/players/{id}` for a given team.
// Safe to run multiple times (idempotent).

export async function migrateTeamPlayersToClub(params: {
  teamId: string;
  clubId: string;
}): Promise<void> {
  const { teamId, clubId } = params;

  const membershipsSnap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .get();

  const batch = db.batch();

  await Promise.all(
    membershipsSnap.docs.map(async (memDoc) => {
      const playerId = memDoc.id;
      const clubPlayerRef = db
        .collection(COL.clubs)
        .doc(clubId)
        .collection(COL.clubPlayers)
        .doc(playerId);

      // If already migrated, just ensure teamId is recorded
      const existing = await clubPlayerRef.get();
      if (existing.exists) {
        batch.set(clubPlayerRef, { teamIds: firestore.FieldValue.arrayUnion(teamId) }, { merge: true });
        return;
      }

      // Try to get from global players collection
      const globalPlayerDoc = await db.collection(COL.players).doc(playerId).get();
      const memData = memDoc.data() as any;

      if (globalPlayerDoc.exists) {
        const gd = globalPlayerDoc.data() as any;
        batch.set(clubPlayerRef, {
          name: gd.name || memData.playerName || 'Unknown',
          nameLower: (gd.name || memData.playerName || 'unknown').toLowerCase(),
          number: gd.number || memData.number || '',
          position: gd.position || memData.position || '',
          avatarUrl: gd.avatarUrl || memData.avatarUrl || null,
          createdBy: gd.createdBy || '',
          createdAt: gd.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          teamIds: firestore.FieldValue.arrayUnion(teamId),
        });
      } else {
        // No global player doc — build from membership data
        batch.set(clubPlayerRef, {
          name: memData.playerName || 'Unknown',
          nameLower: (memData.playerName || 'unknown').toLowerCase(),
          number: memData.number || '',
          position: memData.position || '',
          avatarUrl: memData.avatarUrl || null,
          createdBy: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          teamIds: firestore.FieldValue.arrayUnion(teamId),
        });
      }
    }),
  );

  await batch.commit();
}
