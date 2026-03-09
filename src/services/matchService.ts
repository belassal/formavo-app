import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import firestore from '@react-native-firebase/firestore';

export type MatchStatus = 'scheduled' | 'live' | 'completed';
export type MatchRole = 'starter' | 'bench';
export type AttendanceStatus = 'present' | 'injured' | 'absent';
import type { MatchEvent, MatchEventType, CardColor, GoalSide } from '../models/matchEvent';

function norm(s: string) {
  return (s || '').trim();
}

function clampMinute(v: any): number {
  const n = parseInt(String(v ?? '').trim(), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, n));
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = (obj as any)[k];
    if (v !== undefined) out[k] = v;
  });
  return out;
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

  // remove undefined fields (Firestore doesn't allow them)
  const cleanEvent = stripUndefined(event as any);

  await db.runTransaction(async (tx) => {
    const matchSnap = await tx.get(matchRef);
    const match = matchSnap.exists ? (matchSnap.data() as any) : {};

    // ✅ Write event (ONLY cleanEvent)
    tx.set(eventRef, {
      ...cleanEvent,
      minute, // force numeric minute
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // If it's a goal, update cached scores
    if (cleanEvent.type === 'goal') {
      const side = ((cleanEvent as any).side || 'home') as GoalSide;

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

  const cleanPatch: any = stripUndefined({ ...patch, updatedAt: serverTimestamp() });
  if (patch.minute != null) cleanPatch.minute = clampMinute(patch.minute);

  await ref.set(cleanPatch, { merge: true });
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

// ===== Game Day Pitch slot assignment =====
// teams/{teamId}/matches/{matchId}/roster/{playerId} => { slotKey?: string }

export async function setMatchRosterSlotKey(opts: {
  teamId: string;
  matchId: string;
  playerId: string; // roster doc id (we use playerId as doc id)
  slotKey: string | null; // null = clear assignment
}) {
  const { teamId, matchId, playerId, slotKey } = opts;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .doc(playerId);

  if (slotKey) {
    await ref.set({ slotKey, updatedAt: serverTimestamp() }, { merge: true });
  } else {
    // IMPORTANT: use Firestore FieldValue.delete()
    await ref.set({ slotKey: firestore.FieldValue.delete(), updatedAt: serverTimestamp() }, { merge: true });
  }
}


// Convenience builders
export function buildGoalEvent(p: {
  minute: number | string;
  side: GoalSide;
  scorerId?: string;
  scorerName: string;
  assistId?: string;
  assistName?: string;
  pos?: { x: number; y: number };
  assistPos?: { x: number; y: number };
}): Omit<MatchEvent, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    type: 'goal',
    minute: clampMinute(p.minute),
    side: p.side,
    pos: p.pos,
    assistPos: p.assistPos,
    scorerId: p.scorerId || '',
    scorerName: p.scorerName || '',
    assistId: p.assistId || '',
    assistName: p.assistName || '',
  };
}

export function buildCardEvent(p: {
  minute: number | string;
  playerId: string;
  playerName: string;
  cardColor: CardColor;
  pos?: { x: number; y: number };
}): Omit<MatchEvent, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    type: 'card',
    minute: clampMinute(p.minute),
    playerId: p.playerId,
    playerName: norm(p.playerName),
    cardColor: p.cardColor,
    pos: p.pos,
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

// NOTE: assignOrSwapMatchSlot was an incomplete stub and has been removed.
// Use swapOrMoveMatchSlot() below instead, which is the full implementation.
// The screen is responsible for resolving the occupantPlayerId before calling it.

export async function swapOrMoveMatchSlot(opts: {
  teamId: string;
  matchId: string;

  targetSlotKey: string;
  pickedPlayerId: string;

  occupantPlayerId: string | null;          // who is currently in target slot
  pickedPlayerOldSlotKey: string | null;    // picked player's previous slot
}) {
  const {
    teamId, matchId,
    targetSlotKey, pickedPlayerId,
    occupantPlayerId,
    pickedPlayerOldSlotKey,
  } = opts;

  const rosterCol = db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.roster);

  const pickedRef = rosterCol.doc(pickedPlayerId);
  const occupantRef = occupantPlayerId ? rosterCol.doc(occupantPlayerId) : null;

  await db.runTransaction(async (tx) => {
    // move picked into target
    tx.set(pickedRef, { slotKey: targetSlotKey, updatedAt: serverTimestamp() }, { merge: true });

    // if target had someone, put them into picked old slot OR clear them
    if (occupantRef) {
      if (pickedPlayerOldSlotKey) {
        tx.set(occupantRef, { slotKey: pickedPlayerOldSlotKey, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        tx.set(occupantRef, { slotKey: firestore.FieldValue.delete(), updatedAt: serverTimestamp() }, { merge: true });
      }
    }

    // if picked was in an old slot and we didn't swap with its occupant (because target was empty),
    // we should clear picked old slot occupant logic is already handled because picked doc moved.
  });
}

export async function clearMatchSlot(opts: {
  teamId: string;
  matchId: string;
  occupantPlayerId: string;
}) {
  const { teamId, matchId, occupantPlayerId } = opts;

  const ref = db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.roster).doc(occupantPlayerId);

  await ref.set({ slotKey: firestore.FieldValue.delete(), updatedAt: serverTimestamp() }, { merge: true });
}

export async function setMatchRosterPlayerPos(opts: {
  teamId: string;
  matchId: string;
  playerId: string;
  posX: number; // 0..1
  posY: number; // 0..1
}) {
  const { teamId, matchId, playerId, posX, posY } = opts;

  const ref = db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.roster).doc(playerId);

  await ref.set(
    {
      posX: Math.max(0, Math.min(1, posX)),
      posY: Math.max(0, Math.min(1, posY)),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}



/**
 * Persist a custom pitch slot position (relative 0..1).
 * Stored on the match doc as: slotPos.{slotKey} = {x,y}
 */
export async function setMatchSlotPos(opts: {
  teamId: string;
  matchId: string;
  slotKey: string;
  pos: { x: number; y: number };
}) {
  const { teamId, matchId, slotKey, pos } = opts;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId);

  const x = Math.max(0.04, Math.min(0.96, Number(pos?.x ?? 0.5)));
  const y = Math.max(0.04, Math.min(0.96, Number(pos?.y ?? 0.5)));

  await ref.set(
    {
      slotPos: {
        [slotKey]: { x, y },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
