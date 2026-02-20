import firestore from '@react-native-firebase/firestore';

export const db = firestore();

// convenience helpers
export function teamsRef(clubId: string) {
  return db.collection('clubs').doc(clubId).collection('teams');
}

