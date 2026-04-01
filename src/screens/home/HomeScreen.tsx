import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  SectionList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/stacks/HomeStack';
import { openMaps } from '../../utils/openMaps';
import { B } from '../../constants/brand';
import { listenMyTeams, getLinkedPlayers } from '../../services/teamService';
import { listenMatches } from '../../services/matchService';
import { listenTrainings, type Training } from '../../services/trainingService';
import { formatDateISO } from '../../components/DateTimePickerModal';

type TeamRow = {
  id: string;
  teamName?: string;
  role?: string;
  linkedPlayerId?: string;
  linkedPlayerName?: string;
  linkedPlayers?: { id: string; name: string }[];
};

type ScheduleEvent = {
  id: string;
  type: 'match' | 'training';
  teamId: string;
  teamName: string;
  role: string;
  title: string;
  dateISO: string;
  subtitle?: string;
  fieldName?: string;
  status?: string;
  matchId?: string;
  trainingId?: string;
  linkedPlayerId?: string; // for parent RSVP scoping
};

type ChildFilter = { id: string; name: string } | null; // null = All

function getDateKey(isoStr: string): string {
  return (isoStr || '').split(' ')[0] || '';
}

function getTodayKey(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

// Returns the Monday of the week containing dateKey (YYYY-MM-DD)
function getMondayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getWeekLabel(mondayKey: string, thisMondayKey: string): string {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (new Date(mondayKey + 'T00:00:00').getTime() -
      new Date(thisMondayKey + 'T00:00:00').getTime()) / msPerWeek,
  );
  if (diff === 0) return 'This Week';
  if (diff === 1) return 'Next Week';
  if (diff === -1) return 'Last Week';
  if (diff > 1) return `In ${diff} Weeks`;
  return `${Math.abs(diff)} Weeks Ago`;
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [matchesByTeam, setMatchesByTeam] = useState<Record<string, any[]>>({});
  const [trainingsByTeam, setTrainingsByTeam] = useState<Record<string, Training[]>>({});
  const [selectedChild, setSelectedChild] = useState<ChildFilter>(null);

  // Build a deduplicated list of children across all parent teams.
  // Each entry: { id, name, teamIds[] }
  const children = useMemo(() => {
    const map = new Map<string, { id: string; name: string; teamIds: string[] }>();
    for (const team of teams) {
      if (team.role !== 'parent') continue;
      for (const child of getLinkedPlayers(team)) {
        if (!child.id) continue;
        if (map.has(child.id)) {
          map.get(child.id)!.teamIds.push(team.id);
        } else {
          map.set(child.id, { id: child.id, name: child.name, teamIds: [team.id] });
        }
      }
    }
    return Array.from(map.values());
  }, [teams]);

  useEffect(() => {
    if (!uid) { setLoadingTeams(false); return; }
    const unsub = listenMyTeams(uid, (rows) => {
      setTeams(rows as TeamRow[]);
      setLoadingTeams(false);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (teams.length === 0) return;
    const unsubs: (() => void)[] = [];
    for (const team of teams) {
      const tid = team.id;
      unsubs.push(
        listenMatches(tid, (rows) => {
          setMatchesByTeam((prev) => ({
            ...prev,
            [tid]: (rows || []).filter((m: any) => !m.isDeleted),
          }));
        }),
      );
      unsubs.push(
        listenTrainings(tid, (rows) => {
          setTrainingsByTeam((prev) => ({ ...prev, [tid]: rows }));
        }),
      );
    }
    return () => { unsubs.forEach((u) => u()); };
  }, [teams]);

  const todayKey = getTodayKey();

  const thisMondayKey = useMemo(() => getMondayKey(todayKey), [todayKey]);

  const sections = useMemo(() => {
    const byWeek: Record<string, ScheduleEvent[]> = {};

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = `${cutoff.getFullYear()}-${pad2(cutoff.getMonth() + 1)}-${pad2(cutoff.getDate())}`;

    // When a child filter is active, only include teams linked to that child
    const filteredTeams = selectedChild
      ? teams.filter((team) =>
          getLinkedPlayers(team).some((c) => c.id === selectedChild.id),
        )
      : teams;

    for (const team of filteredTeams) {
      const teamName = team.teamName || 'Team';
      const role = team.role || 'member';

      // For parent teams, find which child is linked to this specific team
      const childForTeam = role === 'parent'
        ? (selectedChild ?? getLinkedPlayers(team)[0] ?? null)
        : null;

      for (const m of (matchesByTeam[team.id] || [])) {
        const dateKey = getDateKey(m.dateISO || '');
        if (!dateKey || dateKey < cutoffKey) continue;
        const weekKey = getMondayKey(dateKey);
        const event: ScheduleEvent = {
          id: `match-${team.id}-${m.id}`,
          type: 'match',
          teamId: team.id,
          teamName,
          role,
          title: `vs ${m.opponent || 'Opponent'}`,
          dateISO: m.dateISO || dateKey,
          subtitle: m.location || '',
          fieldName: m.fieldName || '',
          status: m.status,
          matchId: m.id,
          linkedPlayerId: childForTeam?.id,
        };
        if (!byWeek[weekKey]) byWeek[weekKey] = [];
        byWeek[weekKey].push(event);
      }

      for (const t of (trainingsByTeam[team.id] || [])) {
        const dateKey = getDateKey(t.startISO || '');
        if (!dateKey || dateKey < cutoffKey) continue;
        const weekKey = getMondayKey(dateKey);
        const event: ScheduleEvent = {
          id: `training-${team.id}-${t.id}`,
          type: 'training',
          teamId: team.id,
          teamName,
          role,
          title: t.title,
          dateISO: t.startISO || dateKey,
          subtitle: t.location || '',
          fieldName: t.fieldName || '',
          status: t.status,
          trainingId: t.id,
        };
        if (!byWeek[weekKey]) byWeek[weekKey] = [];
        byWeek[weekKey].push(event);
      }
    }

    const upcomingWeeks = Object.entries(byWeek)
      .filter(([wk]) => wk >= thisMondayKey)
      .sort(([a], [b]) => a.localeCompare(b));

    const pastWeeks = Object.entries(byWeek)
      .filter(([wk]) => wk < thisMondayKey)
      .sort(([a], [b]) => b.localeCompare(a));

    return [...upcomingWeeks, ...pastWeeks].map(([weekKey, data]) => ({
      weekKey,
      title: getWeekLabel(weekKey, thisMondayKey),
      data: data.sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    }));
  }, [teams, matchesByTeam, trainingsByTeam, todayKey, thisMondayKey, selectedChild]);

  const handleEventPress = (event: ScheduleEvent) => {
    if (event.type === 'match') {
      navigation.navigate('MatchDetail', {
        teamId: event.teamId,
        matchId: event.matchId!,
        title: `${event.teamName} ${event.title}`,
        role: event.role,
        linkedPlayerId: event.linkedPlayerId,
      });
    } else {
      navigation.navigate('TrainingDetail', {
        teamId: event.teamId,
        trainingId: event.trainingId,
        role: event.role,
      });
    }
  };

  if (loadingTeams) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: B.ink, marginBottom: children.length > 1 ? 12 : 4 }}>
              Schedule
            </Text>
            {/* Child switcher — only shown to parents with 2+ distinct children */}
            {children.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                style={{ marginBottom: 8 }}
              >
                {/* All pill */}
                <TouchableOpacity
                  onPress={() => setSelectedChild(null)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: selectedChild === null ? B.green : '#fff',
                    borderWidth: 1,
                    borderColor: selectedChild === null ? B.green : B.border,
                  }}
                >
                  <Text style={{
                    fontSize: 13, fontWeight: '700',
                    color: selectedChild === null ? '#fff' : B.inkFaint,
                  }}>All</Text>
                </TouchableOpacity>
                {/* One pill per child */}
                {children.map((child) => {
                  const active = selectedChild?.id === child.id;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      onPress={() => setSelectedChild(active ? null : child)}
                      style={{
                        paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
                        backgroundColor: active ? B.green : '#fff',
                        borderWidth: 1,
                        borderColor: active ? B.green : B.border,
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: '700',
                        color: active ? '#fff' : B.ink,
                      }}>{child.name || 'Child'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ marginTop: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: B.ink, letterSpacing: 0.2 }}>
              {section.title}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: B.border }} />
            <Text style={{ fontSize: 12, color: B.inkFaint, fontWeight: '500' }}>
              {section.data.length} {section.data.length === 1 ? 'event' : 'events'}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isMatch = item.type === 'match';
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const isLive = item.status === 'live';

          return (
            <TouchableOpacity
              onPress={() => handleEventPress(item)}
              activeOpacity={0.7}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: B.border,
                borderTopLeftRadius: isFirst ? 14 : 0,
                borderTopRightRadius: isFirst ? 14 : 0,
                borderBottomLeftRadius: isLast ? 14 : 0,
                borderBottomRightRadius: isLast ? 14 : 0,
                borderBottomWidth: isLast ? 1 : 0,
                flexDirection: 'row',
                alignItems: 'center',
                padding: 14,
                gap: 12,
              }}
            >
              {/* Type accent bar */}
              <View style={{
                width: 4, height: 44, borderRadius: 2,
                backgroundColor: isMatch ? '#3b82f6' : B.green,
              }} />

              {/* Event info */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: B.ink }}>{item.title}</Text>
                <Text style={{ fontSize: 13, color: B.inkFaint, marginTop: 2 }}>
                  {formatDateISO(item.dateISO)}
                </Text>
                {item.subtitle ? (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); openMaps(item.subtitle!); }}
                    hitSlop={{ top: 4, bottom: 4, left: 0, right: 8 }}
                  >
                    <Text style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                      📍 {item.subtitle}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {item.fieldName ? (
                  <Text style={{ fontSize: 12, color: B.inkFaint, marginTop: 1 }}>{item.fieldName}</Text>
                ) : null}
                {(() => {
                  // For parent view: show "Child Name · Team Name" when multiple children
                  // For coach view: show team name when multiple teams
                  if (item.role === 'parent' && children.length > 1 && selectedChild === null) {
                    const names = children
                      .filter((c) => c.teamIds.includes(item.teamId))
                      .map((c) => c.name)
                      .filter(Boolean);
                    const label = [...names, item.teamName].filter(Boolean).join(' · ');
                    return <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2, fontWeight: '500' }}>{label}</Text>;
                  }
                  if (teams.length > 1) {
                    return <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2, fontWeight: '500' }}>{item.teamName}</Text>;
                  }
                  return null;
                })()}
              </View>

              {/* Right badges */}
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={{
                  backgroundColor: isMatch ? '#eff6ff' : '#f0fdf4',
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                }}>
                  <Text style={{
                    fontSize: 11, fontWeight: '700',
                    color: isMatch ? '#1d4ed8' : '#15803d',
                  }}>
                    {isMatch ? 'MATCH' : 'TRAINING'}
                  </Text>
                </View>
                {isLive && (
                  <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d' }}>LIVE</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={{
            backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
            borderColor: B.border, paddingVertical: 48, alignItems: 'center', marginTop: 16,
          }}>
            <Text style={{ fontSize: 14, color: B.inkFaint }}>
              {teams.length === 0
                ? 'Join or create a team to see your schedule.'
                : 'No upcoming events.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
