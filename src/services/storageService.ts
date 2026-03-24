import storage from '@react-native-firebase/storage';

export const storageReady = true;
export const imagePickerReady = true;

/**
 * Open the native photo library and return the selected image URI.
 * Returns null if the user cancels.
 */
export function pickPlayerPhoto(): Promise<string | null> {
  // Dynamic import avoids New Architecture TurboModule null-ref issues
  // on first call before the native bridge is fully ready.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { launchImageLibrary } = require('react-native-image-picker');

  return new Promise((resolve) => {
    try {
      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.7,
          maxWidth: 400,
          maxHeight: 400,
          includeBase64: false,
        },
        (response: any) => {
          if (response?.didCancel || response?.errorCode) {
            resolve(null);
            return;
          }
          const uri = response?.assets?.[0]?.uri ?? null;
          resolve(uri);
        }
      );
    } catch (e) {
      console.warn('[storageService] launchImageLibrary error', e);
      resolve(null);
    }
  });
}

/**
 * Upload a local image URI to Firebase Storage and return the download URL.
 * Path: players/{playerId}/avatar.jpg
 */
export async function uploadPlayerAvatar(
  playerId: string,
  localUri: string
): Promise<string> {
  const ref = storage().ref(`players/${playerId}/avatar.jpg`);
  await ref.putFile(localUri);
  const url: string = await ref.getDownloadURL();
  return url;
}

/**
 * Upload a user/staff profile photo and return the download URL.
 * Path: users/{uid}/avatar.jpg
 */
export async function uploadUserAvatar(
  uid: string,
  localUri: string
): Promise<string> {
  const ref = storage().ref(`users/${uid}/avatar.jpg`);
  await ref.putFile(localUri);
  const url: string = await ref.getDownloadURL();
  return url;
}

/**
 * Open the native photo library for general use (team/match photos).
 * Returns null if the user cancels.
 */
export function pickPhoto(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { launchImageLibrary } = require('react-native-image-picker');
  return new Promise((resolve) => {
    try {
      launchImageLibrary(
        { mediaType: 'photo', quality: 0.85, maxWidth: 1200, maxHeight: 1200, includeBase64: false },
        (response: any) => {
          if (response?.didCancel || response?.errorCode) { resolve(null); return; }
          const uri = response?.assets?.[0]?.uri ?? null;
          resolve(uri);
        }
      );
    } catch (e) {
      console.warn('[storageService] pickPhoto error', e);
      resolve(null);
    }
  });
}

/**
 * Upload a team photo to Firebase Storage.
 * Path: teams/{teamId}/photos/{filename}
 */
export async function uploadTeamPhoto(teamId: string, localUri: string, filename: string): Promise<string> {
  const ref = storage().ref(`teams/${teamId}/photos/${filename}`);
  await ref.putFile(localUri);
  const url: string = await ref.getDownloadURL();
  return url;
}

/**
 * Upload a club logo and return the download URL.
 * Path: clubs/{clubId}/logo.jpg
 */
export async function uploadClubLogo(clubId: string, localUri: string): Promise<string> {
  const ref = storage().ref(`clubs/${clubId}/logo.jpg`);
  await ref.putFile(localUri);
  const url: string = await ref.getDownloadURL();
  return url;
}

/**
 * Delete a team photo from Firebase Storage by its full storage path.
 */
export async function deleteTeamPhotoFromStorage(storagePath: string): Promise<void> {
  try {
    await storage().ref(storagePath).delete();
  } catch (e) {
    console.warn('[storageService] deleteTeamPhotoFromStorage:', e);
  }
}
