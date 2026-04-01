import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

type Route = RouteProp<TeamsStackParamList, 'OpponentHistory'>;

type OpponentRecord = {
  key: string;
  name: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  lastDate: string;
  played: number;
};

async function fetchOpponentHistory(teamId: string): Promise<OpponentRecord[]> {
  const snap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .orderBy('dateISO', 'desc')
    .get();

  const map = new Map<string, OpponentRecord>();

  for (const doc of snap.docs) {
    const m = doc.data() as any;
    if (m.isDeleted || m.status !== 'completed') continue;

    const key = (m.opponentLower || m.opponent || '').toLowerCase().trim();
    const name = m.opponent || 'Unknown';
    const gf = Number(m.homeScore ?? 0);
    const ga = Number(m.awayScore ?? 0);

    if (!map.has(key)) {
      map.set(key, { key, name, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, lastDate: m.dateISO ?? '', played: 0 });
    }
    const rec = map.get(key)!;
    rec.goalsFor += gf;
    rec.goalsAgainst += ga;
    rec.played += 1;
    if (gf > ga) rec.wins++;
    else if (gf < ga) rec.losses++;
    else rec.draws++;
    if ((m.dateISO ?? '') > rec.lastDate) { rec.lastDate = m.dateISO; rec.name = name; }
  }

  return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

export default function OpponentHistoryScreen() {
  const route = useRoute<Route>();
  const { teamId } = route.params;

  const [records, setRecords] = useState<OpponentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOpponentHistory(teamId).then(setRecords).catch(console.warn).finally(() => setLoading(false));
  }, [teamId]);

  const totalW = records.reduce((s, r) => s + r.wins, 0);
  const totalD = records.reduce((s, r) => s + r.draws, 0);
  const totalL = records.reduce((s, r) => s + r.losses, 0);
  const totalGF = records.reduce((s, r) => s + r.goalsFor, 0);
  const totalGA = records.reduce((s, r) => s + r.goalsAgainst, 0);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          records.length > 0 ? (
            <View style={{ backgroundColor: '#111', borderRadius: 14, padding: 20, marginBottom: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 14 }}>OVERALL RECORD</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {[
                  { label: 'W', value: totalW, color: '#4ade80' },
                  { label: 'D', value: totalD, color: '#facc15' },
                  { label: 'L', value: totalL, color: '#f87171' },
                  { label: 'GF', value: totalGF, color: '#fff' },
                  { label: 'GA', value: totalGA, color: '#fff' },
                ].map((s) => (
                  <View key={s.label} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '800', color: s.color }}>{s.value}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No completed matches yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const wPct = item.played > 0 ? item.wins / item.played : 0;
          const barColor = wPct >= 0.6 ? '#16a34a' : wPct >= 0.4 ? '#ca8a04' : '#ef4444';
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>vs {item.name}</Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Last played {formatDate(item.lastDate)}</Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>{item.goalsFor}–{item.goalsAgainst}</Text>
              </View>
              {/* W/D/L pills */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { label: `${item.wins}W`, color: '#16a34a', bg: '#dcfce7' },
                  { label: `${item.draws}D`, color: '#92400e', bg: '#fef9c3' },
                  { label: `${item.losses}L`, color: '#ef4444', bg: '#fee2e2' },
                  { label: `${item.played} played`, color: '#6b7280', bg: '#f3f4f6' },
                ].map((p) => (
                  <View key={p.label} style={{ backgroundColor: p.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: p.color }}>{p.label}</Text>
                  </View>
                ))}
              </View>
              {/* Win rate bar */}
              <View style={{ height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: 4, width: `${Math.round(wPct * 100)}%`, backgroundColor: barColor, borderRadius: 2 }} />
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
