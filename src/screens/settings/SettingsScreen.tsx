import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsStackParamList } from '../../navigation/stacks/SettingsStack';
import { removeFCMToken } from '../../services/notificationService';
import { db } from '../../services/firebase';

// Mirrors NotifPref in functions/src/index.ts — missing key means ON.
const NOTIF_PREFS: { key: string; label: string; icon: string }[] = [
  { key: 'live', label: 'Live goals', icon: '⚽' },
  { key: 'schedule', label: 'New matches & trainings', icon: '📅' },
  { key: 'rsvp', label: 'RSVPs & reminders', icon: '⏰' },
  { key: 'chat', label: 'Team chat', icon: '💬' },
  { key: 'announcements', label: 'Announcements', icon: '📣' },
  { key: 'digest', label: 'Weekly digest', icon: '📊' },
];

type Nav = NativeStackNavigationProp<SettingsStackParamList>;

function Row({
  label,
  icon,
  onPress,
  destructive,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 8,
        backgroundColor: destructive ? '#fee2e2' : '#f3f4f6',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 16, color: destructive ? '#ef4444' : '#111' }}>{label}</Text>
      {!destructive && <Text style={{ fontSize: 18, color: '#c7c7cc' }}>›</Text>}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 62 }} />;
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const uid = auth().currentUser?.uid ?? null;

  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!uid) return;
    return db.collection('users').doc(uid).onSnapshot((snap) => {
      setPrefs((snap.data() as any)?.notificationPrefs ?? {});
    });
  }, [uid]);

  const togglePref = (key: string, value: boolean) => {
    if (!uid) return;
    setPrefs((p) => ({ ...p, [key]: value }));
    db.collection('users').doc(uid)
      .set({ notificationPrefs: { [key]: value } }, { merge: true })
      .catch(console.warn);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your login and personal profile. Team records you created (matches, rosters) stay with the team. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const user = auth().currentUser;
            if (!user) return;
            try {
              const token = await messaging().getToken().catch(() => null);
              if (token) await removeFCMToken(user.uid, token).catch(() => {});
              // Remove personal data the user owns
              const userRef = db.collection('users').doc(user.uid);
              const [teamRefs, clubRef] = await Promise.all([
                userRef.collection('teamRefs').get(),
                userRef.collection('clubRef').get(),
              ]);
              const batch = db.batch();
              teamRefs.docs.forEach((d) => batch.delete(d.ref));
              clubRef.docs.forEach((d) => batch.delete(d.ref));
              batch.delete(userRef);
              await batch.commit();
              await user.delete();
            } catch (e: any) {
              if (e?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Please sign in again',
                  'For security, deleting your account requires a recent sign-in. Sign out, sign back in, then try again.',
                );
              } else {
                Alert.alert('Delete failed', e?.message ?? 'Unknown error');
              }
            }
          },
        },
      ],
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await messaging().getToken().catch(() => null);
            if (uid && token) await removeFCMToken(uid, token).catch(console.warn);
          } finally {
            auth().signOut();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>

        {/* Account */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
            ACCOUNT
          </Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Row label="Profile" icon="👤" onPress={() => navigation.navigate('Profile')} />
          </View>
        </View>

        {/* App */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
            APP
          </Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Row label="Locations" icon="📍" onPress={() => navigation.navigate('Locations')} />
            <Divider />
            <Row label="Formations" icon="⚽" onPress={() => navigation.navigate('Formations')} />
          </View>
        </View>

        {/* Notifications */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
            NOTIFICATIONS
          </Text>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            {NOTIF_PREFS.map((p, i) => (
              <View key={p.key}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, gap: 12 }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 8, backgroundColor: '#f3f4f6',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 18 }}>{p.icon}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, color: '#111' }}>{p.label}</Text>
                  <Switch
                    value={prefs[p.key] !== false}
                    onValueChange={(v) => togglePref(p.key, v)}
                    trackColor={{ true: '#22c55e' }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Sign Out / Delete */}
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
          <Row label="Sign Out" icon="🚪" onPress={handleSignOut} destructive />
          <Divider />
          <Row label="Delete Account" icon="🗑️" onPress={handleDeleteAccount} destructive />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
