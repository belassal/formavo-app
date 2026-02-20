import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, Text } from 'react-native';
import auth from '@react-native-firebase/auth';
import TeamsScreen from './src/screens/TeamsScreen';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authErr, setAuthErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (user) => {
      try {
        setAuthErr(null);

        // If not signed in yet, sign in anonymously
        if (!user) {
          await auth().signInAnonymously();
          return; // wait for next auth state callback
        }

        // Signed in ✅
        setReady(true);
      } catch (e: any) {
        setAuthErr(e?.message || String(e));
        setReady(false);
      }
    });

    return unsub;
  }, []);

  if (authErr) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Auth Error</Text>
        <Text style={{ marginTop: 10, color: 'red' }}>{authErr}</Text>
        <Text style={{ marginTop: 12, color: '#666' }}>
          Most common fix: Firebase Console → Authentication → Sign-in method → enable Anonymous.
        </Text>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return <TeamsScreen />;
}

