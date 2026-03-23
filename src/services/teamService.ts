import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import { getOrCreateClubForUser } from './clubService';

export type TeamRole = 'coach' | 'assistant' | 'parent';
export type MemberStatus = 'active' | 'invited';

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
  createdByEmail?: string;
  createdByName?: string;
}) {
  const { name, ageGroup = '', season = '', createdBy, createdByEmail = '', createdByName = '' } = params;

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

  const teamId = teamRef.id;

  // Link team to club (best effort — does not block team creation)
  try {
    const clubId = await getOrCreateClubForUser({
      uid: createdBy,
      email: createdByEmail,
      displayName: createdByName || 'Coach',
    });

    // Store clubId on the team doc
    await teamRef.update({ clubId });

    // Add teamId to the owner's member doc in the club
    const memberDocRef = db
      .collection('clubs')
      .doc(clubId)
      .collection('members')
      .doc(createdBy);

    const memberSnap = await memberDocRef.get();
    if (memberSnap.exists) {
      const existing = (memberSnap.data() as any)?.teamIds ?? [];
      if (!existing.includes(teamId)) {
        await memberDocRef.update({ teamIds: [...existing, teamId] });
      }
    }
  } catch (_e) {
    // Non-fatal: club linkage failed, team was still created
  }

  return teamId;
}

export function listenMyTeams(uid: string, onData: (teams: any[]) => void) {
  return db
    .collection(COL.users)
    .doc(uid)
    .collection(COL.teamRefs)
    .orderBy('joinedAt', 'desc')
    .onSnapshot((snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Optionally filter deleted locally if you want:
      // const active = rows.filter((r) => !r.isDeleted);
      onData(rows);
    });
}

/**
 * Edit team name.
 * Updates:
 * - teams/{teamId}.name + nameLower + updatedAt/updatedBy
 * - users/{memberUid}/teamRefs/{teamId}.teamName (+Lower) for all members (best effort)
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

  // 1) Update team doc
  await teamRef.update({
    name,
    nameLower: name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy,
  });

  // 2) Best-effort: update teamName on every member's user teamRef
  const membersSnap = await teamRef.collection(COL.members).get();
  const batch = db.batch();

  membersSnap.docs.forEach((m) => {
    const memberUid = m.id;
    const userTeamRef = db
      .collection(COL.users)
      .doc(memberUid)
      .collection(COL.teamRefs)
      .doc(teamId);

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
 * Soft delete team (recommended).
 * Updates:
 * - teams/{teamId}.isDeleted = true + deletedAt/deletedBy
 * - users/{memberUid}/teamRefs/{teamId}.isDeleted = true (best effort)
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
    const memberUid = m.id;
    const userTeamRef = db
      .collection(COL.users)
      .doc(memberUid)
      .collection(COL.teamRefs)
      .doc(teamId);

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
 * Listen to all member docs under a team (coaches, assistants, invites).
 */
export function listenTeamMembers(
  teamId: string,
  onData: (members: any[]) => void,
) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.members)
    .onSnapshot((snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
}

/**
 * Invite an additional coach/assistant by email.
 * Creates a member invite doc under teams/{teamId}/members/{autoId}
 * (We use autoId so it supports multiple invites without collisions.)
 */
export async function inviteCoach(params: {
  teamId: string;
  inviteEmail: string;
  invitedBy: string; // uid
  role?: TeamRole; // default 'assistant'
}) {
  const { teamId, inviteEmail, invitedBy, role = 'assistant' } = params;

  const emailLower = normLower(inviteEmail);
  if (!emailLower || !emailLower.includes('@')) throw new Error('Valid email is required');

  const teamRef = db.collection(COL.teams).doc(teamId);

  await teamRef.collection(COL.members).add({
    role,
    status: 'invited' as MemberStatus,
    invitedEmail: emailLower,
    invitedEmailLower: emailLower,
    invitedAt: serverTimestamp(),
    invitedBy,
  });
}

/**
 * Invite a parent by email, linked to a specific player on the roster.
 * Creates a member invite doc under teams/{teamId}/members/{autoId}.
 * linkedPlayerId is the playerMembership doc id (same as playerId in roster).
 */
export async function inviteParent(params: {
  teamId: string;
  inviteEmail: string;
  invitedBy: string; // uid
  linkedPlayerId: string;
  linkedPlayerName: string;
}) {
  const { teamId, inviteEmail, invitedBy, linkedPlayerId, linkedPlayerName } = params;

  const emailLower = normLower(inviteEmail);
  if (!emailLower || !emailLower.includes('@')) throw new Error('Valid email is required');
  if (!linkedPlayerId) throw new Error('A player must be selected to link this parent invite');

  const teamRef = db.collection(COL.teams).doc(teamId);

  // Fetch team name for the email
  const teamSnap = await teamRef.get();
  const teamName = (teamSnap.data() as any)?.name || 'your child\'s team';

  // 1) Create the invite doc
  await teamRef.collection(COL.members).add({
    role: 'parent' as TeamRole,
    status: 'invited' as MemberStatus,
    invitedEmail: emailLower,
    invitedEmailLower: emailLower,
    invitedAt: serverTimestamp(),
    invitedBy,
    linkedPlayerId,
    linkedPlayerName,
  });

  // 2) Write to the `mail` collection — picked up by the Trigger Email extension
  await db.collection('mail').add({
    to: [emailLower],
    message: {
      subject: `You've been invited to follow ${linkedPlayerName} on Formavo`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px;">
            You're invited to Formavo 👋
          </h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            You've been added as a parent/guardian for <strong>${linkedPlayerName}</strong>
            on <strong>${teamName}</strong>.
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Download the Formavo app and sign up with this email address
            (<strong>${emailLower}</strong>) to:
          </p>
          <ul style="color: #374151; font-size: 15px; line-height: 2;">
            <li>See upcoming match schedules</li>
            <li>Confirm attendance for each match</li>
            <li>View match results and player stats</li>
          </ul>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 32px;">
            This invite was sent by the coaching staff of ${teamName}.
          </p>
        </div>
      `,
      text: `You've been invited to Formavo!\n\nYou've been added as a parent/guardian for ${linkedPlayerName} on ${teamName}.\n\nDownload the Formavo app and sign up with this email address (${emailLower}) to see match schedules, confirm attendance, and view results.\n\nThis invite was sent by the coaching staff of ${teamName}.`,
    },
  });
}

/**
 * Resend a parent invite email without creating a new invite doc.
 */
export async function resendParentInvite(params: {
  teamId: string;
  inviteEmail: string;
  linkedPlayerName: string;
}) {
  const { teamId, inviteEmail, linkedPlayerName } = params;
  const emailLower = normLower(inviteEmail);

  const teamSnap = await db.collection(COL.teams).doc(teamId).get();
  const teamName = (teamSnap.data() as any)?.name || 'your child\'s team';

  await db.collection('mail').add({
    to: [emailLower],
    message: {
      subject: `Reminder: You've been invited to follow ${linkedPlayerName} on Formavo`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px;">
            Reminder: You're invited to Formavo 👋
          </h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            You've been added as a parent/guardian for <strong>${linkedPlayerName}</strong>
            on <strong>${teamName}</strong>.
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Download the Formavo app and sign up with this email address
            (<strong>${emailLower}</strong>) to:
          </p>
          <ul style="color: #374151; font-size: 15px; line-height: 2;">
            <li>See upcoming match schedules</li>
            <li>Confirm attendance for each match</li>
            <li>View match results and player stats</li>
          </ul>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 32px;">
            This invite was sent by the coaching staff of ${teamName}.
          </p>
        </div>
      `,
      text: `Reminder: You've been invited to Formavo!\n\nYou've been added as a parent/guardian for ${linkedPlayerName} on ${teamName}.\n\nDownload the Formavo app and sign up with this email address (${emailLower}) to see match schedules, confirm attendance, and view results.\n\nThis invite was sent by the coaching staff of ${teamName}.`,
    },
  });
}

/**
 * Accept any pending invites for the signed-in user email.
 * Uses collectionGroup on COL.members, so this works across all teams.
 *
 * This:
 * - creates/merges teams/{teamId}/members/{uid} as active
 * - creates/merges users/{uid}/teamRefs/{teamId}
 * - marks invite doc as accepted
 */
export async function acceptTeamInvitesForUser(params: {
  uid: string;
  email: string;
}) {
  const { uid, email } = params;
  const emailLower = normLower(email);
  if (!emailLower) return;

  // Find invite docs anywhere: */members/* where invitedEmailLower == emailLower and status == invited
  const invitesSnap = await db
    .collectionGroup(COL.members)
    .where('invitedEmailLower', '==', emailLower)
    .where('status', '==', 'invited')
    .get();

  if (invitesSnap.empty) return;

  // For each invite doc, we need the teamId (parent path: teams/{teamId}/members/{inviteId})
  for (const inviteDoc of invitesSnap.docs) {
    const inviteData: any = inviteDoc.data();
    const role: TeamRole = inviteData.role || 'assistant';

    // Propagate parent-player link fields if present
    const parentFields =
      role === 'parent'
        ? {
            linkedPlayerId: inviteData.linkedPlayerId || '',
            linkedPlayerName: inviteData.linkedPlayerName || '',
          }
        : {};

    const membersColRef = inviteDoc.ref.parent; // .../members
    const teamRef = membersColRef.parent;       // .../teams/{teamId}
    if (!teamRef) continue;

    const teamId = teamRef.id;

    // Read team name for convenience (best effort)
    const teamSnap = await teamRef.get();
    const teamData: any = teamSnap.exists ? teamSnap.data() : {};
    const teamName = teamData?.name || 'Team';

    const batch = db.batch();

    // 1) Member doc keyed by uid
    const memberRef = teamRef.collection(COL.members).doc(uid);
    batch.set(
      memberRef,
      {
        role,
        status: 'active' as MemberStatus,
        joinedAt: serverTimestamp(),
        invitedEmailLower: emailLower,
        ...parentFields,
      },
      { merge: true }
    );

    // 2) User teamRefs doc
    const userTeamRef = db
      .collection(COL.users)
      .doc(uid)
      .collection(COL.teamRefs)
      .doc(teamId);

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
        ...parentFields,
      },
      { merge: true }
    );

    // 3) Mark invite doc accepted
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
