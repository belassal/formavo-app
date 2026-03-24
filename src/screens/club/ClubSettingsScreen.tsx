import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenClub, listenClubMembers, updateClub } from '../../services/clubService';
import type { Club, ClubMember } from '../../services/clubService';
import { pickPhoto, uploadClubLogo } from '../../services/storageService';
import { B } from '../../constants/brand';

type Props = NativeStackScreenProps<TeamsStackParamList, 'ClubSettings'>;

export default function ClubSettingsScreen({ route }: Props) {
  const { clubId } = route.params;

  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [loadingClub, setLoadingClub] = useState(true);

  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    const unsubClub = listenClub(clubId, (c) => {
      setClub(c);
      if (c && !nameInput) {
        setNameInput(c.name);
      }
      setLoadingClub(false);
    });
    const unsubMembers = listenClubMembers(clubId, (m) => {
      setMembers(m);
    });
    return () => {
      unsubClub();
      unsubMembers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const handleLogoUpload = async () => {
    const uri = await pickPhoto();
    if (!uri) return;
    try {
      setUploadingLogo(true);
      const url = await uploadClubLogo(clubId, uri);
      await updateClub({ clubId, logoUrl: url });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Club name is required');
      return;
    }
    try {
      setSaving(true);
      await updateClub({ clubId, name: trimmed });
      Alert.alert('Saved', 'Club name updated.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (ts: any): string => {
    if (!ts) return '—';
    try {
      const date: Date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  if (loadingClub) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Club Name Card */}
        <View style={cardStyle}>
          <View style={cardHeaderStyle}>
            <Text style={cardTitleStyle}>Club Name</Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
          <View style={{ padding: 16, gap: 12 }}>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Club name"
              style={{
                borderWidth: 1,
                borderColor: '#e5e7eb',
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                color: '#111',
              }}
            />
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                backgroundColor: '#111',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Club Info Card */}
        <View style={cardStyle}>
          <View style={cardHeaderStyle}>
            <Text style={cardTitleStyle}>Club Info</Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />

          <View style={rowStyle}>
            <Text style={labelStyle}>Created</Text>
            <Text style={valueStyle}>{formatDate(club?.createdAt)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
          <View style={rowStyle}>
            <Text style={labelStyle}>Members</Text>
            <Text style={valueStyle}>{members.length}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
          <View style={[rowStyle, { gap: 12 }]}>
            {/* Current logo or placeholder */}
            {club?.logoUrl ? (
              <Image
                source={{ uri: club.logoUrl }}
                style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#f3f4f6' }}
                resizeMode="cover"
              />
            ) : (
              <View style={{
                width: 52, height: 52, borderRadius: 12,
                backgroundColor: B.navy,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: B.green, fontSize: 20, fontWeight: '900' }}>
                  {(club?.name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Club Logo</Text>
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                Shown on the Teams home screen
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleLogoUpload}
              disabled={uploadingLogo}
              style={{
                paddingVertical: 8, paddingHorizontal: 14,
                backgroundColor: B.green, borderRadius: 20,
                opacity: uploadingLogo ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                {uploadingLogo ? 'Uploading…' : club?.logoUrl ? 'Change' : 'Upload'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const cardStyle = {
  backgroundColor: '#fff',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  overflow: 'hidden' as const,
};

const cardHeaderStyle = {
  paddingHorizontal: 16,
  paddingVertical: 13,
};

const cardTitleStyle = {
  fontSize: 17,
  fontWeight: '700' as const,
  color: '#111',
};

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: 16,
  paddingVertical: 14,
};

const labelStyle = {
  fontSize: 15,
  color: '#374151',
};

const valueStyle = {
  fontSize: 15,
  fontWeight: '600' as const,
  color: '#111',
};
