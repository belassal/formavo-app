import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type TrainingStatus = 'scheduled' | 'completed' | 'cancelled';

export type Training = {
  id: string;
  title: string;
  startISO: string;  // 'YYYY-MM-DD HH:mm'
  endISO: string;    // 'YYYY-MM-DD HH:mm'
  location?: string;
  notes?: string;
  status: TrainingStatus;
  isDeleted?: boolean;
  confirmedPlayerIds?: string[];
  declinedPlayerIds?: string[];
  attendedPlayerIds?: string[];  // actual check-in by coach
  createdAt?: any;
  updatedAt?: any;
};

// teams/{teamId}/trainings
export function listenTrainings(
  teamId: string,
  onData: (rows: Training[]) => void,
): () => void {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .orderBy('startISO', 'asc')
    .onSnapshot(
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as Training))
          .filter((t) => !t.isDeleted);
        onData(rows);
      },
      (err) => console.warn('[trainingService] listenTrainings error', err),
    );
}

export async function createTraining(params: {
  teamId: string;
  title: string;
  startISO: string;
  endISO: string;
  location?: string;
  notes?: string;
}): Promise<string> {
  const { teamId, title, startISO, endISO, location, notes } = params;
  const ref = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .doc();

  const doc: Record<string, any> = {
    title,
    startISO,
    endISO,
    status: 'scheduled' as TrainingStatus,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (location) doc.location = location;
  if (notes) doc.notes = notes;

  await ref.set(doc);
  return ref.id;
}

export async function updateTraining(params: {
  teamId: string;
  trainingId: string;
  title?: string;
  startISO?: string;
  endISO?: string;
  location?: string;
  notes?: string;
  status?: TrainingStatus;
}): Promise<void> {
  const { teamId, trainingId, title, startISO, endISO, location, notes, status } = params;

  const patch: Record<string, any> = { updatedAt: serverTimestamp() };
  if (title !== undefined) patch.title = title;
  if (startISO !== undefined) patch.startISO = startISO;
  if (endISO !== undefined) patch.endISO = endISO;
  if (location !== undefined) patch.location = location || '';
  if (notes !== undefined) patch.notes = notes || '';
  if (status !== undefined) patch.status = status;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .doc(trainingId)
    .update(patch);
}

export async function softDeleteTraining(params: {
  teamId: string;
  trainingId: string;
}): Promise<void> {
  const { teamId, trainingId } = params;
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .doc(trainingId)
    .update({ isDeleted: true, updatedAt: serverTimestamp() });
}

/** Toggle a player's actual attendance (present/absent) for a training session. */
export async function markTrainingAttended(params: {
  teamId: string;
  trainingId: string;
  playerId: string;
  attended: boolean;
}): Promise<void> {
  const { teamId, trainingId, playerId, attended } = params;
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .doc(trainingId)
    .update({
      attendedPlayerIds: attended
        ? firestore.FieldValue.arrayUnion(playerId)
        : firestore.FieldValue.arrayRemove(playerId),
      updatedAt: serverTimestamp(),
    });
}

/**
 * One-time fetch of training attendance stats for a player in a team.
 * Returns { attended, total } where total = sessions that have had check-in started.
 */
export async function fetchPlayerTrainingStats(
  teamId: string,
  playerId: string,
): Promise<{ attended: number; total: number }> {
  if (!teamId) return { attended: 0, total: 0 };

  const snap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .get();

  let attended = 0;
  let total = 0;

  snap.docs.forEach((d) => {
    const data = d.data() as any;
    if (data.isDeleted) return;
    const checkedIn: string[] = data.attendedPlayerIds ?? [];
    if (checkedIn.length > 0) {
      total += 1;
      if (checkedIn.includes(playerId)) attended += 1;
    }
  });

  return { attended, total };
}

export async function setTrainingAttendance(params: {
  teamId: string;
  trainingId: string;
  playerId: string;
  status: 'confirmed' | 'declined';
}): Promise<void> {
  const { teamId, trainingId, playerId, status } = params;
  const addField = status === 'confirmed' ? 'confirmedPlayerIds' : 'declinedPlayerIds';
  const removeField = status === 'confirmed' ? 'declinedPlayerIds' : 'confirmedPlayerIds';
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.trainings)
    .doc(trainingId)
    .update({
      [addField]: firestore.FieldValue.arrayUnion(playerId),
      [removeField]: firestore.FieldValue.arrayRemove(playerId),
      updatedAt: serverTimestamp(),
    });
}
