import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type TeamRole = 'coach' | 'assistant' | 'parent';
export type MemberStatus = 'active' | 'invited' | 'accepted';

function norm(s: string) {
  return (s || '').trim();
}
function normLower(s: string) {
  return norm(s).toLowerCase();
}

export async function createTeam(params: {
  name: string;
  ageGroup?: string;
  season?: string;
  createdBy: string; // uid
}) {
  const { name, ageGroup = '', season = '', createdBy } = params;

  if (!name.trim()) throw new Error('Team name is required');

  const teamRef = db.collection(COL.teams).doc();

  await db.runTransaction(async (tx) => {
    tx.set(teamRef, {
      name: name.trim(),
      nameLower: name.trim().toLowerCase(),
      ageGroup,
      season,
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      activeSeasonId: null,
      isDeleted: false,
    });

    const memberRef = teamRef.collection(COL.members).doc(createdBy);
    tx.set(memberRef, {
      role: 'coach' as TeamRole,
      status: 'active' as MemberStatus,
      joinedAt: serverTimestamp(),
    });

    const userTeamRef = db
      .collection(COL.users)
      .doc(createdBy)
      .collection(COL.teamRefs)
      .doc(teamRef.id);

    tx.set(userTeamRef, {
      teamId: teamRef.id,
      role: 'coach' as TeamRole,
      status: 'active' as MemberStatus,
      joinedAt: serverTimestamp(),
      teamName: name.trim(), // convenience for list
      teamNameLower: name.trim().toLowerCase(),
      isDeleted: false,
    });
  });

  return teamRef.id;
}

export function listenMyTeams(uid: string | null | undefined, onData: (teams: any[]) => void) {
  // If user isn't ready/logged in yet, don't attach a listener
  if (!uid) {
    onData([]);
    return () => {};
  }

  return db
    .collection(COL.users)
    .doc(uid)
    .collection(COL.teamRefs)
    .orderBy('joinedAt', 'desc')
    .onSnapshot(
      (snap) => {
        // RNFB can sometimes call this with null if an error occurs
        if (!snap) {
          onData([]);
          return;
        }

        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onData(rows);
      },
      (err) => {
        console.log('[listenMyTeams] onSnapshot error:', err);
        onData([]);
      }
    );
}



/**
 * v0.3: Edit team name.
 * Updates teams/{teamId} and also updates users/{uid}/teamRefs/{teamId}.teamName for all members (best effort).
 */
export async function updateTeamName(params: {
  teamId: string;
  newName: string;
  updatedBy: string; // uid
}) {
  const { teamId, newName, updatedBy } = params;

  const name = norm(newName);
  if (!name) throw new Error('Team name is required');

  const teamRef = db.collection(COL.teams).doc(teamId);

  // Update team doc
  await teamRef.update({
    name,
    nameLower: name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });

  // Best-effort: update each member's teamRef convenience name
  const membersSnap = await teamRef.collection(COL.members).get();
  const batch = db.batch();

  membersSnap.docs.forEach((m) => {
    const uid = m.id;
    const userTeamRef = db.collection(COL.users).doc(uid).collection(COL.teamRefs).doc(teamId);
    batch.set(
      userTeamRef,
      {
        teamName: name,
        teamNameLower: name.toLowerCase(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();
}

/**
 * v0.3: Soft delete team with confirmation in UI.
 * Sets teams/{teamId}.isDeleted=true and updates all user teamRefs as well (best effort).
 */
export async function softDeleteTeam(params: {
  teamId: string;
  deletedBy: string; // uid
}) {
  const { teamId, deletedBy } = params;

  const teamRef = db.collection(COL.teams).doc(teamId);

  await teamRef.update({
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy,
    updatedAt: serverTimestamp(),
    updatedBy: deletedBy,
  });

  const membersSnap = await teamRef.collection(COL.members).get();
  const batch = db.batch();

  membersSnap.docs.forEach((m) => {
    const uid = m.id;
    const userTeamRef = db.collection(COL.users).doc(uid).collection(COL.teamRefs).doc(teamId);
    batch.set(
      userTeamRef,
      {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy,
      },
      { merge: true }
    );
  });

  await batch.commit();
}

/**
 * v0.3: Invite additional coach/assistant/parent by email.
 * Creates an invite doc in teams/{teamId}/members/{autoId}
 * (Later, acceptTeamInvitesForUser converts invite to a real member uid.)
 */
export async function inviteCoach(params: {
  teamId: string;
  inviteEmail: string;
  invitedBy: string; // uid
  role?: TeamRole; // default assistant
}) {
  const { teamId, inviteEmail, invitedBy, role = 'assistant' } = params;

  const emailLower = normLower(inviteEmail);
  if (!emailLower || !emailLower.includes('@')) throw new Error('Valid email is required');

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.members)
    .add({
      role,
      status: 'invited' as MemberStatus,
      invitedEmail: emailLower,
      invitedEmailLower: emailLower,
      invitedAt: serverTimestamp(),
      invitedBy,
    });
}

/**
 * v0.3: Accept pending invites for a signed-in user email.
 * Call once after login (or on app start) to auto-attach teams.
 *
 * It:
 * - finds invite docs where invitedEmailLower == user email
 * - creates teams/{teamId}/members/{uid}
 * - creates users/{uid}/teamRefs/{teamId}
 * - marks invite as accepted
 */
export async function acceptTeamInvitesForUser(params: {
  uid: string;
  email: string;
}) {
  const { uid, email } = params;
  const emailLower = normLower(email);
  if (!emailLower) return;

  const invitesSnap = await db
    .collectionGroup(COL.members)
    .where('invitedEmailLower', '==', emailLower)
    .where('status', '==', 'invited')
    .get();

  if (invitesSnap.empty) return;

  for (const inviteDoc of invitesSnap.docs) {
    const inviteData: any = inviteDoc.data();
    const role: TeamRole = inviteData.role || 'assistant';

    // invite path: teams/{teamId}/members/{inviteId}
    const membersColRef = inviteDoc.ref.parent; // .../members
    const teamRef = membersColRef.parent;       // .../teams/{teamId}
    if (!teamRef) continue;

    const teamId = teamRef.id;

    const teamSnap = await teamRef.get();
    const teamData: any = teamSnap.exists ? teamSnap.data() : {};
    const teamName = teamData?.name || 'Team';

    const batch = db.batch();

    // member doc by uid
    const memberRef = teamRef.collection(COL.members).doc(uid);
    batch.set(
      memberRef,
      {
        role,
        status: 'active' as MemberStatus,
        joinedAt: serverTimestamp(),
        invitedEmailLower: emailLower,
      },
      { merge: true }
    );

    // user teamRef doc
    const userTeamRef = db.collection(COL.users).doc(uid).collection(COL.teamRefs).doc(teamId);
    batch.set(
      userTeamRef,
      {
        teamId,
        role,
        status: 'active' as MemberStatus,
        joinedAt: serverTimestamp(),
        teamName,
        teamNameLower: String(teamName).toLowerCase(),
        isDeleted: !!teamData?.isDeleted,
      },
      { merge: true }
    );

    // mark invite accepted
    batch.set(
      inviteDoc.ref,
      {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        acceptedBy: uid,
      },
      { merge: true }
    );

    await batch.commit();
  }
}
