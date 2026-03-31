import { Alert, Linking, Platform } from 'react-native';

export function openMaps(address: string) {
  if (!address.trim()) return;
  const encoded = encodeURIComponent(address.trim());

  const appleMapsUrl = `maps:0,0?q=${encoded}`;
  const googleMapsApp = `comgooglemaps://?q=${encoded}`;
  const googleMapsWeb = `https://maps.google.com/?q=${encoded}`;

  Alert.alert('Open in Maps', address.trim(), [
    {
      text: 'Apple Maps',
      onPress: () => Linking.openURL(appleMapsUrl).catch(() => null),
    },
    {
      text: 'Google Maps',
      onPress: async () => {
        const canOpen = await Linking.canOpenURL(googleMapsApp).catch(() => false);
        Linking.openURL(canOpen ? googleMapsApp : googleMapsWeb).catch(() => null);
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
