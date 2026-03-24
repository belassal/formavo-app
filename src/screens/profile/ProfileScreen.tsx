import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useFocusEffect } from '@react-navigation/native';
import Avatar from '../../components/Avatar';
import { getUserProfile, updateUserProfile, type UserProfile } from '../../services/userService';
import { pickPlayerPhoto, uploadUserAvatar } from '../../services/storageService';
import messaging from '@react-native-firebase/messaging';
import { removeFCMToken } from '../../services/notificationService';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
      {children}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  multiline?: boolean;
}) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
        <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280', paddingTop: multiline ? 2 : 0 }}>
          {label}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor="#d1d5db"
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'words'}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={{
            flex: 1,
            fontSize: 15,
            color: '#111',
            minHeight: multiline ? 80 : undefined,
            textAlignVertical: multiline ? 'top' : 'auto',
          }}
        />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const user = auth().currentUser;
  const uid = user?.uid ?? null;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const displayName = [firstName, lastName].filter(Boolean).join(' ') || user?.email || '?';

  const loadProfile = useCallback(async () => {
    if (!uid) return;
    try {
      const p = await getUserProfile(uid);
      if (p) {
        setProfile(p);
        // Split displayName into first/last if firstName not stored yet
        setFirstName(p.firstName ?? (p.displayName?.split(' ')[0] ?? user?.displayName?.split(' ')[0] ?? ''));
        setLastName(p.lastName ?? (p.displayName?.split(' ').slice(1).join(' ') ?? user?.displayName?.split(' ').slice(1).join(' ') ?? ''));
        setPhone(p.phone ?? '');
        setBio(p.bio ?? '');
        setPhotoUrl(p.photoUrl ?? user?.photoURL ?? null);
      } else {
        // Seed from Firebase Auth
        const name = user?.displayName ?? '';
        setFirstName(name.split(' ')[0] ?? '');
        setLastName(name.split(' ').slice(1).join(' ') ?? '');
        setPhotoUrl(user?.photoURL ?? null);
      }
    } catch (e) {
      console.warn('[ProfileScreen] load error', e);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handlePickPhoto = async () => {
    if (!uid) return;
    try {
      const uri = await pickPlayerPhoto();
      if (!uri) return;
      setUploadingPhoto(true);
      const url = await uploadUserAvatar(uid, uri);
      setPhotoUrl(url);
      await updateUserProfile({ uid, photoUrl: url });
    } catch (e: any) {
      Alert.alert('Photo Error', e?.message ?? 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!uid) return;
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert('Name required', 'Please enter your first or last name.');
      return;
    }
    try {
      setSaving(true);
      await updateUserProfile({
        uid,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
      });
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1, backgroundColor: '#f2f2f7' }} contentContainerStyle={{ padding: 16, gap: 20 }}>

        {/* ── Photo ── */}
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
            <View>
              <Avatar name={displayName} avatarUrl={photoUrl} size={90} />
              <View style={{
                position: 'absolute', bottom: 0, right: 0,
                backgroundColor: '#111', borderRadius: 999,
                width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#f2f2f7',
              }}>
                {uploadingPhoto
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontSize: 14 }}>✎</Text>
                }
              </View>
            </View>
          </TouchableOpacity>
          <Text style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>Tap to change photo</Text>
        </View>

        {/* ── Personal info ── */}
        <View>
          <SectionLabel>PERSONAL INFO</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field label="First Name" value={firstName} onChangeText={setFirstName} />
            <Field label="Last Name" value={lastName} onChangeText={setLastName} />
          </View>
        </View>

        {/* ── Contact ── */}
        <View>
          <SectionLabel>CONTACT</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Email</Text>
                <Text style={{ flex: 1, fontSize: 15, color: '#9ca3af' }}>{user?.email ?? '—'}</Text>
              </View>
            </View>
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* ── Bio ── */}
        <View>
          <SectionLabel>BIO</SectionLabel>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            <Field
              label="Bio"
              value={bio}
              onChangeText={setBio}
              placeholder="Tell your team a little about yourself…"
              multiline
              autoCapitalize="sentences"
            />
          </View>
        </View>

        {/* ── Save ── */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{ backgroundColor: '#111', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        {/* ── Sign Out ── */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            backgroundColor: '#fff', borderRadius: 14,
            borderWidth: 1, borderColor: '#e5e7eb',
            paddingVertical: 16, alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#ef4444' }}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
