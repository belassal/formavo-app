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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import {
  addPlayerToTeam,
  createGlobalPlayer,
  listenPlayerSearch,
  listenTeamMemberships,
  removePlayerFromTeam,
  restorePlayerToTeam,
  sortMembershipsByNumber,
  updateTeamMembershipMeta,
  type MembershipStatus,
} from '../../services/playerService';
import { createMatch, listenMatches } from '../../services/matchService';
import {
  inviteCoach,
  softDeleteTeam,
  updateTeamName,
  type TeamRole,
} from '../../services/teamService';

type TeamDetailRoute = RouteProp<TeamsStackParamList, 'TeamDetail'>;

function norm(s: string) {
  return (s || '').trim();
}

export default function TeamDetailScreen() {
  const route = useRoute<TeamDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();

  const teamId = route.params.teamId;
  const initialTeamName = route.params.teamName || 'Team';

  const [teamName, setTeamName] = useState(initialTeamName);

  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  // Tabs
  const [tab, setTab] = useState<MembershipStatus>('active');

  // Roster (team memberships)
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [membershipsRaw, setMembershipsRaw] = useState<any[]>([]);

  // Matches
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);

  // Add Player modal
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [savingPlayer, setSavingPlayer] = useState(false);

  // Edit Player modal
  const [showEdit, setShowEdit] = useState(false);
  const [editPlayer, setEditPlayer] = useState<any | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Create Match modal
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [dateISO, setDateISO] = useState('');
  const [location, setLocation] = useState('');

  // ===== Team Settings (v0.3) =====
  const [showTeamSettings, setShowTeamSettings] = useState(false);

  // Edit team name
  const [editTeamName, setEditTeamName] = useState(teamName);
  const [savingTeamName, setSavingTeamName] = useState(false);

  // Invite coach
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('assistant');
  const [inviting, setInviting] = useState(false);

  // Delete team confirm
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deletingTeam, setDeletingTeam] = useState(false);

  // --- LISTENERS ---
  useEffect(() => {
    setLoadingRoster(true);
    const unsubRoster = listenTeamMemberships(
      teamId,
      (rows) => {
        setMembershipsRaw(rows);
        setLoadingRoster(false);
      },
      tab
    );

    const unsubMatches = listenMatches(teamId, (rows) => {
      // optional: hide deleted matches if you started soft delete
      const visible = (rows || []).filter((m: any) => !m.isDeleted);
      setMatches(visible);
      setLoadingMatches(false);
    });

    return () => {
      unsubRoster();
      unsubMatches();
    };
  }, [teamId, tab]);

  useEffect(() => {
    const unsub = listenPlayerSearch(search, setSearchResults);
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [search]);

  const memberships = useMemo(
    () => sortMembershipsByNumber(membershipsRaw),
    [membershipsRaw]
  );

  // --- PLAYER ACTIONS ---
  const openAddPlayer = () => {
    setSearch('');
    setSearchResults([]);
    setNewName('');
    setNewNumber('');
    setNewPosition('');
    setShowAddPlayer(true);
  };

  const openEditPlayer = (m: any) => {
    setEditPlayer(m);
    setEditNumber(String(m.number || ''));
    setEditPosition(String(m.position || ''));
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!editPlayer) return;
    try {
      setSavingEdit(true);
      await updateTeamMembershipMeta({
        teamId,
        playerId: editPlayer.id,
        number: editNumber,
        position: editPosition,
      });
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingEdit(false);
    }
  };

  const addExisting = async (p: any) => {
    try {
      setSavingPlayer(true);
      await addPlayerToTeam({
        teamId,
        playerId: p.id,
        playerName: p.name,
        number: p.number || '',
        position: p.position || '',
        type: 'regular',
        status: 'active',
      });
      setShowAddPlayer(false);
    } catch (e: any) {
      Alert.alert('Add Player Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingPlayer(false);
    }
  };

  const createAndAdd = async () => {
    if (!uid) {
      Alert.alert('No session', 'User uid is missing.');
      return;
    }
    const name = newName.trim();
    if (!name) {
      Alert.alert('Missing name', 'Enter player name.');
      return;
    }

    try {
      setSavingPlayer(true);
      const playerId = await createGlobalPlayer({
        name,
        number: newNumber,
        position: newPosition,
        createdBy: uid,
      });

      await addPlayerToTeam({
        teamId,
        playerId,
        playerName: name,
        number: newNumber.trim(),
        position: newPosition.trim(),
        type: 'regular',
        status: 'active',
      });

      setShowAddPlayer(false);
    } catch (e: any) {
      Alert.alert('Create Player Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingPlayer(false);
    }
  };

  const toggleStatus = async (m: any) => {
    const isActive = (m.status || 'active') === 'active';
    try {
      if (isActive) {
        await removePlayerFromTeam({ teamId, playerId: m.id });
      } else {
        await restorePlayerToTeam({ teamId, playerId: m.id });
      }
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message ?? 'Unknown error');
    }
  };

  // --- MATCH ACTIONS ---
  const openCreateMatch = () => {
    setOpponent('');
    setDateISO('');
    setLocation('');
    setShowCreateMatch(true);
  };

  const onCreateMatch = async () => {
    const opp = opponent.trim();
    const dt = dateISO.trim();

    if (!opp) {
      Alert.alert('Missing Opponent', 'Please enter opponent name.');
      return;
    }
    if (!dt) {
      Alert.alert('Missing Date', 'Please enter a date/time (ex: 2026-02-22 19:00).');
      return;
    }

    try {
      setCreatingMatch(true);
      const matchId = await createMatch({
        teamId,
        opponent: opp,
        dateISO: dt,
        location: location.trim(),
      });

      setShowCreateMatch(false);

      navigation.navigate('MatchDetail', {
        teamId,
        matchId,
        title: `${teamName} vs ${opp}`,
      });
    } catch (e: any) {
      Alert.alert('Create Match Failed', e?.message ?? 'Unknown error');
    } finally {
      setCreatingMatch(false);
    }
  };

  // ===== Team Settings actions (v0.3) =====
  const openTeamSettings = () => {
    setEditTeamName(teamName);
    setInviteEmail('');
    setInviteRole('assistant');
    setConfirmDeleteText('');
    setShowTeamSettings(true);
  };

  const onSaveTeamName = async () => {
    if (!uid) return Alert.alert('No session', 'User uid is missing.');
    const name = norm(editTeamName);
    if (!name) return Alert.alert('Missing name', 'Team name is required.');

    try {
      setSavingTeamName(true);
      await updateTeamName({
        teamId,
        newName: name,
        updatedBy: uid,
      });
      setTeamName(name);
      setShowTeamSettings(false);
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingTeamName(false);
    }
  };

  const onInvite = async () => {
    if (!uid) return Alert.alert('No session', 'User uid is missing.');
    const email = norm(inviteEmail).toLowerCase();
    if (!email || !email.includes('@')) {
      return Alert.alert('Invalid email', 'Enter a valid email address.');
    }

    try {
      setInviting(true);
      await inviteCoach({
        teamId,
        inviteEmail: email,
        invitedBy: uid,
        role: inviteRole,
      });
      Alert.alert('Invite Sent', `${email} was invited as ${inviteRole}.`);
      setInviteEmail('');
    } catch (e: any) {
      Alert.alert('Invite Failed', e?.message ?? 'Unknown error');
    } finally {
      setInviting(false);
    }
  };

  const onDeleteTeam = async () => {
    if (!uid) return Alert.alert('No session', 'User uid is missing.');

    const typed = norm(confirmDeleteText);
    if (typed !== teamName) {
      return Alert.alert('Not matched', 'Type the exact team name to confirm delete.');
    }

    try {
      setDeletingTeam(true);
      await softDeleteTeam({ teamId, deletedBy: uid });
      setShowTeamSettings(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Delete Failed', e?.message ?? 'Unknown error');
    } finally {
      setDeletingTeam(false);
    }
  };

  const overallLoading = loadingRoster || loadingMatches;
  if (overallLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const tabBtn = (label: string, value: MembershipStatus) => (
    <TouchableOpacity
      onPress={() => setTab(value)}
      style={{
        flex: 1,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: tab === value ? '#111' : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '700', color: tab === value ? 'white' : '#111' }}>{label}</Text>
    </TouchableOpacity>
  );

  const rolePill = (role: TeamRole, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 999,
        backgroundColor: active ? '#111' : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '800', fontSize: 12, color: active ? 'white' : '#111' }}>
        {role}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {/* ===== TEAM HEADER (v0.3) ===== */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '900' }}>{teamName}</Text>
            <Text style={{ marginTop: 4, color: '#666' }}>
              {membershipsRaw.length} players · {matches.length} matches
            </Text>
          </View>

          <TouchableOpacity
            onPress={openTeamSettings}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 }}
          >
            <Text style={{ fontWeight: '800' }}>Team</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== ROSTER HEADER ===== */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Roster</Text>

        <TouchableOpacity
          onPress={openAddPlayer}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 }}
        >
          <Text style={{ fontWeight: '600' }}>+ Player</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        {tabBtn('Active', 'active')}
        {tabBtn('Inactive', 'inactive')}
      </View>

      {memberships.length === 0 ? (
        <Text style={{ marginTop: 12, color: '#666' }}>
          {tab === 'active'
            ? 'No active players yet. Tap “+ Player” to add your first player.'
            : 'No inactive players.'}
        </Text>
      ) : (
        <FlatList
          style={{ marginTop: 12, maxHeight: 320 }}
          data={memberships}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isActive = (item.status || 'active') === 'active';
            return (
              <TouchableOpacity
                onPress={() => openEditPlayer(item)}
                style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700' }}>
                  {item.playerName}
                  {item.number ? `  #${item.number}` : ''}
                </Text>

                <Text style={{ marginTop: 4, color: '#666' }}>
                  {item.position ? `Pos: ${item.position} · ` : ''}
                  {item.type || 'regular'} · {item.status || 'active'}
                </Text>

                <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => toggleStatus(item)}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 }}
                  >
                    <Text style={{ fontWeight: '700' }}>
                      {isActive ? 'Mark inactive' : 'Restore'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openEditPlayer(item)}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10 }}
                  >
                    <Text style={{ fontWeight: '700' }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ===== MATCHES HEADER ===== */}
      <View style={{ height: 14 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Matches</Text>

        <TouchableOpacity
          onPress={openCreateMatch}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 }}
        >
          <Text style={{ fontWeight: '600' }}>+ Match</Text>
        </TouchableOpacity>
      </View>

      {matches.length === 0 ? (
        <Text style={{ marginTop: 12, color: '#666' }}>No matches yet. Tap “+ Match” to create one.</Text>
      ) : (
        <FlatList
          style={{ marginTop: 12 }}
          data={matches}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('MatchDetail', {
                  teamId,
                  matchId: item.id,
                  title: `${teamName} vs ${item.opponent || 'Opponent'}`,
                })
              }
              style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700' }}>vs {item.opponent || 'Opponent'}</Text>
              <Text style={{ marginTop: 4, color: '#666' }}>
                {item.dateISO || ''}
                {item.location ? ` · ${item.location}` : ''}
                {item.status ? ` · ${item.status}` : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ===== TEAM SETTINGS MODAL (v0.3) ===== */}
      <Modal visible={showTeamSettings} animationType="slide" transparent onRequestClose={() => setShowTeamSettings(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 14,
              maxHeight: '85%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900' }}>Team Settings</Text>

            {/* Edit team name */}
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontWeight: '800' }}>Edit team name</Text>
              <TextInput
                placeholder="Team name"
                value={editTeamName}
                onChangeText={setEditTeamName}
                style={{ borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 10 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={onSaveTeamName}
                  disabled={savingTeamName}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
                >
                  <Text style={{ fontWeight: '900' }}>{savingTeamName ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Invite coach */}
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontWeight: '800' }}>Invite member</Text>

              <TextInput
                placeholder="Email address"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={{ borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 10 }}
              />

              <Text style={{ marginTop: 10, fontWeight: '800' }}>Role</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                {rolePill('coach', inviteRole === 'coach', () => setInviteRole('coach'))}
                {rolePill('assistant', inviteRole === 'assistant', () => setInviteRole('assistant'))}
                {rolePill('parent', inviteRole === 'parent', () => setInviteRole('parent'))}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity
                  onPress={onInvite}
                  disabled={inviting}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
                >
                  <Text style={{ fontWeight: '900' }}>{inviting ? 'Inviting…' : 'Send Invite'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Delete team */}
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12 }}>
              <Text style={{ fontWeight: '900', color: '#b00020' }}>Danger zone</Text>
              <Text style={{ marginTop: 6, color: '#666' }}>
                Type <Text style={{ fontWeight: '900' }}>{teamName}</Text> to enable delete.
              </Text>

              <TextInput
                placeholder="Type team name to confirm"
                value={confirmDeleteText}
                onChangeText={setConfirmDeleteText}
                style={{ borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 10 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity
                  onPress={onDeleteTeam}
                  disabled={deletingTeam || norm(confirmDeleteText) !== teamName}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderRadius: 12,
                    opacity: deletingTeam || norm(confirmDeleteText) !== teamName ? 0.4 : 1,
                  }}
                >
                  <Text style={{ fontWeight: '900', color: '#b00020' }}>
                    {deletingTeam ? 'Deleting…' : 'Delete Team'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setShowTeamSettings(false)}>
                <Text style={{ padding: 10, color: '#444', fontWeight: '800' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== EDIT PLAYER MODAL ===== */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700' }}>
              Edit {editPlayer?.playerName || 'Player'}
            </Text>

            <TextInput
              placeholder="Number (ex: 10)"
              value={editNumber}
              onChangeText={setEditNumber}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
              keyboardType="number-pad"
            />

            <TextInput
              placeholder="Position (ex: CM)"
              value={editPosition}
              onChangeText={setEditPosition}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowEdit(false)} disabled={savingEdit}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={saveEdit} disabled={savingEdit}>
                <Text style={{ padding: 10, fontWeight: '800' }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== ADD PLAYER MODAL ===== */}
      <Modal visible={showAddPlayer} animationType="slide" transparent onRequestClose={() => setShowAddPlayer(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Add Player</Text>

            <Text style={{ fontWeight: '700' }}>Search existing (global)</Text>
            <TextInput
              placeholder="Type a name…"
              value={search}
              onChangeText={setSearch}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            {search.trim().length > 0 && (
              <View style={{ maxHeight: 180 }}>
                {searchResults.length === 0 ? (
                  <Text style={{ color: '#666', marginTop: 6 }}>No matches yet.</Text>
                ) : (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(i) => i.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => addExisting(item)}
                        disabled={savingPlayer}
                        style={{ borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 }}
                      >
                        <Text style={{ fontWeight: '700' }}>
                          {item.name}
                          {item.number ? `  #${item.number}` : ''}
                        </Text>
                        <Text style={{ color: '#666', marginTop: 2 }}>
                          {item.position ? `Pos: ${item.position}` : ' '}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )}

            <View style={{ height: 8 }} />
            <Text style={{ fontWeight: '700' }}>Or create new</Text>

            <TextInput
              placeholder="Player name"
              value={newName}
              onChangeText={setNewName}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                placeholder="Number"
                value={newNumber}
                onChangeText={setNewNumber}
                style={{ flex: 1, borderWidth: 1, padding: 12, borderRadius: 12 }}
                keyboardType="number-pad"
              />
              <TextInput
                placeholder="Position"
                value={newPosition}
                onChangeText={setNewPosition}
                style={{ flex: 1, borderWidth: 1, padding: 12, borderRadius: 12 }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowAddPlayer(false)} disabled={savingPlayer}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={createAndAdd} disabled={savingPlayer}>
                <Text style={{ padding: 10, fontWeight: '800' }}>
                  {savingPlayer ? 'Saving…' : 'Create & Add'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== CREATE MATCH MODAL ===== */}
      <Modal visible={showCreateMatch} animationType="slide" transparent onRequestClose={() => setShowCreateMatch(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Create Match</Text>

            <TextInput
              placeholder="Opponent"
              value={opponent}
              onChangeText={setOpponent}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder='Date/time (ex: "2026-02-22 19:00")'
              value={dateISO}
              onChangeText={setDateISO}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Location (optional)"
              value={location}
              onChangeText={setLocation}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowCreateMatch(false)} disabled={creatingMatch}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onCreateMatch} disabled={creatingMatch}>
                <Text style={{ padding: 10, fontWeight: '800' }}>
                  {creatingMatch ? 'Creating…' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
