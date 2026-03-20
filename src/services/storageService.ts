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
