/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';

// Must be registered before AppRegistry.registerComponent
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('[FCM] Background message:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
