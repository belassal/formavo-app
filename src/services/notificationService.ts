import messaging from '@react-native-firebase/messaging';
import firestore from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

/**
 * Request notification permission and return granted status.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  return enabled;
}

/**
 * Get the current FCM token.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const token = await messaging().getToken();
    return token;
  } catch (e) {
    console.warn('[notifications] getFCMToken error', e);
    return null;
  }
}

/**
 * Save FCM token to Firestore under users/{uid} so Cloud Functions
 * can target this device for push notifications.
 */
export async function saveFCMToken(uid: string, token: string): Promise<void> {
  await firestore()
    .collection('users')
    .doc(uid)
    .set(
      {
        fcmTokens: firestore.FieldValue.arrayUnion(token),
        platform: Platform.OS,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

/**
 * Remove a stale FCM token (e.g. on sign-out).
 */
export async function removeFCMToken(uid: string, token: string): Promise<void> {
  await firestore()
    .collection('users')
    .doc(uid)
    .set(
      { fcmTokens: firestore.FieldValue.arrayRemove(token) },
      { merge: true }
    );
}

/**
 * Full setup: request permission → get token → save to Firestore.
 * Call this once after the user signs in.
 */
export async function setupNotifications(uid: string): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    const token = await getFCMToken();
    if (!token) return;

    await saveFCMToken(uid, token);

    // Refresh token handler
    messaging().onTokenRefresh(async (newToken) => {
      await saveFCMToken(uid, newToken);
    });
  } catch (e) {
    console.warn('[notifications] setup error', e);
  }
}
