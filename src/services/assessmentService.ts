/**
 * assessmentService — structured player assessments on the four-corner model
 * (technical / tactical / physical / mental), taken in windows
 * (preseason, mid-season, end of season, custom).
 * Docs: teams/{teamId}/playerAssessments/{autoId}
 */
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export const CORNERS = ['technical', 'tactical', 'physical', 'mental'] as const;
export type Corner = (typeof CORNERS)[number];

export const WINDOWS = ['Preseason', 'Mid-season', 'End of season'] as const;

export type PlayerAssessment = {
  id: string;
  playerId: string;
  playerName: string;
  window: string;
  scores: Record<Corner, number>; // 1–5
  notes?: string;
  coachId: string;
  coachName: string;
  createdAt: any;
};

export async function addAssessment(params: {
  teamId: string;
  playerId: string;
  playerName: string;
  window: string;
  scores: Record<Corner, number>;
  notes?: string;
  coachId: string;
  coachName: string;
}): Promise<void> {
  const { teamId, ...rest } = params;
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection('playerAssessments')
    .add({
      ...rest,
      notes: (rest.notes || '').trim(),
      createdAt: serverTimestamp(),
    });
}

export function listenPlayerAssessments(
  teamId: string,
  playerId: string,
  onData: (rows: PlayerAssessment[]) => void,
): () => void {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection('playerAssessments')
    .where('playerId', '==', playerId)
    .onSnapshot(
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) })) as PlayerAssessment[];
        rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        onData(rows);
      },
      () => onData([]),
    );
}

export async function deleteAssessment(teamId: string, assessmentId: string): Promise<void> {
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection('playerAssessments')
    .doc(assessmentId)
    .delete();
}
