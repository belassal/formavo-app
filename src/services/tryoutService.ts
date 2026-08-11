/**
 * tryoutService — tryout sessions + candidate evaluations (club staff tool).
 * clubs/{clubId}/tryouts/{id} and .../candidates/{id}
 */
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type CandidateTag = 'keep' | 'maybe' | 'pass' | null;

export type Tryout = { id: string; name: string; createdAt: any; candidateCount?: number };
export type Candidate = {
  id: string;
  name: string;
  number?: string;
  rating: number; // 0 = unrated, 1–5
  tag: CandidateTag;
  notes?: string;
  createdAt: any;
};

function tryoutsCol(clubId: string) {
  return db.collection(COL.clubs).doc(clubId).collection('tryouts');
}

export function listenTryouts(clubId: string, onData: (rows: Tryout[]) => void): () => void {
  return tryoutsCol(clubId).onSnapshot(
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Tryout[];
      rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      onData(rows);
    },
    () => onData([]),
  );
}

export async function createTryout(clubId: string, name: string): Promise<string> {
  const ref = await tryoutsCol(clubId).add({
    name: name.trim(),
    createdAt: serverTimestamp(),
    candidateCount: 0,
  });
  return ref.id;
}

export async function deleteTryout(clubId: string, tryoutId: string): Promise<void> {
  // Candidates are few; delete them client-side then the tryout doc.
  const candidates = await tryoutsCol(clubId).doc(tryoutId).collection('candidates').get();
  const batch = db.batch();
  candidates.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(tryoutsCol(clubId).doc(tryoutId));
  await batch.commit();
}

export function listenCandidates(
  clubId: string,
  tryoutId: string,
  onData: (rows: Candidate[]) => void,
): () => void {
  return tryoutsCol(clubId).doc(tryoutId).collection('candidates').onSnapshot(
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Candidate[];
      // Rated-high first, then unrated by entry order
      rows.sort((a, b) => (b.rating - a.rating) || ((a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)));
      onData(rows);
    },
    () => onData([]),
  );
}

export async function addCandidate(clubId: string, tryoutId: string, name: string, number?: string) {
  const ref = tryoutsCol(clubId).doc(tryoutId);
  await ref.collection('candidates').add({
    name: name.trim(),
    number: (number || '').trim(),
    rating: 0,
    tag: null,
    createdAt: serverTimestamp(),
  });
  await ref.set({ candidateCount: (await ref.collection('candidates').get()).size }, { merge: true });
}

export async function updateCandidate(
  clubId: string,
  tryoutId: string,
  candidateId: string,
  patch: Partial<Pick<Candidate, 'rating' | 'tag' | 'notes' | 'name' | 'number'>>,
) {
  await tryoutsCol(clubId).doc(tryoutId).collection('candidates').doc(candidateId).update(patch);
}

export async function removeCandidate(clubId: string, tryoutId: string, candidateId: string) {
  await tryoutsCol(clubId).doc(tryoutId).collection('candidates').doc(candidateId).delete();
}
