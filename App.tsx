import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    // Show an alert banner when a notification arrives while the app is in the foreground
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      const title = remoteMessage.notification?.title ?? 'Formavo';
      const body = remoteMessage.notification?.body ?? '';
      if (body) Alert.alert(title, body);
    });
    return unsubscribe;
  }, []);

  return <RootNavigator />;
}

