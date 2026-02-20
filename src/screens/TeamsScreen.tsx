import React, { useEffect, useState } from 'react';
import { SafeAreaView, Text, FlatList, View, ActivityIndicator, Pressable } from 'react-native';
import { teamsRef } from '../services/firestore';

type TeamRow = {
  id: string;
  name?: string;
  seasonLabel?: string;
  sport?: string;
};

const CLUB_ID = '05ipv0P219PwlnwclnMm';

export default function TeamsScreen() {
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = teamsRef(CLUB_ID).onSnapshot(
      snap => {
        const rows: TeamRow[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        setTeams(rows);
        setLoading(false);
      },
      err => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Teams</Text>

      <Text style={{ color: '#666', marginBottom: 12 }}>
        Club: {CLUB_ID}
      </Text>

      {loading && <ActivityIndicator />}

      {error && (
        <Text style={{ color: 'red', marginBottom: 12 }}>
          Error: {error}
        </Text>
      )}

      {!loading && !error && (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => console.log('Team pressed:', item.id)}
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 12,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '600' }}>
                {item.name || '(no name)'}
              </Text>
              <Text style={{ color: '#666', marginTop: 4 }}>
                {item.sport || 'sport?'} • {item.seasonLabel || 'season?'}
              </Text>
              <Text style={{ color: '#999', marginTop: 6, fontSize: 12 }}>
                teamId: {item.id}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

