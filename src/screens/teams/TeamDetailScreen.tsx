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
} from '../../services/playerService';
import { createMatch, listenMatches } from '../../services/matchService';
import { updateTeamMembership } from '../../services/playerService';

type TeamDetailRoute = RouteProp<TeamsStackParamList, 'TeamDetail'>;

export default function TeamDetailScreen() {
  const route = useRoute<TeamDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();

  const teamId = route.params.teamId;
  const teamName = route.params.teamName || 'Team';

  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  // Roster (team memberships)
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [memberships, setMemberships] = useState<any[]>([]);

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
  const [showEditPlayer, setShowEditPlayer] = useState(false);
  const [editingMember, setEditingMember] = useState<any | null>(null);

  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);


  // Create Match modal
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [dateISO, setDateISO] = useState('');
  const [location, setLocation] = useState('');

  // --- LISTENERS ---
  useEffect(() => {
    const unsubRoster = listenTeamMemberships(teamId, (rows) => {
      setMemberships(rows);
      setLoadingRoster(false);
    });

    const unsubMatches = listenMatches(teamId, (rows) => {
     const visible = (rows || []).filter((m: any) => !m.isDeleted);
      setMatches(visible);
      setLoadingMatches(false);
    });

    return () => {
      unsubRoster();
      unsubMatches();
    };
  }, [teamId]);

  useEffect(() => {
    const unsub = listenPlayerSearch(search, setSearchResults);
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [search]);

  // --- PLAYER ACTIONS ---
  const openAddPlayer = () => {
    setSearch('');
    setSearchResults([]);
    setNewName('');
    setNewNumber('');
    setNewPosition('');
    setShowAddPlayer(true);
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


  const confirmRemovePlayer = (m: any) => {
    Alert.alert(
      'Remove player?',
      `Remove ${m.playerName} from the team roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => toggleStatus(m), // this will mark inactive using your existing logic
        },
      ],
      { cancelable: true }
    );
  };

  const openEditPlayer = (m: any) => {
    setEditingMember(m);
    setEditName(m.playerName || '');
    setEditNumber(String(m.number || ''));
    setEditPosition(String(m.position || ''));
    setShowEditPlayer(true);
  };

  const closeEditPlayer = () => {
    setShowEditPlayer(false);
    setEditingMember(null);
    setEditName('');
    setEditNumber('');
    setEditPosition('');
  };


  const onSaveEditPlayer = async () => {
    if (!editingMember) return;

    const name = editName.trim();
    if (!name) {
      Alert.alert('Missing name', 'Player name is required.');
      return;
    }

    try {
      setSavingEdit(true);

      // Update membership fields (team roster)
      await updateTeamMembership({
        teamId,
        membershipId: editingMember.id,
        playerName: name,
        number: editNumber.trim(),
        position: editPosition.trim(),
      });

      closeEditPlayer();
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingEdit(false);
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

      // Optional: jump straight into the match roster screen
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

  const overallLoading = loadingRoster || loadingMatches;
  if (overallLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
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

      {memberships.length === 0 ? (
        <Text style={{ marginTop: 12, color: '#666' }}>
          No players yet. Tap “+ Player” to add your first player.
        </Text>
      ) : (
      <FlatList
        style={{ marginTop: 12, maxHeight: 260 }}
        data={memberships}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
        <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <TouchableOpacity
              onPress={() => openEditPlayer(item)}
              style={{ flex: 1 }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                {item.playerName}
                {item.number ? `  #${item.number}` : ''}
              </Text>
            </TouchableOpacity>

            {/* Edit icon */}
            <TouchableOpacity
              onPress={() => openEditPlayer(item)}
              style={{
                width: 20,
                height: 20,
                borderWidth: 1,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '900' }}>✎</Text>
            </TouchableOpacity>

            {/* Smaller X */}
            <TouchableOpacity
              onPress={() => confirmRemovePlayer(item)}
              style={{
                width: 20,
                height: 20,
                borderWidth: 1,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#b00020' }}>×</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ marginTop: 6, color: '#666' }}>
            {item.position ? `Pos: ${item.position} · ` : ''}
            {item.type || 'regular'} · {item.status || 'active'}
          </Text>
        </View>
        )}
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
          renderItem={({ item }) => {
            const status = String(item.status || 'scheduled');
            const home = Number.isFinite(item.homeScore) ? item.homeScore : 0;
            const away = Number.isFinite(item.awayScore) ? item.awayScore : 0;

            // label examples:
            // scheduled -> "Scheduled"
            // live -> "LIVE 2-1"
            // completed -> "FT 2-1"
            let rightLabel = 'Scheduled';
            if (status === 'live') rightLabel = `LIVE ${home}-${away}`;
            if (status === 'completed') rightLabel = `FT ${home}-${away}`;

            return (
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700' }}>vs {item.opponent || 'Opponent'}</Text>
                    <Text style={{ marginTop: 4, color: '#666' }}>
                      {item.dateISO || ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </Text>
                  </View>

                  {/* Status + score pill */}
                  <View
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderWidth: 1,
                      borderRadius: 999,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ fontWeight: '800', fontSize: 12 }}>{rightLabel}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}

        />
      )}

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

            <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 4 }} />

            <Text style={{ fontWeight: '700' }}>Or create new</Text>
            <TextInput
              placeholder="Player name (required)"
              value={newName}
              onChangeText={setNewName}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Number (optional)"
              value={newNumber}
              onChangeText={setNewNumber}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Position (optional)"
              value={newPosition}
              onChangeText={setNewPosition}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <TouchableOpacity onPress={() => setShowAddPlayer(false)} disabled={savingPlayer}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={createAndAdd}
                disabled={savingPlayer}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '700' }}>{savingPlayer ? 'Saving…' : 'Create + Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== EDIT PLAYER MODAL ===== */}
      <Modal visible={showEditPlayer} animationType="slide" transparent onRequestClose={closeEditPlayer}>
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
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Edit Player</Text>

            <TextInput
              placeholder="Player name (required)"
              value={editName}
              onChangeText={setEditName}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <TextInput
              placeholder="Number (optional)"
              value={editNumber}
              onChangeText={setEditNumber}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <TextInput
              placeholder="Position (optional)"
              value={editPosition}
              onChangeText={setEditPosition}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <TouchableOpacity onPress={closeEditPlayer} disabled={savingEdit}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onSaveEditPlayer}
                disabled={savingEdit}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '700' }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== CREATE MATCH MODAL ===== */}
      <Modal
        visible={showCreateMatch}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateMatch(false)}
      >
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
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Create Match</Text>

            <TextInput
              placeholder="Opponent (required)"
              value={opponent}
              onChangeText={setOpponent}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <TextInput
              placeholder="Date/time (required) — e.g., 2026-02-22 19:00"
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

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <TouchableOpacity onPress={() => setShowCreateMatch(false)} disabled={creatingMatch}>
                <Text style={{ padding: 10, color: '#444' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onCreateMatch}
                disabled={creatingMatch}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '700' }}>{creatingMatch ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

