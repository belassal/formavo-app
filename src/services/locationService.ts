import firestore from '@react-native-firebase/firestore';

export type SavedLocation = {
  id: string;
  name: string;
  address: string;
};

export function listenLocations(uid: string, cb: (locations: SavedLocation[]) => void): () => void {
  return firestore()
    .collection('users')
    .doc(uid)
    .collection('locations')
    .orderBy('name')
    .onSnapshot(
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedLocation, 'id'>) }))),
      console.warn,
    );
}

export async function addLocation(uid: string, name: string, address: string): Promise<void> {
  await firestore()
    .collection('users')
    .doc(uid)
    .collection('locations')
    .add({ name: name.trim(), address: address.trim(), createdAt: firestore.FieldValue.serverTimestamp() });
}

export async function updateLocation(uid: string, id: string, name: string, address: string): Promise<void> {
  await firestore()
    .collection('users')
    .doc(uid)
    .collection('locations')
    .doc(id)
    .update({ name: name.trim(), address: address.trim() });
}

export async function deleteLocation(uid: string, id: string): Promise<void> {
  await firestore().collection('users').doc(uid).collection('locations').doc(id).delete();
}
