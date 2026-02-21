import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export const fbAuth = auth();
export const db = firestore();
export const serverTimestamp = firestore.FieldValue.serverTimestamp;

