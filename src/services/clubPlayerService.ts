import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type ClubPlayer = {
  id: string;
  name: string;
  nameLower: string;
  number?: string;
  position?: string;
  avatarUrl?: string;
  dob?: string;
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
  name?: string;
  number?: string;
  position?: string;
  avatarUrl?: string;
  dob?: string;
}): Promise<void> {
  const { clubId, playerId, name, ...rest } = params;
  const patch: any = { updatedAt: serverTimestamp(), ...rest };
  if (name !== undefined) {
    patch.name = name.trim();
    patch.nameLower = name.trim().toLowerCase();
  }
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubPlayers)
    .doc(playerId)
    .set(patch, { merge: true });
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

              // Get events for this player
              const eventsSnap = await db
                .collection(COL.teams)
                .doc(teamId)
                .collection(COL.matches)
                .doc(matchId)
                .collection(COL.events)
                .where('playerId', '==', playerId)
                .get();

              eventsSnap.docs.forEach((ev) => {
                const e = ev.data() as any;
                if (e.type === 'goal') goals += 1;
                if (e.type === 'goal' && e.assistPlayerId) assists += 0; // counted separately
                if (e.type === 'assist') assists += 1;
                if (e.type === 'yellow_card') yellowCards += 1;
                if (e.type === 'red_card') redCards += 1;
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

      // Skip if already migrated
      const existing = await clubPlayerRef.get();
      if (existing.exists) return;

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
        });
      }
    }),
  );

  await batch.commit();
}
