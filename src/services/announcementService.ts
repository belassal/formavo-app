import firestore from '@react-native-firebase/firestore';
import { COL } from '../models/collections';

export type Announcement = {
  id: string;
  text: string;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  updatedAt?: any;
  isEdited?: boolean;
};

export function listenAnnouncements(
  teamId: string,
  onUpdate: (rows: Announcement[]) => void
): () => void {
  return firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.announcements)
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Announcement[];
        onUpdate(rows);
      },
      (err) => console.warn('[announcements] listen error', err)
    );
}

export async function postAnnouncement(params: {
  teamId: string;
  text: string;
  createdBy: string;
  createdByName: string;
}): Promise<void> {
  const { teamId, text, createdBy, createdByName } = params;
  await firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.announcements)
    .add({
      text: text.trim(),
      createdBy,
      createdByName,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
}

export async function editAnnouncement(
  teamId: string,
  announcementId: string,
  newText: string,
): Promise<void> {
  await firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.announcements)
    .doc(announcementId)
    .update({
      text: newText.trim(),
      isEdited: true,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export async function deleteAnnouncement(
  teamId: string,
  announcementId: string
): Promise<void> {
  await firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.announcements)
    .doc(announcementId)
    .delete();
}
