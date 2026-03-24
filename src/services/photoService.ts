import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface TeamPhoto {
  id: string;
  url: string;
  storagePath: string;
  uploadedBy: string;
  uploaderName: string;
  caption?: string;
  matchId?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
}

export function listenTeamPhotos(
  teamId: string,
  onData: (photos: TeamPhoto[]) => void,
  options?: { matchId?: string },
): () => void {
  let query: any = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.photos)
    .where('isDeleted', '==', false)
    .orderBy('createdAt', 'desc');

  return query.onSnapshot(
    (snap: any) => {
      let photos = (snap?.docs ?? []).map((d: any) => ({ id: d.id, ...d.data() })) as TeamPhoto[];
      if (options?.matchId) {
        photos = photos.filter((p) => p.matchId === options.matchId);
      }
      onData(photos);
    },
    (err: any) => {
      console.warn('[listenTeamPhotos] error:', err);
      onData([]);
    },
  );
}

export async function addTeamPhoto(params: {
  teamId: string;
  url: string;
  storagePath: string;
  uploadedBy: string;
  uploaderName: string;
  caption?: string;
  matchId?: string;
}): Promise<string> {
  const ref = db.collection(COL.teams).doc(params.teamId).collection(COL.photos).doc();
  await ref.set({
    url: params.url,
    storagePath: params.storagePath,
    uploadedBy: params.uploadedBy,
    uploaderName: params.uploaderName,
    caption: params.caption?.trim() ?? '',
    matchId: params.matchId ?? null,
    isDeleted: false,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteTeamPhoto(teamId: string, photoId: string): Promise<void> {
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.photos)
    .doc(photoId)
    .set({ isDeleted: true }, { merge: true });
}
