import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { fetchClubDashboard, type ClubDashboardData, type TeamSummary, type StaffSummary } from '../../services/clubDashboardService';
import { formatDateISO } from '../../components/DateTimePickerModal';
import { B } from '../../constants/brand';

type Route = RouteProp<TeamsStackParamList, 'ClubDashboard'>;

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  head_coach: 'Head Coach',
  asst_coach: 'Asst. Coach',
  staff: 'Staff',
};

const ROLE_COLOR: Record<string, string> = {
  owner: '#7c3aed',
  head_coach: '#1d4ed8',
  asst_coach: '#0369a1',
  staff: '#374151',
};

function FormPill({ result }: { result: 'W' | 'D' | 'L' }) {
  const bg = result === 'W' ? '#16a34a' : result === 'D' ? '#d97706' : '#dc2626';
  return (
    <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>{result}</Text>
    </View>
  );
}

function TeamCard({
  team,
  staff,
  viewerRole,
  onPress,
}: {
  team: TeamSummary;
  staff: StaffSummary[];
  viewerRole?: string;
  onPress: () => void;
}) {
  const assignedStaff = staff.filter((s) => team.staffIds.includes(s.id) && s.status === 'active');
  const { w, d, l } = team.record;
  const played = w + d + l;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: B.border,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      {/* Team header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: B.greenSurface, borderWidth: 1, borderColor: B.greenBorder,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 17, fontWeight: '900', color: B.greenGlow }}>
            {team.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: B.ink }}>{team.name}</Text>
          <Text style={{ fontSize: 12, color: B.inkFaint, marginTop: 1 }}>
            {team.rosterCount} {team.rosterCount === 1 ? 'player' : 'players'}
            {assignedStaff.length > 0 ? `  ·  ${assignedStaff.length} staff` : ''}
          </Text>
        </View>
        {team.liveMatch && (
          <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#15803d' }}>LIVE</Text>
          </View>
        )}
        <Text style={{ fontSize: 18, color: '#c7c7cc' }}>›</Text>
      </View>

      <View style={{ height: 1, backgroundColor: B.border }} />

      {/* Stats row */}
      <View style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, gap: 0 }}>
        {/* Record */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: B.ink }}>{played}</Text>
          <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2 }}>Played</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>{w}</Text>
          <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2 }}>Won</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#d97706' }}>{d}</Text>
          <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2 }}>Drawn</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#dc2626' }}>{l}</Text>
          <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2 }}>Lost</Text>
        </View>
        {/* Recent form */}
        {team.recentForm.length > 0 && (
          <View style={{ flex: 2, alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {team.recentForm.slice(0, 5).map((r, i) => <FormPill key={i} result={r} />)}
            </View>
            <Text style={{ fontSize: 11, color: B.inkFaint, marginTop: 2 }}>Form</Text>
          </View>
        )}
      </View>

      {/* Next event */}
      {(team.nextMatch || team.nextTraining) && (
        <>
          <View style={{ height: 1, backgroundColor: B.border }} />
          <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: B.inkFaint, width: 50 }}>NEXT</Text>
            {team.nextMatch ? (
              <>
                <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: '#3b82f6' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: B.ink }}>vs {team.nextMatch.opponent}</Text>
                  <Text style={{ fontSize: 11, color: B.inkFaint }}>{formatDateISO(team.nextMatch.dateISO)}</Text>
                </View>
                <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#1d4ed8' }}>MATCH</Text>
                </View>
              </>
            ) : team.nextTraining ? (
              <>
                <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: B.green }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: B.ink }}>{team.nextTraining.title}</Text>
                  <Text style={{ fontSize: 11, color: B.inkFaint }}>{formatDateISO(team.nextTraining.dateISO)}</Text>
                </View>
                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>TRAINING</Text>
                </View>
              </>
            ) : null}
          </View>
        </>
      )}

      {/* Assigned staff */}
      {assignedStaff.length > 0 && (
        <>
          <View style={{ height: 1, backgroundColor: B.border }} />
          <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: B.inkFaint, marginRight: 4 }}>STAFF</Text>
            {assignedStaff.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: B.border }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: B.green }}>
                    {(s.displayName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: B.ink }}>{s.displayName}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

function StaffRow({ member, teamNames, onPress }: { member: StaffSummary; teamNames: string[]; onPress: () => void }) {
  const roleColor = ROLE_COLOR[member.role] || '#374151';
  const isPending = member.status === 'invited';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: B.navy, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: B.green }}>
          {(member.displayName || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: B.ink }}>
            {member.displayName}
          </Text>
          {isPending && (
            <View style={{ backgroundColor: '#fef9c3', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#a16207' }}>Pending</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: roleColor }}>{ROLE_LABEL[member.role] || member.role}</Text>
          {teamNames.length > 0 && (
            <Text style={{ fontSize: 12, color: B.inkFaint }}>· {teamNames.join(', ')}</Text>
          )}
          {teamNames.length === 0 && !isPending && (
            <Text style={{ fontSize: 12, color: B.inkFaint }}>· No teams assigned</Text>
          )}
        </View>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: B.inkFaint }}>{member.teamIds.length} {member.teamIds.length === 1 ? 'team' : 'teams'}</Text>
    </TouchableOpacity>
  );
}

export default function ClubDashboardScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();
  const { clubId, clubName, viewerRole } = route.params;

  const [data, setData] = useState<ClubDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchClubDashboard(clubId);
      setData(result);
    } catch (e) {
      console.warn('[ClubDashboard] fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(true); };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!data) return null;

  const { teams, staff, clubRecord } = data;
  const played = clubRecord.w + clubRecord.d + clubRecord.l;
  const activeStaff = staff.filter((s) => s.status === 'active');
  const pendingStaff = staff.filter((s) => s.status === 'invited');

  // Build teamId → name map for staff rows
  const teamNameMap: Record<string, string> = {};
  for (const t of teams) teamNameMap[t.id] = t.name;

  const liveTeams = teams.filter((t) => t.liveMatch);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* ── Club record banner ── */}
        <View style={{ backgroundColor: B.navy, borderRadius: 16, padding: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 }}>CLUB OVERVIEW</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 6 }}>{clubName}</Text>
          <View style={{ flexDirection: 'row', marginTop: 16, gap: 0 }}>
            {[
              { label: 'Teams', value: teams.length },
              { label: 'Staff', value: activeStaff.length },
              { label: 'Players', value: teams.reduce((s, t) => s + t.rosterCount, 0) },
            ].map((stat, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff' }}>{stat.value}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {played > 0 && (
            <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', gap: 0 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#4ade80' }}>{clubRecord.w}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Won</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fbbf24' }}>{clubRecord.d}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Drawn</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#f87171' }}>{clubRecord.l}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Lost</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{clubRecord.gf}–{clubRecord.ga}</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Goals</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Live matches alert ── */}
        {liveTeams.length > 0 && (
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 14, borderWidth: 1, borderColor: '#86efac', padding: 14, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803d', letterSpacing: 0.5 }}>🔴  LIVE NOW</Text>
            {liveTeams.map((t) => (
              <Text key={t.id} style={{ fontSize: 14, fontWeight: '600', color: '#166534' }}>
                {t.name}  ·  vs {t.liveMatch!.opponent}
              </Text>
            ))}
          </View>
        )}

        {/* ── Teams ── */}
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: B.ink, marginBottom: 10 }}>
            Teams  <Text style={{ fontSize: 14, fontWeight: '500', color: B.inkFaint }}>{teams.length}</Text>
          </Text>
          {teams.length === 0 ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: B.border, padding: 24, alignItems: 'center' }}>
              <Text style={{ color: B.inkFaint, fontSize: 14 }}>No teams yet.</Text>
            </View>
          ) : (
            teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                staff={staff}
                viewerRole={viewerRole}
                onPress={() => navigation.navigate('TeamDetail', { teamId: team.id, teamName: team.name, role: 'coach' })}
              />
            ))
          )}
        </View>

        {/* ── Staff ── */}
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: B.border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: B.ink }}>
              Staff  <Text style={{ fontSize: 14, fontWeight: '500', color: B.inkFaint }}>{activeStaff.length}</Text>
            </Text>
            {(viewerRole === 'owner' || viewerRole === 'head_coach') && (
              <TouchableOpacity
                onPress={() => navigation.navigate('StaffList', { clubId, clubName, viewerRole })}
                style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: B.green, borderRadius: 20 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Manage</Text>
              </TouchableOpacity>
            )}
          </View>

          {staff.length === 0 ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
              <Text style={{ color: B.inkFaint, fontSize: 14 }}>No staff members yet.</Text>
            </View>
          ) : (
            staff.map((member, idx) => {
              const teamNames = member.teamIds.map((tid) => teamNameMap[tid]).filter(Boolean);
              return (
                <View key={member.id}>
                  {idx > 0 && <View style={{ height: 1, backgroundColor: B.border, marginLeft: 68 }} />}
                  <StaffRow
                    member={member}
                    teamNames={teamNames}
                    onPress={() => navigation.navigate('StaffProfile', { clubId, memberId: member.id, memberName: member.displayName, viewerRole })}
                  />
                </View>
              );
            })
          )}

          {pendingStaff.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 14, backgroundColor: '#fef9c3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#92400e' }}>
                {pendingStaff.length} pending invite{pendingStaff.length > 1 ? 's' : ''} — tap Manage to follow up
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
