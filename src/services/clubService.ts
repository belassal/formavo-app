import firestore from '@react-native-firebase/firestore';
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

export type Club = {
  id: string;
  name: string;
  logoUrl?: string;
  createdBy: string;
  createdAt: any;
};

/**
 * Creates a new club doc and adds the creator as owner member.
 * Returns the new clubId.
 */
export async function createClub(params: {
  name: string;
  createdBy: string;
  createdByEmail: string;
  createdByName: string;
}): Promise<string> {
  const { name, createdBy, createdByEmail, createdByName } = params;

  const clubRef = db.collection(COL.clubs).doc();

  const batch = db.batch();

  batch.set(clubRef, {
    name,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const memberRef = clubRef.collection(COL.clubMembers).doc(createdBy);
  batch.set(memberRef, {
    role: 'owner' as ClubRole,
    status: 'active' as ClubMemberStatus,
    displayName: createdByName,
    email: createdByEmail,
    teamIds: [],
    joinedAt: serverTimestamp(),
  });

  await batch.commit();

  return clubRef.id;
}

/**
 * Returns the clubId for a user. If no club exists yet, creates one
 * named "{displayName}'s Club" and stores the ref in users/{uid}/clubRef.
 */
export async function getOrCreateClubForUser(params: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<string> {
  const { uid, email, displayName } = params;

  const clubRefDoc = db.collection(COL.users).doc(uid).collection('clubRef').doc('data');
  const snap = await clubRefDoc.get();

  if (snap.data() != null) {
    const data = snap.data() as any;
    if (data?.clubId) {
      return data.clubId as string;
    }
  }

  // Create a new club
  const clubId = await createClub({
    name: `${displayName}'s Club`,
    createdBy: uid,
    createdByEmail: email,
    createdByName: displayName,
  });

  // Store clubId for fast lookup
  await clubRefDoc.set({ clubId }, { merge: true });

  return clubId;
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

  await db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .add({
      role,
      status: 'invited' as ClubMemberStatus,
      displayName: emailLower,
      email: emailLower,
      invitedEmail: emailLower,
      invitedEmailLower: emailLower,
      teamIds: teamIds ?? [],
      joinedAt: serverTimestamp(),
      invitedByName,
    });
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
}): Promise<void> {
  const { clubId, name, logoUrl } = params;
  const update: Record<string, any> = { updatedAt: serverTimestamp() };
  if (name !== undefined) update.name = name;
  if (logoUrl !== undefined) update.logoUrl = logoUrl;
  await db.collection(COL.clubs).doc(clubId).update(update);
}
