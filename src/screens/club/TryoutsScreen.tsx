/**
 * TryoutsScreen — list + create tryout sessions, then evaluate candidates
 * inside TryoutDetail. Club staff tool for ID sessions.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { createTryout, deleteTryout, listenTryouts, type Tryout } from '../../services/tryoutService';

type Params = { Tryouts: { clubId: string; clubName?: string } };

export default function TryoutsScreen() {
  const route = useRoute<RouteProp<Params, 'Tryouts'>>();
  const navigation = useNavigation<any>();
  const { clubId } = route.params;

  const [tryouts, setTryouts] = useState<Tryout[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => listenTryouts(clubId, setTryouts), [clubId]);

  const onCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const id = await createTryout(clubId, name.trim());
      setName('');
      navigation.navigate('TryoutDetail', { clubId, tryoutId: id, tryoutName: name.trim() });
    } catch (e: any) {
      Alert.alert('Create failed', e?.message ?? 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (t: Tryout) => {
    Alert.alert('Delete tryout?', `"${t.name}" and all its candidate evaluations.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteTryout(clubId, t.id).catch((e: any) =>
          Alert.alert('Delete failed', e?.message ?? 'Unknown error')),
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. U13 AA Tryouts — Session 1"
            placeholderTextColor="#9ca3af"
            style={{
              flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
              borderRadius: 12, padding: 12, fontSize: 14, color: '#111',
            }}
          />
          <TouchableOpacity
            onPress={onCreate}
            disabled={creating || !name.trim()}
            style={{
              backgroundColor: name.trim() ? '#111' : '#e5e7eb', borderRadius: 12,
              paddingHorizontal: 16, justifyContent: 'center',
            }}
          >
            <Text style={{ color: name.trim() ? '#fff' : '#9ca3af', fontWeight: '800', fontSize: 14 }}>
              {creating ? '…' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        {tryouts.length === 0 ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 24, marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 }}>
              No tryout sessions yet.{'\n'}Create one and start evaluating candidates.
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 16, overflow: 'hidden' }}>
            {tryouts.map((t, i) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => navigation.navigate('TryoutDetail', { clubId, tryoutId: t.id, tryoutName: t.name })}
                onLongPress={() => confirmDelete(t)}
                style={{
                  flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12,
                  borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#f3f4f6',
                }}
              >
                <Text style={{ fontSize: 18 }}>📝</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>{t.name}</Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                    {t.candidateCount ?? 0} candidate{(t.candidateCount ?? 0) === 1 ? '' : 's'} · hold to delete
                  </Text>
                </View>
                <Text style={{ fontSize: 16, color: '#c7c7cc' }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
