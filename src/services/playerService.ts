import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';


export type PlayerCreate = {
  name: string;
  number?: string;   // keep string for now (easy UI)
  position?: string;
  createdBy: string; // uid
};

export type MembershipType = 'regular' | 'callup' | 'trial';
export type MembershipStatus = 'active' | 'inactive';

export async function createGlobalPlayer(p: PlayerCreate & { clubId?: string }) {
  const name = p.name.trim();
  if (!name) throw new Error('Player name is required');

  // Prefer club-scoped registry when clubId is available
  const collection = p.clubId
    ? db.collection(COL.clubs).doc(p.clubId).collection(COL.clubPlayers)
    : db.collection(COL.players);

  const playerRef = collection.doc();
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
// If clubId is provided, searches club-scoped registry; otherwise global players
export function listenPlayerSearch(
  q: string,
  onData: (rows: any[]) => void,
  clubId?: string,
) {
  const query = q.trim().toLowerCase();
  if (!query) {
    onData([]);
    return () => {};
  }

  const collection = clubId
    ? db.collection(COL.clubs).doc(clubId).collection(COL.clubPlayers)
    : db.collection(COL.players);

  return collection
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
  number?: string;     // optional: only update if provided
  position?: string;   // optional: only update if provided
  type?: MembershipType;
  status?: MembershipStatus; // defaults to 'active'
  seasonId?: string;   // optional: links membership to a specific season
}) {
  const {
    teamId,
    playerId,
    playerName,
    number,
    position,
    type = 'regular',
    status = 'active',
    seasonId,
  } = params;

  const memRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .doc(playerId); // docId == playerId

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(memRef);
    const existing = snap.exists ? (snap.data() as any) : null;
    const now = serverTimestamp();

    if (!snap.exists) {
      tx.set(memRef, {
        playerId,
        playerName,
        ...(number !== undefined ? { number } : {}),
        ...(position !== undefined ? { position } : {}),
        type,
        status,
        startDate: now,
        endDate: null,
        createdAt: now,
        updatedAt: now,
        ...(seasonId !== undefined ? { seasonId } : {}),
      });
      return;
    }

    tx.set(
      memRef,
      {
        playerName,
        ...(number !== undefined ? { number } : {}),
        ...(position !== undefined ? { position } : {}),
        type,
        status,
        endDate: null,
        updatedAt: now,

        // Safety: older docs might be missing these
        ...(existing?.createdAt ? {} : { createdAt: now }),
        ...(existing?.startDate ? {} : { startDate: now }),

        ...(seasonId !== undefined ? { seasonId } : {}),
      },
      { merge: true }
    );
  });
}

export function listenTeamMemberships(
  teamId: string,
  onData: (rows: any[]) => void,
  options?: { seasonId?: string },
) {
  const query: any = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .where('status', '==', 'active')
    .orderBy('createdAt', 'desc');

  return query.onSnapshot(
    (snap: any) => {
      let rows = (snap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() }));
      // Filter by season client-side to avoid composite index and timing issues
      if (options?.seasonId) {
        rows = rows.filter((r: any) => r.seasonId === options.seasonId);
      }
      onData(rows);
    },
    (err: any) => {
      console.log('[memberships] ERROR:', err);
      onData([]);
    },
  );
}

export async function updateTeamMembership(params: {
  teamId: string;
  membershipId: string; // this is playerId (doc id)
  playerName: string;
  number: string;
  position: string;
  avatarUrl?: string; // optional — only updated when provided
  status?: MembershipStatus; // optional — toggle active/inactive
}) {
  const { teamId, membershipId, playerName, number, position, avatarUrl, status } = params;

  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships) // ✅ correct
    .doc(membershipId);

  const patch: any = {
    playerName: playerName.trim(),
    number: number.trim(),
    position: position.trim(),
    updatedAt: serverTimestamp(),
  };
  if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl;
  if (status !== undefined) patch.status = status;

  await ref.set(patch, { merge: true });
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

export function listenTeamRoster(teamId: string, onData: (rows: any[]) => void) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .where('status', '==', 'active')
    .onSnapshot(
      (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.log('[listenTeamRoster] ERROR:', err);
        onData([]);
      }
    );
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

export async function removePlayerFromTeam(params: {
  teamId: string;
  playerId: string;
}) {
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

export async function restorePlayerToTeam(params: {
  teamId: string;
  playerId: string;
}) {
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
