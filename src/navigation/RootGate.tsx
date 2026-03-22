import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

import AppTabs from './tabs/AppTabs';
import AuthStack from './stacks/AuthStack';
import { setupNotifications } from '../services/notificationService';

type AuthState = 'loading' | 'unauthenticated' | 'anonymous' | 'authenticated';

export function RootGate() {
  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    const unsub = auth().onIdTokenChanged((user: FirebaseAuthTypes.User | null) => {
      if (!user) {
        setAuthState('unauthenticated');
      } else if (user.isAnonymous) {
        setAuthState('anonymous');
      } else {
        setAuthState('authenticated');
        setupNotifications(user.uid).catch(console.warn);
      }
    });
    return unsub;
  }, []);

  if (authState === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (authState === 'unauthenticated' || authState === 'anonymous') {
    return <AuthStack />;
  }

  return <AppTabs />;
}
