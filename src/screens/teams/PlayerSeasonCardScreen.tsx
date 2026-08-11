/**
 * PlayerSeasonCardScreen — a shareable season summary card for one player.
 * Stats arrive via route params (collected by PlayerProfileScreen).
 */
import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import Avatar from '../../components/Avatar';
import { B } from '../../constants/brand';
import { fetchClubSponsorForTeam, type ClubSponsor } from '../../services/clubService';

export type SeasonCardParams = {
  teamId?: string;
  playerName: string;
  playerNumber?: string;
  positions?: string[];
  avatarUrl?: string | null;
  teamName?: string;
  seasonLabel?: string;
  stats: {
    appearances: number;
    goals: number;
    assists: number;
    yellowCards: number;
    redCards: number;
    totalMinutes?: number;
    starts?: number;
    attendancePct?: number | null;
  };
};

type Params = { PlayerSeasonCard: SeasonCardParams };

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 86, paddingVertical: 10 }}>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export default function PlayerSeasonCardScreen() {
  const route = useRoute<RouteProp<Params, 'PlayerSeasonCard'>>();
  const { teamId, playerName, playerNumber, positions, avatarUrl, teamName, seasonLabel, stats } = route.params;

  const [sponsor, setSponsor] = useState<ClubSponsor | null>(null);
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    fetchClubSponsorForTeam(teamId).then((s) => { if (!cancelled) setSponsor(s); });
    return () => { cancelled = true; };
  }, [teamId]);

  const onShare = async () => {
    const lines = [
      `${playerName}${playerNumber ? ` #${playerNumber}` : ''} — ${teamName || 'Formavo'}${seasonLabel ? ` · ${seasonLabel}` : ''}`,
      `Appearances: ${stats.appearances}`,
      `Goals: ${stats.goals} · Assists: ${stats.assists}`,
      stats.totalMinutes ? `Minutes: ${stats.totalMinutes}'` : '',
      stats.attendancePct != null ? `Training attendance: ${stats.attendancePct}%` : '',
      sponsor ? `Presented by ${sponsor.name}` : '',
      `Season card from Formavo ⚽`,
    ].filter(Boolean);
    try { await Share.share({ message: lines.join('\n') }); } catch { /* cancelled */ }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: B.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* ── The card ── */}
        <View style={{ backgroundColor: B.navy, borderRadius: 22, padding: 24, alignItems: 'center', overflow: 'hidden' }}>
          {/* subtle accent stripe */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: B.green }} />

          <Avatar name={playerName} avatarUrl={avatarUrl ?? null} size={92} />
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 12 }}>{playerName}</Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
            {!!playerNumber && (
              <View style={{ backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontWeight: '900', color: B.navy, fontSize: 13 }}>#{playerNumber}</Text>
              </View>
            )}
            {(positions || []).map((p) => (
              <View key={p} style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontWeight: '800', color: '#fff', fontSize: 13 }}>{p}</Text>
              </View>
            ))}
          </View>

          {(teamName || seasonLabel) && (
            <Text style={{ color: B.greenBright, fontSize: 13, fontWeight: '700', marginTop: 10 }}>
              {[teamName, seasonLabel].filter(Boolean).join(' · ')}
            </Text>
          )}

          <View style={{ height: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 16 }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Stat value={stats.appearances} label="Apps" />
            <Stat value={stats.goals} label="Goals" />
            <Stat value={stats.assists} label="Assists" />
            {stats.totalMinutes != null && stats.totalMinutes > 0 && <Stat value={`${stats.totalMinutes}'`} label="Minutes" />}
            {stats.starts != null && stats.starts > 0 && <Stat value={stats.starts} label="Starts" />}
            {stats.attendancePct != null && <Stat value={`${stats.attendancePct}%`} label="Training" />}
            {(stats.yellowCards > 0 || stats.redCards > 0) && (
              <Stat value={`${stats.yellowCards}🟨${stats.redCards > 0 ? ` ${stats.redCards}🟥` : ''}`} label="Cards" />
            )}
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '700', marginTop: 14, letterSpacing: 1 }}>
            {sponsor ? `PRESENTED BY ${sponsor.name.toUpperCase()}  ·  FORMAVO` : 'FORMAVO'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onShare}
          style={{ backgroundColor: '#111', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 18 }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Share season card</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
