import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  id: string;
  teamName?: string;
  role?: string;
};

const S = {
  sectionContainer: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#111',
  },
  addBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#111',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    color: '#111',
  },
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
      setError('No user session found.');
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
    setName(''); setAgeGroup(''); setSeason('');
    setShowCreate(true);
  };

  const onCreate = async () => {
    if (!uid) return;
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Missing Team Name', 'Please enter a team name.'); return; }
    try {
      setCreating(true);
      await createTeam({ name: trimmed, ageGroup: ageGroup.trim(), season: season.trim(), createdBy: uid });
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert('Create Team Failed', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: '#f2f2f7' }}>
        <Text style={{ marginTop: 10, color: 'red' }}>{error}</Text>
      </SafeAreaView>
    );
  }

  // Empty state — shown when user has no teams at all
  if (teams.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
          {/* Welcome header */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#111' }}>Welcome to Formavo</Text>
            <Text style={{ fontSize: 15, color: '#9ca3af', marginTop: 6, textAlign: 'center', lineHeight: 22 }}>
              You're not part of any team yet.{'\n'}What would you like to do?
            </Text>
          </View>

          {/* Option 1 — Create a team (coaches) */}
          <TouchableOpacity
            onPress={openCreate}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#111',
              borderRadius: 14,
              padding: 20,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>⚽  Create a Team</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              For coaches — set up your roster, matches and lineups
            </Text>
          </TouchableOpacity>

          {/* Option 2 — Waiting for invite (parents / new members) */}
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 20,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>📩  Waiting for an invite?</Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 20 }}>
              If a coach invited you as a parent or staff member, make sure you signed up using the{' '}
              <Text style={{ fontWeight: '700', color: '#111' }}>same email address</Text> that the invite was sent to.
              {'\n\n'}
              Your team will appear here automatically once the invite is accepted.
            </Text>
          </View>
        </View>

        {/* CREATE TEAM MODAL */}
        <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Create Team</Text>
              <TextInput placeholder="Team name (required)" value={name} onChangeText={setName} style={S.input} />
              <TextInput placeholder="Age group (optional) — e.g., U12" value={ageGroup} onChangeText={setAgeGroup} style={S.input} />
              <TextInput placeholder="Season (optional) — e.g., 2026 Winter" value={season} onChangeText={setSeason} style={S.input} />
              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <TouchableOpacity onPress={() => setShowCreate(false)} disabled={creating}>
                  <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onCreate}
                  disabled={creating}
                  style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}
                >
                  <Text style={{ fontWeight: '700', color: '#fff' }}>{creating ? 'Creating…' : 'Create'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <View style={{ padding: 16 }}>
        <View style={S.sectionContainer}>
          {/* Header */}
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>My Teams</Text>
            <TouchableOpacity onPress={openCreate} style={S.addBtn}>
              <Text style={S.addBtnText}>+ Team</Text>
            </TouchableOpacity>
          </View>

          {teams.map((item) => (
            <View key={item.id}>
              <View style={S.divider} />
              <TouchableOpacity
                onPress={() => navigation.navigate('TeamDetail', { teamId: item.id, teamName: item.teamName, role: item.role })}
                style={S.row}
                activeOpacity={0.6}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                    {item.teamName || item.id}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 13, color: '#9ca3af' }}>
                    {item.role || 'member'}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: '#c7c7cc' }}>›</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      {/* CREATE TEAM MODAL */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Create Team</Text>
            <TextInput placeholder="Team name (required)" value={name} onChangeText={setName} style={S.input} />
            <TextInput placeholder="Age group (optional) — e.g., U12" value={ageGroup} onChangeText={setAgeGroup} style={S.input} />
            <TextInput placeholder="Season (optional) — e.g., 2026 Winter" value={season} onChangeText={setSeason} style={S.input} />
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowCreate(false)} disabled={creating}>
                <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onCreate}
                disabled={creating}
                style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>{creating ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}