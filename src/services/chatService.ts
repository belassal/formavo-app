import firestore from '@react-native-firebase/firestore';
import { COL } from '../models/collections';

export type ChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  createdAt: any;
};

export function listenMessages(
  teamId: string,
  onUpdate: (messages: ChatMessage[]) => void
): () => void {
  return firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.messages)
    .orderBy('createdAt', 'asc')
    .limitToLast(100)
    .onSnapshot(
      (snap) => {
        const messages = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ChatMessage[];
        onUpdate(messages);
      },
      (err) => console.warn('[chat] listen error', err)
    );
}

export async function sendMessage(params: {
  teamId: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: string;
}): Promise<void> {
  const { teamId, text, senderId, senderName, senderRole } = params;
  await firestore()
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.messages)
    .add({
      text: text.trim(),
      senderId,
      senderName,
      senderRole,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
}
