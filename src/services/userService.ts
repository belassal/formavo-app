import auth from '@react-native-firebase/auth';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type UserProfile = {
  uid: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  phone?: string;
  bio?: string;
  photoUrl?: string;
  updatedAt?: any;
};

export function listenUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
): () => void {
  return db
    .collection(COL.users)
    .doc(uid)
    .onSnapshot(
      (snap) => {
        if (!snap.exists) { onData(null); return; }
        onData({ uid, ...(snap.data() as any) } as UserProfile);
      },
      (err) => { console.warn('[userService] listen error', err); onData(null); },
    );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await db.collection(COL.users).doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...(snap.data() as any) } as UserProfile;
}

/**
 * Updates the user's profile in Firestore, Firebase Auth, and syncs
 * displayName + photoUrl to all club member docs.
 */
export async function updateUserProfile(params: {
  uid: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  photoUrl?: string;
}): Promise<void> {
  const { uid, firstName, lastName, phone, bio, photoUrl } = params;

  const patch: any = { updatedAt: serverTimestamp() };
  if (firstName !== undefined) patch.firstName = firstName.trim();
  if (lastName !== undefined) patch.lastName = lastName.trim();
  if (phone !== undefined) patch.phone = phone.trim();
  if (bio !== undefined) patch.bio = bio.trim();
  if (photoUrl !== undefined) patch.photoUrl = photoUrl;

  // Derive displayName from first + last
  const f = (firstName ?? '').trim();
  const l = (lastName ?? '').trim();
  const displayName = [f, l].filter(Boolean).join(' ');
  if (displayName) patch.displayName = displayName;

  // 1. Write to users/{uid}
  await db.collection(COL.users).doc(uid).set(patch, { merge: true });

  // 2. Update Firebase Auth profile
  const user = auth().currentUser;
  if (user) {
    const authUpdate: { displayName?: string; photoURL?: string } = {};
    if (displayName) authUpdate.displayName = displayName;
    if (photoUrl !== undefined) authUpdate.photoURL = photoUrl;
    if (Object.keys(authUpdate).length > 0) {
      await user.updateProfile(authUpdate);
    }
  }

  // 3. Sync to all club member docs for this user
  await syncProfileToClubMembers({ uid, displayName: displayName || undefined, photoUrl });
}

/**
 * Finds all clubs where this user is a member and updates their
 * displayName and photoUrl in each club member doc.
 */
async function syncProfileToClubMembers(params: {
  uid: string;
  displayName?: string;
  photoUrl?: string;
}): Promise<void> {
  const { uid, displayName, photoUrl } = params;
  if (!displayName && photoUrl === undefined) return;

  // Find clubs via the user's teamRefs → team's clubId
  // Simpler: query clubs/{clubId}/members/{uid} directly using a collection group
  // We'll use the user's known club from their profile doc
  const userDoc = await db.collection(COL.users).doc(uid).get();
  const clubRefDoc = await db
    .collection(COL.users)
    .doc(uid)
    .collection('clubRef')
    .doc('data')
    .get();

  const clubId = (clubRefDoc.data() as any)?.clubId;
  if (!clubId) return;

  const memberRef = db
    .collection(COL.clubs)
    .doc(clubId)
    .collection(COL.clubMembers)
    .doc(uid);

  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return;

  const patch: any = { updatedAt: serverTimestamp() };
  if (displayName) patch.displayName = displayName;
  if (photoUrl !== undefined) patch.photoUrl = photoUrl;

  await memberRef.set(patch, { merge: true });
}
