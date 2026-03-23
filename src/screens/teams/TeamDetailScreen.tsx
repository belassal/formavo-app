import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Avatar from '../../components/Avatar';
import auth from '@react-native-firebase/auth';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import {
  addPlayerToTeam,
  createGlobalPlayer,
  listenPlayerSearch,
  listenTeamMemberships,
  updateTeamMembership,
} from '../../services/playerService';
import { createMatch, listenMatches } from '../../services/matchService';
import { inviteCoach, inviteParent, resendParentInvite, listenTeamMembers } from '../../services/teamService';
import { pickPlayerPhoto, uploadPlayerAvatar, storageReady, imagePickerReady } from '../../services/storageService';
import FormationPickerModal, { FormationPickerResult } from '../matches/components/FormationPickerModal';
import DateTimePickerModal, { formatDateISO } from '../../components/DateTimePickerModal';
import {
  listenAnnouncements,
  postAnnouncement,
  deleteAnnouncement,
  type Announcement,
} from '../../services/announcementService';
import {
  listenSeasons,
  getOrCreateDefaultSeason,
  setActiveSeasonId,
  type Season,
} from '../../services/seasonService';
import { db } from '../../services/firebase';
import SeasonPickerModal from './components/SeasonPickerModal';
import NewSeasonModal from './components/NewSeasonModal';

type TeamDetailRoute = RouteProp<TeamsStackParamList, 'TeamDetail'>;

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
    paddingVertical: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#111',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#9ca3af',
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
    paddingVertical: 13,
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
  chevron: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '700' as const,
  },
};

const ICON_BTN = { width: 28, height: 28, alignItems: 'center' as const, justifyContent: 'center' as const };
const ICON_HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const ICON_EDIT_TEXT = { fontSize: 16, color: '#9ca3af' };
const ICON_X_TEXT = { fontSize: 20, fontWeight: '700' as const, color: '#ef4444', lineHeight: 22 };

export default function TeamDetailScreen() {
  const route = useRoute<TeamDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();
  const teamId = route.params.teamId;
  const teamName = route.params.teamName || 'Team';
  const isParent = route.params.role === 'parent';
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  // Season state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [viewingSeasonId, setViewingSeasonId] = useState<string | null>(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);

  // Track whether we've already bootstrapped the active season for this team
  const seasonBootstrappedRef = useRef(false);

  // Accordion open/close
  const [rosterOpen, setRosterOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [parentsOpen, setParentsOpen] = useState(false);
  const [announcementsOpen, setAnnouncementsOpen] = useState(true);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showPostAnnouncement, setShowPostAnnouncement] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  // Coaches / members
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Invite Parent modal
  const [showInviteParent, setShowInviteParent] = useState(false);
  const [inviteParentEmail, setInviteParentEmail] = useState('');
  const [inviteParentPlayerId, setInviteParentPlayerId] = useState('');
  const [inviteParentPlayerName, setInviteParentPlayerName] = useState('');
  const [savingParentInvite, setSavingParentInvite] = useState(false);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'assistant' | 'coach'>('assistant');
  const [savingInvite, setSavingInvite] = useState(false);

  // Roster
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
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Create Match modal
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [creatingMatch, setCreatingMatch] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [dateISO, setDateISO] = useState('');
  const [location, setLocation] = useState('');
  const [showFormationPicker, setShowFormationPicker] = useState(false);
  const [pickedFormat, setPickedFormat] = useState('');
  const [pickedFormation, setPickedFormation] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [halfDuration, setHalfDuration] = useState(45);

  // --- Listeners ---
  useEffect(() => {
    const unsubRoster = listenTeamMemberships(
      teamId,
      (rows) => {
        const sorted = [...rows].sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));
        setMemberships(sorted);
        setLoadingRoster(false);
      },
      viewingSeasonId ? { seasonId: viewingSeasonId } : undefined,
    );
    const unsubMatches = listenMatches(
      teamId,
      (rows) => {
        const visible = (rows || []).filter((m: any) => !m.isDeleted);
        setMatches(visible);
        setLoadingMatches(false);
      },
      viewingSeasonId ? { seasonId: viewingSeasonId } : undefined,
    );
    const unsubMembers = listenTeamMembers(teamId, (rows) => setTeamMembers(rows));
    const unsubAnnouncements = listenAnnouncements(teamId, setAnnouncements);
    return () => { unsubRoster(); unsubMatches(); unsubMembers(); unsubAnnouncements(); };
  }, [teamId, viewingSeasonId]);

  // --- Season bootstrap: get or create the default season and set activeSeasonId ---
  useEffect(() => {
    if (seasonBootstrappedRef.current) return;

    const bootstrap = async () => {
      try {
        // Fetch team doc to check activeSeasonId and existing season text
        const teamSnap = await db.collection('teams').doc(teamId).get();
        const teamData = teamSnap.data() as any;
        const existingActiveSeasonId: string | null = teamData?.activeSeasonId ?? null;
        const existingSeasonText: string = teamData?.season ?? '';

        // Always call getOrCreateDefaultSeason — it handles re-tagging
        // any untagged matches/roster docs idempotently
        const seasonId = await getOrCreateDefaultSeason({
          teamId,
          existingSeasonText,
        });
        if (!existingActiveSeasonId) {
          await setActiveSeasonId({ teamId, seasonId });
        }
        setViewingSeasonId(seasonId);
      } catch (err) {
        console.log('[TeamDetailScreen] season bootstrap error:', err);
      }
    };

    seasonBootstrappedRef.current = true;
    bootstrap();
  }, [teamId]);

  // --- Listen to seasons list ---
  useEffect(() => {
    const unsub = listenSeasons(teamId, setSeasons);
    return () => unsub();
  }, [teamId]);

  useEffect(() => {
    const unsub = listenPlayerSearch(search, setSearchResults);
    return () => { try { unsub(); } catch {} };
  }, [search]);

  // Partition members into coaches and parents
  const coachMembers = useMemo(() => teamMembers.filter((m) => m.role !== 'parent'), [teamMembers]);
  const parentMembers = useMemo(() => teamMembers.filter((m) => m.role === 'parent'), [teamMembers]);

  const onResendParentInvite = (m: any) => {
    Alert.alert(
      'Resend Invite?',
      `Resend the invite email to ${m.invitedEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resend',
          onPress: async () => {
            try {
              await resendParentInvite({ teamId, inviteEmail: m.invitedEmail, linkedPlayerName: m.linkedPlayerName });
              Alert.alert('Invite resent!', `A new invite was sent to ${m.invitedEmail}.`);
            } catch (e: any) {
              Alert.alert('Failed', e?.message ?? 'Unknown error');
            }
          },
        },
      ],
    );
  };

  // --- Parent invite actions ---
  const openInviteParent = () => {
    setInviteParentEmail('');
    setInviteParentPlayerId('');
    setInviteParentPlayerName('');
    setShowInviteParent(true);
  };

  const sendParentInvite = async () => {
    const email = inviteParentEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!inviteParentPlayerId) {
      Alert.alert('No player selected', 'Please select the player this parent is linked to.');
      return;
    }
    setSavingParentInvite(true);
    try {
      await inviteParent({ teamId, inviteEmail: email, invitedBy: uid!, linkedPlayerId: inviteParentPlayerId, linkedPlayerName: inviteParentPlayerName });
      setShowInviteParent(false);
      Alert.alert('Invite sent', `An invite has been sent to ${email}.`);
    } catch (e: any) {
      Alert.alert('Invite failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingParentInvite(false);
    }
  };

  // --- Player actions ---
  const openAddPlayer = () => {
    setSearch(''); setSearchResults([]); setNewName(''); setNewNumber(''); setNewPosition('');
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
        ...(viewingSeasonId ? { seasonId: viewingSeasonId } : {}),
      });
      setShowAddPlayer(false);
    } catch (e: any) {
      Alert.alert('Add Player Failed', e?.message ?? 'Unknown error');
    } finally { setSavingPlayer(false); }
  };

  const createAndAdd = async () => {
    if (!uid) { Alert.alert('No session', 'User uid is missing.'); return; }
    const name = newName.trim();
    if (!name) { Alert.alert('Missing name', 'Enter player name.'); return; }
    try {
      setSavingPlayer(true);
      const playerId = await createGlobalPlayer({ name, number: newNumber, position: newPosition, createdBy: uid });
      await addPlayerToTeam({
        teamId,
        playerId,
        playerName: name,
        number: newNumber.trim(),
        position: newPosition.trim(),
        type: 'regular',
        status: 'active',
        ...(viewingSeasonId ? { seasonId: viewingSeasonId } : {}),
      });
      setShowAddPlayer(false);
    } catch (e: any) {
      Alert.alert('Create Player Failed', e?.message ?? 'Unknown error');
    } finally { setSavingPlayer(false); }
  };

  const confirmRemovePlayer = (m: any) => {
    Alert.alert('Remove player?', `Remove ${m.playerName} from the roster?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => toggleStatus(m) },
    ]);
  };

  const toggleStatus = async (m: any) => {
    try {
      await updateTeamMembership({ teamId, membershipId: m.id, playerName: m.playerName, number: m.number, position: m.position, status: m.status === 'active' ? 'inactive' : 'active' });
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'Unknown error'); }
  };

  const openEditPlayer = (m: any) => {
    setEditingMember(m);
    setEditName(m.playerName || '');
    setEditNumber(String(m.number || ''));
    setEditPosition(String(m.position || ''));
    setEditAvatarUrl(m.avatarUrl || undefined);
    setShowEditPlayer(true);
  };

  const closeEditPlayer = () => {
    setShowEditPlayer(false); setEditingMember(null);
    setEditName(''); setEditNumber(''); setEditPosition('');
    setEditAvatarUrl(undefined);
  };

  const onPickPhoto = async () => {
    if (!imagePickerReady) {
      Alert.alert(
        'Photos not set up',
        'Run:\n  npm install react-native-image-picker @react-native-firebase/storage\n  cd ios && pod install\n\nthen rebuild the app.',
      );
      return;
    }
    try {
      setUploadingPhoto(true);
      const uri = await pickPlayerPhoto();
      if (!uri || !editingMember) return;
      const playerId = editingMember.id;
      const url = await uploadPlayerAvatar(playerId, uri);
      setEditAvatarUrl(url);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSaveEditPlayer = async () => {
    if (!editingMember) return;
    const name = editName.trim();
    if (!name) { Alert.alert('Missing name', 'Player name is required.'); return; }
    try {
      setSavingEdit(true);
      await updateTeamMembership({ teamId, membershipId: editingMember.id, playerName: name, number: editNumber.trim(), position: editPosition.trim(), avatarUrl: editAvatarUrl });
      closeEditPlayer();
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message ?? 'Unknown error');
    } finally { setSavingEdit(false); }
  };

  // --- Invite actions ---
  const openInvite = () => {
    setInviteEmail('');
    setInviteRole('assistant');
    setShowInvite(true);
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setSavingInvite(true);
    try {
      await inviteCoach({ teamId, inviteEmail: email, invitedBy: uid!, role: inviteRole });
      setShowInvite(false);
      Alert.alert('Invite sent', `An invite has been sent to ${email}.`);
    } catch (e: any) {
      Alert.alert('Invite failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingInvite(false);
    }
  };

  // --- Match actions ---
  const openCreateMatch = () => {
    setOpponent(''); setDateISO(''); setLocation(''); setPickedFormat(''); setPickedFormation(''); setHalfDuration(45);
    setShowFormationPicker(true);
  };

  const onFormationPicked = (result: FormationPickerResult) => {
    setPickedFormat(result.format);
    setPickedFormation(result.formation.name);
    setShowFormationPicker(false);
    setShowCreateMatch(true);
  };

  const onCreateMatch = async () => {
    const opp = opponent.trim();
    const dt = dateISO.trim();
    if (!opp) { Alert.alert('Missing Opponent', 'Please enter opponent name.'); return; }
    if (!dt) { Alert.alert('Missing Date', 'Please select a date and time.'); return; }
    try {
      setCreatingMatch(true);
      const matchId = await createMatch({
        teamId,
        opponent: opp,
        dateISO: dt,
        location: location.trim(),
        format: pickedFormat,
        formation: pickedFormation,
        halfDuration,
        ...(viewingSeasonId ? { seasonId: viewingSeasonId } : {}),
      });
      setShowCreateMatch(false);
      navigation.navigate('MatchDetail', { teamId, matchId, title: `${teamName} vs ${opp}`, role: route.params.role });
    } catch (e: any) {
      Alert.alert('Create Match Failed', e?.message ?? 'Unknown error');
    } finally { setCreatingMatch(false); }
  };

  // ── Announcements ────────────────────────────────────────────────────────
  const onPostAnnouncement = async () => {
    const trimmed = announcementText.trim();
    if (!trimmed) return;
    const displayName = auth().currentUser?.displayName || auth().currentUser?.email || 'Coach';
    if (!uid) return;
    try {
      setPostingAnnouncement(true);
      await postAnnouncement({ teamId, text: trimmed, createdBy: uid, createdByName: displayName });
      setAnnouncementText('');
      setShowPostAnnouncement(false);
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not post announcement');
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const onDeleteAnnouncement = (id: string) => {
    Alert.alert('Delete announcement?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAnnouncement(teamId, id).catch(console.warn) },
    ]);
  };

  function formatAnnouncementTime(ts: any): string {
    if (!ts?.toDate) return '';
    const date: Date = ts.toDate();
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  const overallLoading = loadingRoster || loadingMatches;
  if (overallLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f2f7' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* ===== STATS BANNER ===== */}
        <TouchableOpacity
          onPress={() => navigation.navigate('TeamStats', { teamId, teamName })}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#111',
            borderRadius: 14,
            paddingHorizontal: 18,
            paddingVertical: 14,
          }}
        >
          <View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>📊 Season Stats</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Team record · Player leaders · Form
            </Text>
          </View>
          <Text style={{ fontSize: 20, color: 'rgba(255,255,255,0.4)' }}>›</Text>
        </TouchableOpacity>

        {/* ===== MATCHES ACCORDION ===== */}
        <View style={S.sectionContainer}>
          <TouchableOpacity
            style={S.sectionHeader}
            onPress={() => setMatchesOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={S.sectionTitleRow}>
              <Text style={S.sectionTitle}>Matches</Text>
              {matches.length > 0 && (
                <Text style={S.sectionCount}>{matches.length} matches</Text>
              )}
              {/* Season badge pill — coaches only */}
              {!isParent && seasons.length > 0 && viewingSeasonId && (() => {
                const currentSeason = seasons.find((s) => s.id === viewingSeasonId);
                return currentSeason ? (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); setShowSeasonPicker(true); }}
                    hitSlop={ICON_HITSLOP}
                    style={{
                      backgroundColor: currentSeason.status === 'active' ? '#dcfce7' : '#f3f4f6',
                      borderRadius: 20,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: currentSeason.status === 'active' ? '#15803d' : '#374151',
                    }}>
                      {currentSeason.label} ▾
                    </Text>
                  </TouchableOpacity>
                ) : null;
              })()}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!isParent && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); openCreateMatch(); }}
                  style={S.addBtn}
                  hitSlop={ICON_HITSLOP}
                >
                  <Text style={S.addBtnText}>+ Match</Text>
                </TouchableOpacity>
              )}
              <Text style={[S.chevron, { transform: [{ rotate: matchesOpen ? '-90deg' : '90deg' }] }]}>›</Text>
            </View>
          </TouchableOpacity>

          {matchesOpen && (
            matches.length === 0 ? (
              <>
                <View style={S.divider} />
                <View style={S.emptyRow}>
                  <Text style={S.emptyText}>No matches yet. Tap "+ Match" to create one.</Text>
                </View>
              </>
            ) : (
              matches.map((item) => {
                const status = String(item.status || 'scheduled');
                const home = Number.isFinite(item.homeScore) ? item.homeScore : 0;
                const away = Number.isFinite(item.awayScore) ? item.awayScore : 0;
                let rightLabel = 'Scheduled';
                let labelColor = '#6b7280';
                if (status === 'live') { rightLabel = `LIVE ${home}–${away}`; labelColor = '#16a34a'; }
                if (status === 'completed') { rightLabel = `FT ${home}–${away}`; labelColor = '#374151'; }

                return (
                  <View key={item.id}>
                    <View style={S.divider} />
                    <TouchableOpacity
                      onPress={() => navigation.navigate('MatchDetail', { teamId, matchId: item.id, title: `${teamName} vs ${item.opponent || 'Opponent'}`, role: route.params.role })}
                      style={S.row}
                      activeOpacity={0.6}
                    >
                      <View style={{ flex: 1, marginRight: 12 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                          vs {item.opponent || 'Opponent'}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 13, color: '#9ca3af' }}>
                          {item.dateISO ? formatDateISO(item.dateISO) : ''}
                          {item.location ? ` · ${item.location}` : ''}
                        </Text>
                        {item.format ? (
                          <View style={{ marginTop: 6, alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, backgroundColor: '#f3f4f6', borderRadius: 999 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#6b7280' }}>{item.format}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: labelColor }}>{rightLabel}</Text>
                        <Text style={{ fontSize: 18, color: '#c7c7cc' }}>›</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })
            )
          )}
        </View>

        {/* ===== ROSTER ACCORDION ===== */}
        <View style={S.sectionContainer}>
          {/* Header row — always visible, tapping toggles open/close */}
          <TouchableOpacity
            style={S.sectionHeader}
            onPress={() => setRosterOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={S.sectionTitleRow}>
              <Text style={S.sectionTitle}>Roster</Text>
              {memberships.length > 0 && (
                <Text style={S.sectionCount}>{memberships.length} players</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!isParent && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); openAddPlayer(); }}
                  style={S.addBtn}
                  hitSlop={ICON_HITSLOP}
                >
                  <Text style={S.addBtnText}>+ Player</Text>
                </TouchableOpacity>
              )}
              <Text style={[S.chevron, { transform: [{ rotate: rosterOpen ? '-90deg' : '90deg' }] }]}>›</Text>
            </View>
          </TouchableOpacity>

          {/* Expanded content */}
          {rosterOpen && (
            memberships.length === 0 ? (
              <>
                <View style={S.divider} />
                <View style={S.emptyRow}>
                  <Text style={S.emptyText}>No players yet. Tap "+ Player" to add your first.</Text>
                </View>
              </>
            ) : (
              memberships.map((item) => (
                <View key={item.id}>
                  <View style={S.divider} />
                  <View style={S.row}>
                    {/* Avatar — tapping navigates to player profile */}
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('PlayerProfile', {
                          teamId,
                          playerId: item.id,
                          playerName: item.playerName || '',
                          playerNumber: item.number ? String(item.number) : undefined,
                          playerPosition: item.position ? String(item.position) : undefined,
                          avatarUrl: item.avatarUrl || undefined,
                        })
                      }
                      activeOpacity={0.7}
                      style={{ marginRight: 12 }}
                    >
                      <Avatar
                        name={item.playerName || '?'}
                        avatarUrl={item.avatarUrl ?? null}
                        size={40}
                      />
                    </TouchableOpacity>

                    {/* Name + meta */}
                    <TouchableOpacity
                      onPress={() => !isParent && openEditPlayer(item)}
                      style={{ flex: 1 }}
                      activeOpacity={isParent ? 1 : 0.6}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                        {item.playerName}{item.number ? `  #${item.number}` : ''}
                      </Text>
                      <Text style={{ marginTop: 2, fontSize: 13, color: '#9ca3af' }}>
                        {item.position ? `${item.position} · ` : ''}{item.type || 'regular'} · {item.status || 'active'}
                      </Text>
                    </TouchableOpacity>

                    {!isParent && (
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        <TouchableOpacity onPress={() => openEditPlayer(item)} style={ICON_BTN} hitSlop={ICON_HITSLOP}>
                          <Text style={ICON_EDIT_TEXT}>✎</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmRemovePlayer(item)} style={ICON_BTN} hitSlop={ICON_HITSLOP}>
                          <Text style={ICON_X_TEXT}>×</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )
          )}
        </View>

        {/* ===== ANNOUNCEMENTS ACCORDION ===== */}
        <View style={S.sectionContainer}>
          <TouchableOpacity
            style={S.sectionHeader}
            onPress={() => setAnnouncementsOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={S.sectionTitleRow}>
              <Text style={S.sectionTitle}>Announcements</Text>
              {announcements.length > 0 && <Text style={S.sectionCount}>{announcements.length}</Text>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {!isParent && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); setAnnouncementText(''); setShowPostAnnouncement(true); }}
                  style={S.addBtn}
                  hitSlop={ICON_HITSLOP}
                >
                  <Text style={S.addBtnText}>📣 Post</Text>
                </TouchableOpacity>
              )}
              <Text style={[S.chevron, { transform: [{ rotate: announcementsOpen ? '-90deg' : '90deg' }] }]}>›</Text>
            </View>
          </TouchableOpacity>

          {announcementsOpen && (
            announcements.length === 0 ? (
              <>
                <View style={S.divider} />
                <View style={S.emptyRow}>
                  <Text style={S.emptyText}>No announcements yet.</Text>
                </View>
              </>
            ) : (
              announcements.map((item) => (
                <View key={item.id}>
                  <View style={S.divider} />
                  <View style={{ paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', lineHeight: 20 }}>{item.text}</Text>
                      <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>
                        {item.createdByName}{item.createdAt ? `  ·  ${formatAnnouncementTime(item.createdAt)}` : ''}
                      </Text>
                    </View>
                    {!isParent && (
                      <TouchableOpacity onPress={() => onDeleteAnnouncement(item.id)} hitSlop={ICON_HITSLOP}>
                        <Text style={ICON_X_TEXT}>×</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )
          )}
        </View>

        {/* ===== COACHES ACCORDION — coaches only ===== */}
        {!isParent && <View style={S.sectionContainer}>
          <TouchableOpacity
            style={S.sectionHeader}
            onPress={() => setCoachesOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={S.sectionTitleRow}>
              <Text style={S.sectionTitle}>Coaches</Text>
              {coachMembers.length > 0 && (
                <Text style={S.sectionCount}>{coachMembers.length}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); openInvite(); }}
                style={S.addBtn}
                hitSlop={ICON_HITSLOP}
              >
                <Text style={S.addBtnText}>+ Invite</Text>
              </TouchableOpacity>
              <Text style={[S.chevron, { transform: [{ rotate: coachesOpen ? '-90deg' : '90deg' }] }]}>›</Text>
            </View>
          </TouchableOpacity>

          {coachesOpen && (
            coachMembers.length === 0 ? (
              <>
                <View style={S.divider} />
                <View style={S.emptyRow}>
                  <Text style={S.emptyText}>No coaches yet. Tap "+ Invite" to add one.</Text>
                </View>
              </>
            ) : (
              coachMembers.map((m) => {
                const isInvite = m.status === 'invited';
                return (
                  <View key={m.id}>
                    <View style={S.divider} />
                    <View style={S.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                          {isInvite ? m.invitedEmail || 'Invited' : (m.displayName || m.invitedEmail || m.id)}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 13, color: '#9ca3af' }}>
                          {m.role || 'assistant'}{isInvite ? ' · Pending' : ' · Active'}
                        </Text>
                      </View>
                      {isInvite && (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#fef9c3', borderRadius: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#a16207' }}>Pending</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )
          )}
        </View>}

        {/* ===== PARENTS ACCORDION — coaches only ===== */}
        {!isParent && <View style={S.sectionContainer}>
          <TouchableOpacity
            style={S.sectionHeader}
            onPress={() => setParentsOpen((v) => !v)}
            activeOpacity={0.7}
          >
            <View style={S.sectionTitleRow}>
              <Text style={S.sectionTitle}>Parents</Text>
              {parentMembers.length > 0 && (
                <Text style={S.sectionCount}>{parentMembers.length}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); openInviteParent(); }}
                style={S.addBtn}
                hitSlop={ICON_HITSLOP}
              >
                <Text style={S.addBtnText}>+ Invite</Text>
              </TouchableOpacity>
              <Text style={[S.chevron, { transform: [{ rotate: parentsOpen ? '-90deg' : '90deg' }] }]}>›</Text>
            </View>
          </TouchableOpacity>

          {parentsOpen && (
            parentMembers.length === 0 ? (
              <>
                <View style={S.divider} />
                <View style={S.emptyRow}>
                  <Text style={S.emptyText}>No parents yet. Tap "+ Invite" to link a parent to a player.</Text>
                </View>
              </>
            ) : (
              parentMembers.map((m) => {
                const isInvite = m.status === 'invited';
                return (
                  <View key={m.id}>
                    <View style={S.divider} />
                    <View style={S.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                          {isInvite ? m.invitedEmail || 'Invited' : (m.displayName || m.invitedEmail || m.id)}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 13, color: '#9ca3af' }}>
                          Parent of {m.linkedPlayerName || 'Unknown Player'}{isInvite ? ' · Pending' : ' · Active'}
                        </Text>
                      </View>
                      {isInvite ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#fef9c3', borderRadius: 8 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#a16207' }}>Pending</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => onResendParentInvite(m)}
                            hitSlop={ICON_HITSLOP}
                            style={{ paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f3f4f6', borderRadius: 8 }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>Resend</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>Active</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )
          )}
        </View>}

      </ScrollView>

      {/* ===== INVITE COACH MODAL ===== */}
      <Modal visible={showInvite} animationType="slide" transparent onRequestClose={() => setShowInvite(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Invite Coach</Text>

            <TextInput
              placeholder="Email address"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#111' }}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['assistant', 'coach'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setInviteRole(r)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: inviteRole === r ? '#111' : '#f3f4f6' }}
                >
                  <Text style={{ fontWeight: '600', fontSize: 14, color: inviteRole === r ? '#fff' : '#374151' }}>
                    {r === 'coach' ? 'Head Coach' : 'Assistant'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowInvite(false)} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendInvite}
                disabled={savingInvite}
                style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#111', borderRadius: 12, opacity: savingInvite ? 0.6 : 1 }}
              >
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>Send Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== INVITE PARENT MODAL ===== */}
      <Modal visible={showInviteParent} animationType="slide" transparent onRequestClose={() => setShowInviteParent(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '80%' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Invite Parent</Text>

            <TextInput
              placeholder="Parent's email address"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={inviteParentEmail}
              onChangeText={setInviteParentEmail}
              style={{ backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#111' }}
            />

            <Text style={{ fontWeight: '600', color: '#374151', fontSize: 14 }}>Link to player</Text>

            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {memberships.length === 0 ? (
                <Text style={{ color: '#9ca3af', fontSize: 14 }}>No players on roster yet. Add players first.</Text>
              ) : (
                memberships.map((item, idx) => {
                  const active = inviteParentPlayerId === item.id;
                  return (
                    <View key={item.id}>
                      {idx > 0 && <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
                      <TouchableOpacity
                        onPress={() => { setInviteParentPlayerId(item.id); setInviteParentPlayerName(item.playerName || ''); }}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, backgroundColor: active ? '#f0fdf4' : 'transparent', borderRadius: 8 }}
                      >
                        <Avatar name={item.playerName || '?'} avatarUrl={item.avatarUrl ?? null} size={32} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontWeight: '600', color: '#111', fontSize: 14 }}>
                            {item.playerName}{item.number ? `  #${item.number}` : ''}
                          </Text>
                          {item.position ? <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 1 }}>{item.position}</Text> : null}
                        </View>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? '#16a34a' : '#d1d5db', backgroundColor: active ? '#16a34a' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {active ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 }}>✓</Text> : null}
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowInviteParent(false)} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={sendParentInvite}
                disabled={savingParentInvite}
                style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#111', borderRadius: 12, opacity: savingParentInvite ? 0.6 : 1 }}
              >
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>
                  {savingParentInvite ? 'Sending…' : 'Send Invite'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== ADD PLAYER MODAL ===== */}
      <Modal visible={showAddPlayer} animationType="slide" transparent onRequestClose={() => setShowAddPlayer(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Add Player</Text>

            <Text style={{ fontWeight: '600', color: '#374151' }}>Search existing</Text>
            <TextInput placeholder="Type a name…" value={search} onChangeText={setSearch} style={S.input} />

            {search.trim().length > 0 && (
              <View style={{ maxHeight: 180 }}>
                {searchResults.length === 0 ? (
                  <Text style={{ color: '#9ca3af', marginTop: 4 }}>No results found.</Text>
                ) : (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(i) => i.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => addExisting(item)}
                        disabled={savingPlayer}
                        style={{ paddingVertical: 10, paddingHorizontal: 4 }}
                      >
                        <Text style={{ fontWeight: '600', color: '#111' }}>
                          {item.name}{item.number ? `  #${item.number}` : ''}
                        </Text>
                        <Text style={{ color: '#9ca3af', marginTop: 2, fontSize: 13 }}>
                          {item.position ? `Pos: ${item.position}` : ' '}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            )}

            <View style={{ height: 1, backgroundColor: '#e5e7eb' }} />
            <Text style={{ fontWeight: '600', color: '#374151' }}>Or create new</Text>
            <TextInput placeholder="Player name (required)" value={newName} onChangeText={setNewName} style={S.input} />
            <TextInput placeholder="Number (optional)" value={newNumber} onChangeText={setNewNumber} style={S.input} keyboardType="numeric" />
            <TextInput placeholder="Position (optional)" value={newPosition} onChangeText={setNewPosition} style={S.input} />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowAddPlayer(false)} disabled={savingPlayer}>
                <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createAndAdd} disabled={savingPlayer} style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>{savingPlayer ? 'Saving…' : 'Create + Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== EDIT PLAYER MODAL ===== */}
      <Modal visible={showEditPlayer} animationType="slide" transparent onRequestClose={closeEditPlayer}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Edit Player</Text>

            {/* Photo picker */}
            <TouchableOpacity
              onPress={onPickPhoto}
              disabled={uploadingPhoto}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              {editAvatarUrl ? (
                <Image source={{ uri: editAvatarUrl }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#f3f4f6' }} />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 24 }}>👤</Text>
                </View>
              )}
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                  {uploadingPhoto ? 'Uploading…' : editAvatarUrl ? 'Change photo' : 'Add photo'}
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  {storageReady && imagePickerReady ? 'Tap to pick from library' : 'Requires additional setup (see README)'}
                </Text>
              </View>
            </TouchableOpacity>

            <TextInput placeholder="Player name (required)" value={editName} onChangeText={setEditName} style={S.input} />
            <TextInput placeholder="Number (optional)" value={editNumber} onChangeText={setEditNumber} style={S.input} keyboardType="numeric" />
            <TextInput placeholder="Position (optional)" value={editPosition} onChangeText={setEditPosition} style={S.input} />
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={closeEditPlayer} disabled={savingEdit}>
                <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSaveEditPlayer} disabled={savingEdit} style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== FORMATION PICKER MODAL ===== */}
      <FormationPickerModal
        visible={showFormationPicker}
        onClose={() => setShowFormationPicker(false)}
        onConfirm={onFormationPicked}
      />

      {/* ===== CREATE MATCH MODAL ===== */}
      <Modal visible={showCreateMatch} animationType="slide" transparent onRequestClose={() => setShowCreateMatch(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Create Match</Text>

            {(pickedFormat || pickedFormation) && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {pickedFormat ? (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999, borderColor: '#16a34a', backgroundColor: '#f0fdf4' }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: '#16a34a' }}>{pickedFormat}</Text>
                  </View>
                ) : null}
                {pickedFormation ? (
                  <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999, borderColor: '#16a34a', backgroundColor: '#f0fdf4' }}>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: '#16a34a' }}>{pickedFormation}</Text>
                  </View>
                ) : null}
                <TouchableOpacity onPress={() => { setShowCreateMatch(false); setShowFormationPicker(true); }}>
                  <Text style={{ fontSize: 12, color: '#9ca3af', fontWeight: '600' }}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            <TextInput placeholder="Opponent (required)" value={opponent} onChangeText={setOpponent} style={S.input} />
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={[S.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
            >
              <Text style={{ color: dateISO ? '#111' : '#9ca3af', fontSize: 15 }}>
                {dateISO ? formatDateISO(dateISO) : 'Date & time (required)'}
              </Text>
              <Text style={{ fontSize: 16 }}>📅</Text>
            </TouchableOpacity>
            <TextInput placeholder="Location (optional)" value={location} onChangeText={setLocation} style={S.input} />

            <View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>Half duration</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[20, 25, 30, 35, 40, 45].map((mins) => (
                  <TouchableOpacity
                    key={mins}
                    onPress={() => setHalfDuration(mins)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      backgroundColor: halfDuration === mins ? '#111' : '#f3f4f6',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: halfDuration === mins ? '#fff' : '#374151' }}>
                      {mins} min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowCreateMatch(false)} disabled={creatingMatch}>
                <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCreateMatch} disabled={creatingMatch} style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12 }}>
                <Text style={{ fontWeight: '700', color: '#fff' }}>{creatingMatch ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {showDatePicker && (
          <DateTimePickerModal
            visible={showDatePicker}
            value={dateISO}
            onConfirm={(iso) => { setDateISO(iso); setShowDatePicker(false); }}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </Modal>

      {/* ===== POST ANNOUNCEMENT MODAL ===== */}
      <Modal visible={showPostAnnouncement} animationType="slide" transparent onRequestClose={() => setShowPostAnnouncement(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'white', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>Post Announcement</Text>
            <TextInput
              placeholder="Write a message for the team…"
              placeholderTextColor="#9ca3af"
              value={announcementText}
              onChangeText={setAnnouncementText}
              multiline
              numberOfLines={4}
              style={{
                borderWidth: 1,
                borderColor: '#e5e7eb',
                borderRadius: 12,
                padding: 12,
                fontSize: 15,
                color: '#111',
                minHeight: 100,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowPostAnnouncement(false)} disabled={postingAnnouncement}>
                <Text style={{ padding: 10, color: '#6b7280', fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onPostAnnouncement}
                disabled={postingAnnouncement || !announcementText.trim()}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  backgroundColor: announcementText.trim() ? '#111' : '#e5e7eb',
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontWeight: '700', color: announcementText.trim() ? '#fff' : '#9ca3af' }}>
                  {postingAnnouncement ? 'Posting…' : 'Post'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== SEASON PICKER MODAL ===== */}
      <SeasonPickerModal
        visible={showSeasonPicker}
        onClose={() => setShowSeasonPicker(false)}
        teamId={teamId}
        seasons={seasons}
        currentSeasonId={viewingSeasonId}
        onSelectSeason={(seasonId) => setViewingSeasonId(seasonId)}
        onNewSeason={() => setShowNewSeason(true)}
        isOwner={!isParent}
      />

      {/* ===== NEW SEASON MODAL ===== */}
      <NewSeasonModal
        visible={showNewSeason}
        onClose={() => setShowNewSeason(false)}
        teamId={teamId}
        currentSeasonId={viewingSeasonId}
        currentRoster={memberships.map((m) => ({
          id: m.id,
          playerName: m.playerName || '',
          number: m.number ? String(m.number) : undefined,
          position: m.position ? String(m.position) : undefined,
        }))}
        onCreated={(newSeasonId) => {
          setViewingSeasonId(newSeasonId);
        }}
      />
    </SafeAreaView>
  );
}