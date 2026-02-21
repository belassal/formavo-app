import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { createTeam, listenMyTeams } from '../services/teamService';
import type { TeamsStackParamList } from '../navigation/stacks/TeamsStack';

type TeamRow = {
  id: string; // teamId
  teamName?: string;
  role?: string;
};

export default function TeamsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();

  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [season, setSeason] = useState('');

  useEffect(() => {
    if (!uid) {
      setError('No user session found (uid is null).');
      setLoading(false);
      return;
    }

    const unsub = listenMyTeams(uid, (rows) => {
      setTeams(rows as TeamRow[]);
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  const openCreate = () => {
    setName('');
    setAgeGroup('');
    setSeason('');
    setShowCreate(true);
  };

  const onCreate = async () => {
    if (!uid) return;

    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Missing Team Name', 'Please enter a team name.');
      return;
    }

    try {
      setCreating(true);
      await createTeam({
        name: trimmed,
        ageGroup: ageGroup.trim(),
        season: season.trim(),
        createdBy: uid,
      });
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert('Create Team Failed', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Teams</Text>
        <Text style={{ marginTop: 10, color: 'red' }}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>My Teams</Text>

        <TouchableOpacity
          onPress={openCreate}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderRadius: 10,
          }}
        >
          <Text style={{ fontWeight: '600' }}>+ Team</Text>
        </TouchableOpacity>
      </View>

      {teams.length === 0 ? (
        <Text style={{ marginTop: 16, color: '#666' }}>
          No teams yet. Tap “+ Team” to create your first team.
        </Text>
      ) : (
        <FlatList
          style={{ marginTop: 12 }}
          data={teams}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('TeamDetail', {
                  teamId: item.id,
                  teamName: item.teamName,
                })
              }
              style={{
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700' }}>{item.teamName || item.id}</Text>
              <Text style={{ marginTop: 4, color: '#666' }}>Role: {item.role || 'member'}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Create Team</Text>

            <TextInput
              placeholder="Team name (required)"
              value={name}
              onChangeText={setName}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Age group (optional) — e.g., U12"
              value={ageGroup}
              onChangeText={setAgeGroup}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Season (optional) — e.g., 2026 Winter"
              value={season}
              onChangeText={setSeason}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <TouchableOpacity onPress={() => setShowCreate(false)} disabled={creating}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onCreate}
                disabled={creating}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontWeight: '700' }}>{creating ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

