import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import firestore from '@react-native-firebase/firestore';

export type MatchStatus = 'scheduled' | 'live' | 'completed';
export type MatchRole = 'starter' | 'bench';
export type AttendanceStatus = 'present' | 'injured' | 'absent';

function norm(s: string) {
  return (s || '').trim();
}

export async function createMatch(params: {
  teamId: string;
  opponent: string;
  dateISO: string; // "2026-02-20 19:00"
  location?: string;
}) {
  const { teamId, opponent, dateISO, location = '' } = params;

  if (!opponent.trim()) throw new Error('Opponent is required');
  if (!dateISO.trim()) throw new Error('Date is required');

  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc();

  await matchRef.set({
    opponent: opponent.trim(),
    opponentLower: opponent.trim().toLowerCase(),
    dateISO: dateISO.trim(),
    location: location.trim(),
    status: 'scheduled' as MatchStatus,
    isDeleted: false,
    homeScore: 0,
    awayScore: 0,
    // v0.3: cached count
    rosterCount: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return matchRef.id;
}

export function listenMatches(teamId: string, onData: (rows: any[]) => void) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .orderBy('createdAt', 'desc')
    .onSnapshot((snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function updateMatch(params: {
  teamId: string;
  matchId: string;
  opponent?: string;
  dateISO?: string;
  location?: string;
}) {
  const { teamId, matchId } = params;

  const patch: any = { updatedAt: serverTimestamp() };

  if (params.opponent != null) {
    const opponent = norm(params.opponent);
    if (!opponent) throw new Error('Opponent is required');
    patch.opponent = opponent;
    patch.opponentLower = opponent.toLowerCase();
  }
  if (params.dateISO != null) {
    const dateISO = norm(params.dateISO);
    if (!dateISO) throw new Error('Date is required');
    patch.dateISO = dateISO;
  }
  if (params.location != null) {
    patch.location = norm(params.location);
  }

  await db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId).update(patch);
}

/** Soft delete match */
export async function softDeleteMatch(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/** Mark match as completed */
export async function markMatchCompleted(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      status: 'completed' as MatchStatus,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/**
 * Match roster (per-match players)
 * teams/{teamId}/matches/{matchId}/roster/{playerId}
 */
export function listenMatchRoster(teamId: string, matchId: string, onData: (rows: any[]) => void) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .orderBy('addedAt', 'desc')
    .onSnapshot((snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/**
 * OPTIONAL listener if you still want it somewhere else,
 * but for MatchesScreen we'll use match.rosterCount instead.
 */
export function listenMatchPlayerCount(teamId: string, matchId: string, onCount: (n: number) => void) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .onSnapshot((snap) => onCount(snap.size));
}

export async function addPlayerToMatchRoster(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  playerName: string;
  number?: string;
  position?: string;
  role?: MatchRole;
  attendance?: AttendanceStatus;
  sourceTeamId?: string | null;
}) {
  const {
    teamId,
    matchId,
    playerId,
    playerName,
    number = '',
    position = '',
    role = 'bench',
    attendance = 'present',
    sourceTeamId = null,
  } = params;

  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId);
  const rosterRef = matchRef.collection(COL.roster).doc(playerId);

  // v0.3: transaction so rosterCount only increments if this is a NEW roster row
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(rosterRef);

    tx.set(
      rosterRef,
      {
        playerId,
        playerName: norm(playerName),
        playerNameLower: norm(playerName).toLowerCase(),
        number: norm(number),
        position: norm(position),
        role,
        attendance,
        sourceTeamId,
        addedAt: existing.exists ? existing.data()?.addedAt ?? serverTimestamp() : serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if (!existing.exists) {
      tx.set(
        matchRef,
        {
          rosterCount: firestore.FieldValue.increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

export async function removePlayerFromMatchRoster(teamId: string, matchId: string, playerId: string) {
  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId);
  const rosterRef = matchRef.collection(COL.roster).doc(playerId);

  // v0.3: transaction so rosterCount only decrements if the row existed
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(rosterRef);
    if (!existing.exists) return;

    tx.delete(rosterRef);
    tx.set(
      matchRef,
      {
        rosterCount: firestore.FieldValue.increment(-1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** Role selector (starter/bench) for a match player */
export async function setMatchPlayerRole(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  role: MatchRole;
}) {
  const { teamId, matchId, playerId, role } = params;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .doc(playerId);

  await ref.set({ role, updatedAt: serverTimestamp() }, { merge: true });
}

/** Attendance status (present/injured/absent) for a match player */
export async function setMatchPlayerAttendance(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  attendance: AttendanceStatus;
}) {
  const { teamId, matchId, playerId, attendance } = params;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .doc(playerId);

  await ref.set({ attendance, updatedAt: serverTimestamp() }, { merge: true });
}

/** Edit player number & position inside the match roster row (optional) */
export async function updateMatchRosterPlayerMeta(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  number?: string;
  position?: string;
}) {
  const { teamId, matchId, playerId, number, position } = params;

  const patch: any = { updatedAt: serverTimestamp() };
  if (number != null) patch.number = norm(number);
  if (position != null) patch.position = norm(position);

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .doc(playerId);

  await ref.set(patch, { merge: true });
}

/** Mark match as live */
export async function startMatch(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      status: 'live' as MatchStatus,
      liveStartedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/** End match (completed) */
export async function endMatch(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      status: 'completed' as MatchStatus,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/** Adjust score with +1 / -1 */
export async function adjustScore(params: {
  teamId: string;
  matchId: string;
  field: 'homeScore' | 'awayScore';
  delta: number;
}) {
  const { teamId, matchId, field, delta } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      [field]: firestore.FieldValue.increment(delta),
      updatedAt: serverTimestamp(),
    });
}
export async function recomputeMatchRosterCount(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId);
  const rosterSnap = await matchRef.collection(COL.roster).get();

  await matchRef.set(
    {
      rosterCount: rosterSnap.size,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

