import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import firestore from '@react-native-firebase/firestore';

export type MatchStatus = 'scheduled' | 'live' | 'completed';
export type MatchRole = 'starter' | 'bench';
export type AttendanceStatus = 'present' | 'injured' | 'absent';

// ===== Match events (v0.4: Game stats foundation) =====
export type MatchEventType = 'goal' | 'card';
export type CardColor = 'yellow' | 'red';
export type GoalSide = 'home' | 'away';

export type MatchEvent = {
  id: string;
  type: MatchEventType;
  minute: number; // 0..999
  side: GoalSide;
  // goal
  scorerId?: string;
  scorerName?: string;
  assistId?: string;
  assistName?: string;

  // card
  playerId?: string;
  playerName?: string;
  color?: CardColor;

  createdAt?: any;
  updatedAt?: any;
};

function norm(s: string) {
  return (s || '').trim();
}

function clampMinute(v: any): number {
  const n = parseInt(String(v ?? '').trim(), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, n));
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
    homeScore: 0,
    awayScore: 0,
    isDeleted: false,

    // v0.3: cached count (updated via add/remove roster transactions)
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

// ===== Match roster (players for this match) =====
// teams/{teamId}/matches/{matchId}/roster/{playerId}

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

  // Transaction so rosterCount only increments if this is a NEW roster row
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

  // Transaction so rosterCount only decrements if the row existed
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

// ===== Match events (v0.4) =====

export function listenMatchEvents(teamId: string, matchId: string, onData: (rows: MatchEvent[]) => void) {
  // NOTE:
  // We intentionally order by just `minute` to avoid requiring a composite index
  // (minute + createdAt). If you later want deterministic ordering for same-minute
  // events, we do a small client-side sort.
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.events)
    .orderBy('minute', 'asc')
    .onSnapshot(
      (snap) => {
        if (!snap) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchEvent[];
        rows.sort((a: any, b: any) => {
          const as = a?.createdAt?.seconds ?? 0;
          const bs = b?.createdAt?.seconds ?? 0;
          return as - bs;
        });
        onData(rows);
      },
      (err) => {
        console.log('[matchService] listenMatchEvents error:', err);
        onData([]);
      }
    );
}

export async function addMatchEvent(params: {
  teamId: string;
  matchId: string;
  event: Omit<MatchEvent, 'id' | 'createdAt' | 'updatedAt'>;
}) {
  const { teamId, matchId, event } = params;

  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId);
  const eventRef = matchRef.collection(COL.events).doc();

  const minute = clampMinute((event as any).minute);

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    const match = matchSnap.exists ? (matchSnap.data() as any) : {};

    // Write event
    tx.set(eventRef, {
      ...event,
      minute,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // If it's a goal, update cached scores
    if (event.type === 'goal') {
      const side = (event.side || 'home') as GoalSide;
      if (side === 'home') {
        tx.set(matchRef, { homeScore: firestore.FieldValue.increment(1) }, { merge: true });
      } else {
        tx.set(matchRef, { awayScore: firestore.FieldValue.increment(1) }, { merge: true });
      }

      // Optional: auto-start match when first goal is recorded
      const st = String(match?.status || 'scheduled');
      if (st === 'scheduled') {
        tx.set(matchRef, { status: 'live', startedAt: serverTimestamp() }, { merge: true });
      }
    }

    tx.set(matchRef, { updatedAt: serverTimestamp() }, { merge: true });
  });

  return eventRef.id;
}


export async function updateMatchEvent(params: {
  teamId: string;
  matchId: string;
  eventId: string;
  patch: Partial<Omit<MatchEvent, 'id' | 'createdAt' | 'updatedAt'>>;
}) {
  const { teamId, matchId, eventId, patch } = params;
  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.events)
    .doc(eventId);

  const next: any = { ...patch, updatedAt: serverTimestamp() };
  if (patch.minute != null) next.minute = clampMinute(patch.minute);
  await ref.set(next, { merge: true });
}

export async function deleteMatchEvent(params: { teamId: string; matchId: string; eventId: string }) {
  const { teamId, matchId, eventId } = params;

  const matchRef = db.collection(COL.teams).doc(teamId).collection(COL.matches).doc(matchId);
  const eventRef = matchRef.collection(COL.events).doc(eventId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) return;

    const ev = snap.data() as any;

    // If it's a goal, decrement cached score
    if (ev?.type === 'goal') {
      const side = (ev.side || 'home') as GoalSide;
      if (side === 'home') {
        tx.set(matchRef, { homeScore: firestore.FieldValue.increment(-1) }, { merge: true });
      } else {
        tx.set(matchRef, { awayScore: firestore.FieldValue.increment(-1) }, { merge: true });
      }
    }

    tx.delete(eventRef);
    tx.set(matchRef, { updatedAt: serverTimestamp() }, { merge: true });
  });
}


// Convenience builders
export function buildGoalEvent(p: {
  minute?: string;
  side: 'home' | 'away';
  scorerId?: string;
  scorerName: string;
  assistId?: string;
  assistName?: string;
}): MatchEvent {
  return {
    type: 'goal',
    minute: p.minute || '',
    side: p.side,
    scorerId: p.scorerId || '',
    scorerName: p.scorerName || '',
    assistId: p.assistId || '',
    assistName: p.assistName || '',
  };
}


export function buildCardEvent(params: {
  minute: number | string;
  playerId: string;
  playerName: string;
  color: CardColor;
}): Omit<MatchEvent, 'id' | 'createdAt' | 'updatedAt'> {
  const minute = clampMinute(params.minute);
  return {
    type: 'card',
    minute,
    playerId: params.playerId,
    playerName: norm(params.playerName),
    color: params.color,
  };
}

/** Mark match as live (start game) */
export async function markMatchLive(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      status: 'live' as MatchStatus,
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/** Mark match as scheduled again (optional "undo start") */
export async function markMatchScheduled(params: { teamId: string; matchId: string }) {
  const { teamId, matchId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .update({
      status: 'scheduled' as MatchStatus,
      updatedAt: serverTimestamp(),
    });
}
