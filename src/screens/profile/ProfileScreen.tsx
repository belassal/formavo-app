import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import messaging from '@react-native-firebase/messaging';
import { removeFCMToken } from '../../services/notificationService';

export default function ProfileScreen() {
  const user = auth().currentUser;

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const uid = auth().currentUser?.uid;
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
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.displayName ? user.displayName[0].toUpperCase() : '?'}
          </Text>
        </View>

        {/* Name & Email */}
        <Text style={styles.name}>{user?.displayName ?? 'Coach'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>

        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Name</Text>
            <Text style={styles.rowValue}>{user?.displayName ?? '—'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
          </View>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  email: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 2,
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowLabel: {
    fontSize: 15,
    color: '#111',
  },
  rowValue: {
    fontSize: 15,
    color: '#6b7280',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 16,
  },
  signOutButton: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ef4444',
  },
});
