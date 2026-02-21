import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type PlayerCreate = {
  name: string;
  number?: string; // keep string for now (easy UI)
  position?: string;
  createdBy: string; // uid
};

export type MembershipType = 'regular' | 'callup' | 'trial';
export type MembershipStatus = 'active' | 'inactive';

function safeLower(s: any) {
  return String(s || '').toLowerCase();
}

export function sortMembershipsByNumber(rows: any[]) {
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

export async function createGlobalPlayer(p: PlayerCreate) {
  const name = p.name.trim();
  if (!name) throw new Error('Player name is required');

  const playerRef = db.collection(COL.players).doc();
  const nameLower = name.toLowerCase();

  await playerRef.set({
    name,
    nameLower,
    number: (p.number || '').trim(),
    position: (p.position || '').trim(),
    createdBy: p.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return playerRef.id;
}

// Prefix search by nameLower using startAt/endAt
export function listenPlayerSearch(q: string, onData: (rows: any[]) => void) {
  const query = q.trim().toLowerCase();
  if (!query) {
    onData([]);
    return () => {};
  }

  return db
    .collection(COL.players)
    .orderBy('nameLower')
    .startAt(query)
    .endAt(query + '\uf8ff')
    .limit(20)
    .onSnapshot(
      (snap) => {
        onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.log('[listenPlayerSearch] ERROR:', err);
        onData([]);
      }
    );
}

export async function addPlayerToTeam(params: {
  teamId: string;
  playerId: string;
  playerName: string;
  number?: string; // optional: only update if provided
  position?: string; // optional: only update if provided
  type?: MembershipType;
  status?: MembershipStatus; // defaults to 'active'
}) {
  const {
    teamId,
    playerId,
    playerName,
    number,
    position,
    type = 'regular',
    status = 'active',
  } = params;

  const memRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .doc(playerId); // docId == playerId

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(memRef);
    const now = serverTimestamp();

    if (!snap.exists) {
      tx.set(memRef, {
        playerId,
        playerName,
        playerNameLower: String(playerName || '').toLowerCase(),
        ...(number !== undefined ? { number: String(number || '').trim() } : {}),
        ...(position !== undefined ? { position: String(position || '').trim() } : {}),
        type,
        status,
        startDate: now,
        endDate: null,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    tx.set(
      memRef,
      {
        playerName,
        playerNameLower: String(playerName || '').toLowerCase(),
        ...(number !== undefined ? { number: String(number || '').trim() } : {}),
        ...(position !== undefined ? { position: String(position || '').trim() } : {}),
        type,
        status,
        endDate: null,
        updatedAt: now,
      },
      { merge: true }
    );
  });
}

/**
 * v0.3: edit player number & position (TEAM roster)
 */
export async function updateTeamMembershipMeta(params: {
  teamId: string;
  playerId: string;
  number?: string;
  position?: string;
}) {
  const { teamId, playerId, number, position } = params;

  const memRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .doc(playerId);

  const patch: any = { updatedAt: serverTimestamp() };
  if (number != null) patch.number = String(number || '').trim();
  if (position != null) patch.position = String(position || '').trim();

  await memRef.set(patch, { merge: true });
}

/**
 * Listen to team roster (playerMemberships) by status.
 * Backward compatible:
 * - old usage: listenTeamMemberships(teamId, onData)
 * - new usage: listenTeamMemberships(teamId, onData, 'inactive')
 */
export function listenTeamMemberships(
  teamId: string,
  onData: (rows: any[]) => void,
  status: MembershipStatus = 'active'
) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .where('status', '==', status)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snap) => {
        const rows = (snap?.docs ?? []).map((d) => ({ id: d.id, ...d.data() }));
        onData(rows);
      },
      (err) => {
        console.log('[listenTeamMemberships] ERROR:', err);
        onData([]);
      }
    );
}

export function listenMyTeamRefs(uid: string, onData: (rows: any[]) => void) {
  return db
    .collection(COL.users)
    .doc(uid)
    .collection(COL.teamRefs)
    .orderBy('joinedAt', 'desc')
    .onSnapshot(
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.log('[listenMyTeamRefs] ERROR:', err);
        onData([]);
      }
    );
}

// Keep this export for compatibility with any older imports you might have
export function listenTeamRoster(teamId: string, onData: (rows: any[]) => void) {
  return listenTeamMemberships(teamId, onData, 'active');
}

export async function addCallupToTeam(params: {
  teamId: string;
  playerId: string;
  playerName: string;
  number?: string;
  position?: string;
  sourceTeamId: string;
  sourceTeamName?: string;
}) {
  return addPlayerToTeam({
    teamId: params.teamId,
    playerId: params.playerId,
    playerName: params.playerName,
    number: params.number || '',
    position: params.position || '',
    type: 'callup',
    status: 'active',
  });
}

export async function removePlayerFromTeam(params: { teamId: string; playerId: string }) {
  const { teamId, playerId } = params;

  const memRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .doc(playerId);

  await memRef.set(
    {
      status: 'inactive' as MembershipStatus,
      endDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function restorePlayerToTeam(params: { teamId: string; playerId: string }) {
  const { teamId, playerId } = params;

  const memRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .doc(playerId);

  await memRef.set(
    {
      status: 'active' as MembershipStatus,
      endDate: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
