import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase'; // use your existing exports
import { COL } from '../models/collections';
import type { MatchEvent } from '../models/matchEvent';

type BaseArgs = { teamId: string; matchId: string };

function eventsRef({ teamId, matchId }: BaseArgs) {
  return db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection('events');
}

export async function addMatchEvent(args: BaseArgs & { event: MatchEvent }) {
  const ref = eventsRef(args).doc();
  await ref.set({
    ...args.event,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// "Undo last goal for this side"
export async function deleteLastGoalEvent(args: BaseArgs & { side: 'home' | 'away' }) {
  const snap = await eventsRef(args)
    .where('type', '==', 'goal')
    .where('side', '==', args.side)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snap.empty) return false;

  await snap.docs[0].ref.delete();
  return true;
}