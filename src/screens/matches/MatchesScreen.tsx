import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';

import { listenMyTeams } from '../../services/teamService';
import { listenMatches } from '../../services/matchService';
import { formatDateISO } from '../../components/DateTimePickerModal';
import ParentMatchesSection from './ParentMatchesSection';

type TeamRow = {
  id: string;
  teamId?: string;
  teamName?: string;
  role?: string;
  linkedPlayerId?: string;
  linkedPlayerName?: string;
};
type StatusFilter = 'all' | 'scheduled' | 'live' | 'completed';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'live', label: 'Live' },
  { key: 'completed', label: 'Final' },
];

export default function MatchesScreen() {
  const navigation = useNavigation<any>();
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');
  const [matches, setMatches] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Partition teams by role
  const coachTeams = useMemo(() => teams.filter((t) => t.role !== 'parent'), [teams]);
  const parentTeamRefs = useMemo(
    () => teams.filter((t) => t.role === 'parent' && !!t.linkedPlayerId),
    [teams],
  );

  // teams
  useEffect(() => {
    if (!uid) return;
    const unsub = listenMyTeams(uid, (rows) => {
      const t = rows as TeamRow[];
      setTeams(t);
      const coachRows = t.filter((r) => r.role !== 'parent');
      if (!selectedTeamId && coachRows.length > 0) {
        setSelectedTeamId(coachRows[0].id);
        setSelectedTeamName(coachRows[0].teamName || 'Team');
      }
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // matches for selected team
  useEffect(() => {
    if (!selectedTeamId) { setMatches([]); return; }
    const unsub = listenMatches(selectedTeamId, (rows) => {
      setMatches((rows || []).filter((m: any) => !m.isDeleted));
    });
    return () => unsub();
  }, [selectedTeamId]);

  const filteredMatches = useMemo(() => {
    if (statusFilter === 'all') return matches;
    return matches.filter((m) => {
      const st = String(m.status || 'scheduled');
      if (statusFilter === 'completed') return st === 'completed';
      return st === statusFilter;
    });
  }, [matches, statusFilter]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (teams.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.screenTitle}>Matches</Text>
        <Text style={styles.emptyText}>No teams yet. Create a team first.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={filteredMatches}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => coachTeams.length > 0 ? <View style={styles.divider} /> : null}
        ListHeaderComponent={
          <>
            <Text style={styles.screenTitle}>Matches</Text>

            {/* ── Parent "My Child's Matches" section ── */}
            {parentTeamRefs.length > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
                <ParentMatchesSection
                  parentTeamRefs={parentTeamRefs as any}
                  uid={uid!}
                  onNavigateToMatch={({ teamId, matchId, teamName, opponent }) =>
                    navigation.navigate('Teams', {
                      screen: 'MatchDetail',
                      params: { teamId, matchId, title: `${teamName} vs ${opponent}` },
                    })
                  }
                />
              </View>
            )}

            {/* ── Coach / team-manager section ── */}
            {coachTeams.length > 0 && (
              <>
                {parentTeamRefs.length > 0 && (
                  <Text style={[styles.screenTitle, { fontSize: 20, paddingTop: 4, paddingBottom: 8 }]}>
                    Team Matches
                  </Text>
                )}

                {/* Team picker */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamScroll} contentContainerStyle={styles.teamScrollContent}>
                  {coachTeams.map((t) => {
                    const active = t.id === selectedTeamId;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => { setSelectedTeamId(t.id); setSelectedTeamName(t.teamName || 'Team'); }}
                        style={[styles.teamPill, active && styles.teamPillActive]}
                      >
                        <Text style={[styles.teamPillText, active && styles.teamPillTextActive]}>
                          {t.teamName || 'Team'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Status filter */}
                <View style={styles.filterRow}>
                  {STATUS_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => setStatusFilter(f.key)}
                      style={[styles.filterPill, statusFilter === f.key && styles.filterPillActive]}
                    >
                      <Text style={[styles.filterPillText, statusFilter === f.key && styles.filterPillTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {coachTeams.length > 0 && filteredMatches.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>
                  {statusFilter === 'all'
                    ? 'No matches yet. Go to your team to create one.'
                    : `No ${statusFilter} matches.`}
                </Text>
              </View>
            ) : coachTeams.length > 0 ? (
              <View style={styles.cardTop} />
            ) : null}
          </>
        }
        ListFooterComponent={coachTeams.length > 0 && filteredMatches.length > 0 ? <View style={styles.cardBottom} /> : null}
        renderItem={coachTeams.length === 0 ? () => null : ({ item }) => {
          const st = String(item.status || 'scheduled');
          const hg = Number.isFinite(item.homeScore) ? item.homeScore : 0;
          const ag = Number.isFinite(item.awayScore) ? item.awayScore : 0;

          let statusLabel = 'Scheduled';
          let statusColor = '#9ca3af';
          if (st === 'live') { statusLabel = `LIVE ${hg}–${ag}`; statusColor = '#16a34a'; }
          if (st === 'completed') { statusLabel = `FT ${hg}–${ag}`; statusColor = '#374151'; }

          return (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Teams', {
                  screen: 'MatchDetail',
                  params: {
                    teamId: selectedTeamId,
                    matchId: item.id,
                    title: `${selectedTeamName} vs ${item.opponent || 'Opponent'}`,
                  },
                })
              }
              style={styles.matchRow}
              activeOpacity={0.7}
            >
              <View style={styles.matchRowLeft}>
                <Text style={styles.opponent}>vs {item.opponent || 'Opponent'}</Text>
                <Text style={styles.meta}>
                  {item.dateISO ? formatDateISO(item.dateISO) : 'No date'}
                  {item.location ? ` · ${item.location}` : ''}
                </Text>
                {item.format ? (
                  <Text style={styles.formatLabel}>{item.format}{item.formation ? ` · ${item.formation}` : ''}</Text>
                ) : null}
              </View>
              <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  teamScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  teamScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  teamPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  teamPillActive: {
    backgroundColor: '#111',
  },
  teamPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  teamPillTextActive: {
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  filterPillActive: {
    backgroundColor: '#111',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 15,
    paddingHorizontal: 16,
  },
  list: {
    paddingHorizontal: 16,
  },
  cardTop: {
    height: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#e5e7eb',
  },
  cardBottom: {
    height: 0,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#e5e7eb',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 16,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e7eb',
  },
  matchRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  opponent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  meta: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },
  formatLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
