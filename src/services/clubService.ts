import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type ClubRole = 'owner' | 'head_coach' | 'asst_coach' | 'staff';
export type ClubMemberStatus = 'active' | 'invited';

export type ClubMember = {
  id: string; // userId or inviteId
  role: ClubRole;
  status: ClubMemberStatus;
  displayName: string;
  email: string;
  photoUrl?: string;
  teamIds: string[]; // which teams assigned to
  joinedAt: any;
  invitedEmail?: string;
};

export type ClubPlanTier = 'trial' | 'starter' | 'pro';
export type ClubPlanStatus = 'active' | 'expired' | 'cancelled';

/** Billing entitlement, written only by Cloud Functions (approval today, billing webhook later). */
export type ClubPlan = {
  tier: ClubPlanTier;
  status: ClubPlanStatus;
  maxTeams?: number;
  startedAt?: any;
  expiresAt?: any;
};

export type Club = {
  id: string;
  name: string;
  logoUrl?: string;
  createdBy: string;
  createdAt: any;
  plan?: ClubPlan;
};

export function isClubPlanActive(club: Club | null | undefined): boolean {
  return club?.plan?.status === 'active';
}

export function canAddTeam(club: Club | null | undefined, currentTeamCount: number): boolean {
  if (!isClubPlanActive(club)) return false;
  const max = club?.plan?.maxTeams;
  return typeof max !== 'number' || currentTeamCount < max;
}

export type ClubRequestStatus = 'pending' | 'approved' | 'rejected';

export type ClubRequest = {
  id: string;
  uid: string;
  clubName: string;
  contactName: string;
  contactEmailLower: string;
  teamCount?: number;
  playerCount?: number;
  notes?: string;
  status: ClubRequestStatus;
  clubId?: string;
  createdAt: any;
};

/**
 * Files a request for a new club. The app owner approves it (status →
 * 'approved') and a Cloud Function provisions the club and emails the coach.
 */
export async function submitClubRequest(params: {
  uid: string;
  email: string;
  clubName: string;
  contactName: string;
  teamCount?: number;
  playerCount?: number;
  notes?: string;
}): Promise<string> {
  const { uid, email, clubName, contactName, teamCount, playerCount, notes } = params;
  const name = clubName.trim();
  if (!name) throw new Error('Club name is required');

  const ref = db.collection(COL.clubRequests).doc();
  await ref.set({
    uid,
    clubName: name,
    contactName: contactName.trim(),
    contactEmailLower: email.trim().toLowerCase(),
    ...(teamCount ? { teamCount } : {}),
    ...(playerCount ? { playerCount } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
    status: 'pending' as ClubRequestStatus,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Listens to the user's most recent club request (null when none). */
export function listenMyClubRequest(
  uid: string,
  onData: (request: ClubRequest | null) => void,
): () => void {
  return db
    .collection(COL.clubRequests)
    .where('uid', '==', uid)
    .onSnapshot(
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as ClubRequest);
        rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        onData(rows[0] ?? null);
      },
      (e) => {
        console.warn('[listenMyClubRequest] error:', e);
        onData(null);
      },
    );
}

/**
 * Tags all teams owned by a user with their clubId.
 * Safe to call multiple times — skips teams already tagged.
 */
export async function tagUserTeamsWithClubId(params: {
  uid: string;
  clubId: string;
}): Promise<void> {
  const { uid, clubId } = params;

  const teamRefsSnap = await db
    .collection(COL.users)
    .doc(uid)
    .collection(COL.teamRefs)
    .get();

  const batch = db.batch();

  await Promise.all(
    teamRefsSnap.docs.map(async (refDoc) => {
      const teamId = refDoc.id;
      const role = refDoc.data()?.role;
      // Only tag teams where user is a coach/owner, not parent
      if (role === 'parent') return;

      const teamDoc = await db.collection(COL.teams).doc(teamId).get();
      if (!teamDoc.exists) return;
      if (teamDoc.data()?.clubId) return; // already tagged

      batch.set(db.collection(COL.teams).doc(teamId), { clubId }, { merge: true });
    }),
  );

  await batch.commit();
}

/**
 * Listens to a single club doc.
 */
export function listenClub(
  clubId: string,
  onData: (club: Club | null) => void,
): () => void {
  return db
    .collection(COL.clubs)
    .doc(clubId)
    .onSnapshot((snap) => {
      if (!snap.exists) {
        onData(null);
        return;
      }
      onData({ id: snap.id, ...(snap.data() as any) } as Club);
    });
}

/**
 * Listens to all members of a club, ordered by joinedAt asc.
 */
export function listenClubMembers(
  clubId: string,
  onData: (members: ClubMember[]) => void,
): () => void {
  return db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .orderBy('joinedAt', 'asc')
    .onSnapshot((snap) => {
      const members: ClubMember[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      onData(members);
    });
}

/**
 * Listens to users/{uid}/clubRef/data for the user's clubId.
 */
export function listenMyClubId(
  uid: string,
  onData: (clubId: string | null) => void,
): () => void {
  return db
    .collection(COL.users)
    .doc(uid)
    .collection('clubRef')
    .doc('data')
    .onSnapshot((snap) => {
      if (!snap.exists) {
        onData(null);
        return;
      }
      const data = snap.data() as any;
      onData(data?.clubId ?? null);
    });
}

/**
 * Creates a staff invite doc under clubs/{clubId}/members with status 'invited'.
 */
export async function inviteStaffMember(params: {
  clubId: string;
  email: string;
  role: ClubRole;
  teamIds: string[];
  invitedByName: string;
}): Promise<void> {
  const { clubId, email, role, teamIds, invitedByName } = params;

  const emailLower = email.trim().toLowerCase();
  if (!emailLower || !emailLower.includes('@')) {
    throw new Error('Valid email is required');
  }

  // Deterministic ID so security rules can validate acceptance (one pending invite per email).
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .doc(`invite_${emailLower}`)
    .set(
      {
        role,
        status: 'invited' as ClubMemberStatus,
        displayName: emailLower,
        email: emailLower,
        invitedEmail: emailLower,
        invitedEmailLower: emailLower,
        teamIds: teamIds ?? [],
        joinedAt: serverTimestamp(),
        invitedByName,
      },
      { merge: true },
    );

  // Send the invite email (picked up by the Trigger Email extension)
  const clubSnap = await db.collection(COL.clubs).doc(clubId).get();
  const clubName = (clubSnap.data() as any)?.name || 'a club';
  const roleLabels: Record<ClubRole, string> = {
    owner: 'owner', head_coach: 'head coach', asst_coach: 'assistant coach', staff: 'staff member',
  };
  await db.collection('mail').add({
    to: [emailLower],
    message: {
      subject: `${invitedByName || 'A club'} invited you to join ${clubName} on Formavo`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 800; color: #111; margin-bottom: 8px;">
            You're invited to Formavo ⚽
          </h2>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            ${invitedByName || 'A club administrator'} invited you to join
            <strong>${clubName}</strong> as a <strong>${roleLabels[role]}</strong>.
          </p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6;">
            Download the Formavo app and sign up with this email address
            (<strong>${emailLower}</strong>) to get access to your teams.
          </p>
        </div>
      `,
      text: `${invitedByName || 'A club administrator'} invited you to join ${clubName} on Formavo as a ${roleLabels[role]}.\n\nDownload the Formavo app and sign up with this email address (${emailLower}) to get access to your teams.`,
    },
  }).catch((e) => console.warn('[inviteStaff] mail error:', e));
}

/**
 * Maps a club role to the team-level role granted on assigned teams.
 */
export function clubRoleToTeamRole(role: ClubRole): 'coach' | 'assistant' {
  return role === 'owner' || role === 'head_coach' ? 'coach' : 'assistant';
}

/**
 * Accepts a pending staff invite (clubs/{clubId}/members/{inviteId}).
 *
 * - creates clubs/{clubId}/members/{uid} as active
 * - deletes the invite doc so the staff list doesn't show a duplicate row
 * - sets users/{uid}/clubRef/data if the user doesn't already have a club
 * - grants team membership + teamRefs for each team assigned on the invite
 */
export async function acceptClubStaffInvite(params: {
  clubId: string;
  inviteRef: any;
  inviteData: any;
  uid: string;
  email: string;
  displayName?: string;
}): Promise<void> {
  const { clubId, inviteRef, inviteData, uid, email, displayName } = params;

  const role: ClubRole = inviteData?.role || 'staff';
  const teamIds: string[] = Array.isArray(inviteData?.teamIds) ? inviteData.teamIds : [];
  const teamRole = clubRoleToTeamRole(role);

  const clubRefDoc = db.collection(COL.users).doc(uid).collection('clubRef').doc('data');
  const [clubRefSnap, ...teamSnaps] = await Promise.all([
    clubRefDoc.get(),
    ...teamIds.map((teamId) => db.collection(COL.teams).doc(teamId).get()),
  ]);

  const batch = db.batch();

  batch.set(
    db.collection(COL.clubs).doc(clubId).collection(COL.clubMembers).doc(uid),
    {
      role,
      status: 'active' as ClubMemberStatus,
      displayName: displayName || inviteData?.displayName || email,
      email,
      teamIds,
      joinedAt: serverTimestamp(),
      invitedEmailLower: email,
    },
    { merge: true },
  );

  batch.delete(inviteRef);

  if (!clubRefSnap.data()?.clubId) {
    batch.set(clubRefDoc, { clubId }, { merge: true });
  }

  for (const teamSnap of teamSnaps) {
    if (!teamSnap.exists) continue;
    const teamData: any = teamSnap.data() || {};
    if (teamData.isDeleted) continue;
    const teamId = teamSnap.id;
    const teamName = teamData.name || 'Team';

    batch.set(
      db.collection(COL.teams).doc(teamId).collection(COL.members).doc(uid),
      {
        role: teamRole,
        status: 'active',
        joinedAt: serverTimestamp(),
        invitedEmail: email,
        invitedEmailLower: email,
        ...(displayName ? { displayName } : {}),
      },
      { merge: true },
    );

    batch.set(
      db.collection(COL.users).doc(uid).collection(COL.teamRefs).doc(teamId),
      {
        teamId,
        role: teamRole,
        status: 'active',
        joinedAt: serverTimestamp(),
        teamName,
        teamNameLower: String(teamName).toLowerCase(),
        isDeleted: false,
      },
      { merge: true },
    );
  }

  await batch.commit();
}

/**
 * Updates a club member's role.
 */
export async function updateMemberRole(params: {
  clubId: string;
  userId: string;
  role: ClubRole;
}): Promise<void> {
  const { clubId, userId, role } = params;
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .doc(userId)
    .update({ role });
}

/**
 * Updates which teams a club member is assigned to.
 */
export async function updateMemberTeams(params: {
  clubId: string;
  userId: string;
  teamIds: string[];
}): Promise<void> {
  const { clubId, userId, teamIds } = params;
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .doc(userId)
    .update({ teamIds });
}

/**
 * Removes a member from the club.
 */
export async function removeMember(params: {
  clubId: string;
  userId: string;
}): Promise<void> {
  const { clubId, userId } = params;
  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .doc(userId)
    .delete();
}

/**
 * Updates club name and/or logoUrl.
 */
export async function updateClub(params: {
  clubId: string;
  name?: string;
  logoUrl?: string;
  sponsorName?: string;
  sponsorLogoUrl?: string;
}): Promise<void> {
  const { clubId, name, logoUrl, sponsorName, sponsorLogoUrl } = params;
  const update: Record<string, any> = { updatedAt: serverTimestamp() };
  if (name !== undefined) update.name = name;
  if (logoUrl !== undefined) update.logoUrl = logoUrl;
  if (sponsorName !== undefined) update.sponsorName = sponsorName;
  if (sponsorLogoUrl !== undefined) update.sponsorLogoUrl = sponsorLogoUrl;
  await db.collection(COL.clubs).doc(clubId).update(update);
}

export type ClubSponsor = { name: string; logoUrl?: string };

/** Resolve a team's club sponsor (null when the team has no club or no sponsor). */
export async function fetchClubSponsorForTeam(teamId: string): Promise<ClubSponsor | null> {
  try {
    const teamSnap = await db.collection('teams').doc(teamId).get();
    const clubId = (teamSnap.data() as any)?.clubId;
    if (!clubId) return null;
    const clubSnap = await db.collection(COL.clubs).doc(clubId).get();
    const club: any = clubSnap.data() || {};
    if (!club.sponsorName) return null;
    return { name: club.sponsorName, logoUrl: club.sponsorLogoUrl };
  } catch {
    return null;
  }
}
