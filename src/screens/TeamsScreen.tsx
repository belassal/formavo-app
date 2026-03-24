import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { B } from '../constants/brand';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { createTeam, listenMyTeams } from '../services/teamService';
import { listenMyClubId, listenClub, listenClubMembers, getOrCreateClubForUser, tagUserTeamsWithClubId } from '../services/clubService';
import type { Club, ClubMember } from '../services/clubService';
import type { TeamsStackParamList } from '../navigation/stacks/TeamsStack';

type TeamRow = {
  id: string;
  teamName?: string;
  role?: string;
};

// Try to load the logo — falls back gracefully if not saved yet
let logoSrc: any = null;
try { logoSrc = require('../assets/logo.png'); } catch { logoSrc = null; }

const S = {
  sectionContainer: {
    backgroundColor: B.card,
    borderRadius: 16,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: B.border,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: B.ink,
    letterSpacing: 0.2,
  },
  addBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: B.green,
    borderRadius: 20,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: B.border,
    marginLeft: 68,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  emptyRow: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: B.inkFaint,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: B.border,
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    color: B.ink,
  },
};

export default function TeamsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();
  const currentUser = auth().currentUser;
  const uid = useMemo(() => currentUser?.uid ?? null, []);

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Club state
  const [clubId, setClubId] = useState<string | null>(null);
  const [club, setClub] = useState<Club | null>(null);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);

  // Hide "Create Team" if the user is only ever a parent (no coach/admin role on any team)
  const canCreateTeam = useMemo(
    () => teams.length === 0 || teams.some((t) => t.role !== 'parent'),
    [teams]
  );

  // Determine if the user is a parent-only user (never show club section to parents)
  const isParentOnly = useMemo(
    () => teams.length > 0 && teams.every((t) => t.role === 'parent'),
    [teams]
  );

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

  // Listen to the user's club
  useEffect(() => {
    if (!uid) return;
    const unsub = listenMyClubId(uid, (id) => {
      setClubId(id);
    });
    return () => unsub();
  }, [uid]);

  // Auto-create club for existing coach users who don't have one yet
  useEffect(() => {
    if (!uid || isParentOnly) return;
    const user = auth().currentUser;
    if (!user) return;
    getOrCreateClubForUser({
      uid,
      email: user.email ?? '',
      displayName: user.displayName ?? user.email ?? 'Coach',
    }).catch((e) => console.warn('[TeamsScreen] getOrCreateClub error:', e));
  }, [uid, isParentOnly]);

  // Tag existing teams (created before club feature) with their clubId
  useEffect(() => {
    if (!uid || !clubId) return;
    tagUserTeamsWithClubId({ uid, clubId }).catch(console.warn);
  }, [uid, clubId]);

  useEffect(() => {
    if (!clubId) {
      setClub(null);
      setClubMembers([]);
      return;
    }
    const unsubClub = listenClub(clubId, (c) => setClub(c));
    const unsubMembers = listenClubMembers(clubId, (m) => setClubMembers(m));
    return () => {
      unsubClub();
      unsubMembers();
    };
  }, [clubId]);

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
      await createTeam({
        name: trimmed,
        ageGroup: ageGroup.trim(),
        season: season.trim(),
        createdBy: uid,
        createdByEmail: currentUser?.email ?? '',
        createdByName: currentUser?.displayName ?? currentUser?.email ?? '',
      });
      setShowCreate(false);
    } catch (e: any) {
      Alert.alert('Create Team Failed', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  // Find the viewer's role in the club
  const viewerClubRole = useMemo(() => {
    if (!uid || !clubMembers.length) return undefined;
    const me = clubMembers.find((m) => m.id === uid);
    return me?.role;
  }, [uid, clubMembers]);

  const staffCount = clubMembers.length;
  const teamCount = teams.filter((t) => !isParentOnly || t.role !== 'parent').length;

  const createTeamModal = (
    <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => { Keyboard.dismiss(); setShowCreate(false); }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Create Team</Text>
              <TextInput placeholder="Team name (required)" value={name} onChangeText={setName} style={S.input} returnKeyType="next" />
              <TextInput placeholder="Age group (optional) — e.g., U12" value={ageGroup} onChangeText={setAgeGroup} style={S.input} returnKeyType="next" />
              <TextInput placeholder="Season (optional) — e.g., 2026 Winter" value={season} onChangeText={setSeason} style={S.input} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowCreate(false); }} disabled={creating}>
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
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );

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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        {/* Compact wordmark header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16,
          backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: B.border }}>
          {logoSrc ? (
            <Image source={logoSrc} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: B.navy,
              alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: B.green, fontSize: 15, fontWeight: '900' }}>F</Text>
            </View>
          )}
          <Text style={{ fontSize: 20, fontWeight: '900', color: B.navy, letterSpacing: 1 }}>FORMAVO</Text>
        </View>

        <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 14 }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: B.ink }}>Welcome to Formavo</Text>
            <Text style={{ fontSize: 15, color: B.inkFaint, marginTop: 6, textAlign: 'center', lineHeight: 22 }}>
              You're not part of any team yet.{'\n'}What would you like to do?
            </Text>
          </View>

          <TouchableOpacity
            onPress={openCreate}
            activeOpacity={0.85}
            style={{ backgroundColor: B.green, borderRadius: 14, padding: 20, gap: 4 }}
          >
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>⚽  Create a Team</Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
              For coaches — set up your roster, matches and lineups
            </Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: B.card, borderRadius: 14, borderWidth: 1, borderColor: B.border, padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: B.ink }}>Waiting for an invite?</Text>
            <Text style={{ fontSize: 13, color: B.inkMid, marginTop: 4, lineHeight: 20 }}>
              If a coach invited you as a parent or staff member, make sure you signed up using the{' '}
              <Text style={{ fontWeight: '700', color: B.ink }}>same email address</Text> that the invite was sent to.
              {'\n\n'}
              Your team will appear here automatically once the invite is accepted.
            </Text>
          </View>
        </View>

        {createTeamModal}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* ===== COMPACT WORDMARK HEADER ===== */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16,
          backgroundColor: '#fff',
          borderBottomWidth: 1, borderBottomColor: B.border,
        }}>
          {logoSrc ? (
            <Image source={logoSrc} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
          ) : (
            <View style={{
              width: 36, height: 36, borderRadius: 9,
              backgroundColor: B.navy,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: B.green, fontSize: 15, fontWeight: '900' }}>F</Text>
            </View>
          )}
          <View>
            <Text style={{ fontSize: 20, fontWeight: '900', color: B.navy, letterSpacing: 1 }}>
              FORMAVO
            </Text>
            <Text style={{ fontSize: 11, color: B.inkFaint, fontWeight: '500', letterSpacing: 0.5, marginTop: 1 }}>
              Team Management
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 14 }}>

        {/* Club Section — only when user has multiple teams OR has staff beyond themselves */}
        {!isParentOnly && clubId && club && (staffCount > 1 || teamCount > 1) && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: B.border }}>
            {/* Club name + subtitle */}
            <View style={{ padding: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 10,
                backgroundColor: B.navy,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: B.green, fontSize: 15, fontWeight: '900' }}>
                  {club.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: B.ink }}>{club.name}</Text>
                <Text style={{ fontSize: 12, color: B.inkFaint, marginTop: 1 }}>
                  {staffCount} staff · {teamCount} {teamCount === 1 ? 'team' : 'teams'}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: B.border }}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ClubPlayers', { clubId, clubName: club.name })}
                activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: 1, borderRightColor: B.border }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: B.inkMid }}>👤 Players</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('StaffList', { clubId, clubName: club.name, viewerRole: viewerClubRole })}
                activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 13, alignItems: 'center', borderRightWidth: 1, borderRightColor: B.border }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: B.inkMid }}>🪪 Staff</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ClubSettings', { clubId, clubName: club.name })}
                activeOpacity={0.7}
                style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: B.inkMid }}>⚙️ Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* My Teams */}
        <View style={S.sectionContainer}>
          {/* Header */}
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>My Teams</Text>
            {canCreateTeam && (
              <TouchableOpacity onPress={openCreate} style={S.addBtn}>
                <Text style={S.addBtnText}>+ Team</Text>
              </TouchableOpacity>
            )}
          </View>

          {teams.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={S.divider} />}
              <TouchableOpacity
                onPress={() => navigation.navigate('TeamDetail', { teamId: item.id, teamName: item.teamName, role: item.role })}
                style={S.row}
                activeOpacity={0.7}
              >
                {/* Team initial avatar — light green surface */}
                <View style={{
                  width: 44, height: 44, borderRadius: 12,
                  backgroundColor: B.greenSurface,
                  borderWidth: 1, borderColor: B.greenBorder,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 12,
                }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: B.greenGlow }}>
                    {(item.teamName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: B.ink }}>
                    {item.teamName || item.id}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: B.inkFaint, textTransform: 'capitalize' }}>
                    {item.role || 'member'}
                  </Text>
                </View>
                <Text style={{ fontSize: 20, color: '#c7c7cc' }}>›</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        </View>{/* end paddingHorizontal wrapper */}
      </ScrollView>

      {createTeamModal}
    </SafeAreaView>
  );
}
