import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { fetchPlayerTrainingHistory, type TrainingSessionRecord } from '../../services/trainingService';

type Route = RouteProp<TeamsStackParamList, 'PlayerAttendance'>;

function formatISO(iso: string): string {
  const [datePart] = iso.split(' ');
  const [y, m, d] = datePart.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

const STATUS_CONFIG = {
  attended:    { label: 'Attended',   color: '#16a34a', bg: '#dcfce7', dot: '#16a34a' },
  confirmed:   { label: 'Confirmed',  color: '#2563eb', bg: '#dbeafe', dot: '#2563eb' },
  declined:    { label: 'Declined',   color: '#ef4444', bg: '#fee2e2', dot: '#ef4444' },
  no_response: { label: 'No Response',color: '#9ca3af', bg: '#f3f4f6', dot: '#d1d5db' },
} as const;

export default function PlayerAttendanceScreen() {
  const route = useRoute<Route>();
  const { teamId, playerId, playerName } = route.params;

  const [records, setRecords] = useState<TrainingSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayerTrainingHistory(teamId, playerId)
      .then(setRecords)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [teamId, playerId]);

  const attended = records.filter((r) => r.status === 'attended').length;
  const total = records.length;
  const pct = total > 0 ? Math.round((attended / total) * 100) : null;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <SectionList
        contentContainerStyle={{ padding: 16, gap: 16 }}
        sections={[{ title: 'sessions', data: records }]}
        keyExtractor={(item) => item.training.id}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 4 }}>
            {/* Summary card */}
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 20, gap: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5 }}>TRAINING ATTENDANCE</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, backgroundColor: '#f2f2f7', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#111' }}>{attended}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 }}>Attended</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#f2f2f7', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#111' }}>{total}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 }}>Total</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: pct !== null && pct >= 75 ? '#dcfce7' : pct !== null && pct >= 50 ? '#fef9c3' : '#fee2e2', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#111' }}>{pct !== null ? `${pct}%` : '—'}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginTop: 2 }}>Rate</Text>
                </View>
              </View>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginLeft: 4, letterSpacing: 0.5 }}>SESSION HISTORY</Text>
          </View>
        }
        renderSectionHeader={() => null}
        renderItem={({ item, index }) => {
          const cfg = STATUS_CONFIG[item.status];
          const isFirst = index === 0;
          const isLast = index === records.length - 1;
          return (
            <View style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#e5e7eb',
              borderTopLeftRadius: isFirst ? 14 : 0,
              borderTopRightRadius: isFirst ? 14 : 0,
              borderBottomLeftRadius: isLast ? 14 : 0,
              borderBottomRightRadius: isLast ? 14 : 0,
              borderTopWidth: isFirst ? 1 : 0,
              paddingHorizontal: 16,
              paddingVertical: 13,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.dot }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{item.training.title}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{formatISO(item.training.startISO)}</Text>
              </View>
              <View style={{ backgroundColor: cfg.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: cfg.color }}>{cfg.label}</Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
        ListEmptyComponent={
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No training sessions recorded yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
