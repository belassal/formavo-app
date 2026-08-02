/**
 * RatePlayersScreen — batch post-match ratings.
 * One list, tap stars down the column, optional note per player.
 * Writes via ratingService.setPlayerMatchRating (same docs as the
 * per-player modal in MatchDetail / the Development Log).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import { setPlayerMatchRating } from '../../services/ratingService';

type Params = {
  RatePlayers: { teamId: string; matchId: string; opponent?: string; matchDateISO?: string };
};

type Row = {
  playerId: string;
  playerName: string;
  rating: number;
  note: string;
  noteOpen: boolean;
  existing: boolean;
};

export default function RatePlayersScreen() {
  const route = useRoute<RouteProp<Params, 'RatePlayers'>>();
  const navigation = useNavigation<any>();
  const { teamId, matchId, opponent, matchDateISO } = route.params;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const matchRef = db
      .collection(COL.teams).doc(teamId)
      .collection(COL.matches).doc(matchId);
    Promise.all([
      matchRef.collection(COL.roster).get(),
      matchRef.collection(COL.ratings).get(),
    ]).then(([rosterSnap, ratingsSnap]) => {
      const existing: Record<string, any> = {};
      ratingsSnap.docs.forEach((d) => { existing[d.id] = d.data(); });
      const list: Row[] = rosterSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((r) => r.attendance !== 'absent' && r.attendance !== 'injured')
        .map((r) => ({
          playerId: r.playerId || r.id,
          playerName: r.playerName || 'Unknown',
          rating: existing[r.playerId || r.id]?.rating ?? 0,
          note: existing[r.playerId || r.id]?.note ?? '',
          noteOpen: false,
          existing: !!existing[r.playerId || r.id],
        }))
        .sort((a, b) => a.playerName.localeCompare(b.playerName));
      setRows(list);
    }).catch((e) => {
      Alert.alert('Load failed', e?.message ?? 'Unknown error');
      setRows([]);
    });
  }, [teamId, matchId]);

  const update = (playerId: string, patch: Partial<Row>) =>
    setRows((prev) => prev!.map((r) => (r.playerId === playerId ? { ...r, ...patch } : r)));

  const ratedCount = (rows || []).filter((r) => r.rating > 0).length;

  const onSaveAll = async () => {
    const user = auth().currentUser;
    if (!user || !rows) return;
    const toSave = rows.filter((r) => r.rating > 0);
    if (toSave.length === 0) { Alert.alert('Nothing to save', 'Tap the stars to rate players first.'); return; }
    setSaving(true);
    try {
      await Promise.all(
        toSave.map((r) =>
          setPlayerMatchRating({
            teamId,
            matchId,
            playerId: r.playerId,
            playerName: r.playerName,
            rating: r.rating,
            note: r.note.trim(),
            coachId: user.uid,
            coachName: user.displayName ?? 'Coach',
            opponent,
            matchDateISO,
          }),
        ),
      );
      Alert.alert('Saved', `${toSave.length} player rating${toSave.length === 1 ? '' : 's'} saved.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (!rows) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
            Rate how each player performed{opponent ? ` vs ${opponent}` : ''}. Ratings and notes are
            private to coaches and each player's own family.
          </Text>

          <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
            {rows.length === 0 && (
              <Text style={{ padding: 20, color: '#9ca3af', fontSize: 14 }}>No players on the match roster.</Text>
            )}
            {rows.map((r, i) => (
              <View key={r.playerId}>
                {i > 0 && <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111', flex: 1 }} numberOfLines={1}>
                      {r.playerName}
                    </Text>
                    <TouchableOpacity
                      onPress={() => update(r.playerId, { noteOpen: !r.noteOpen })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 15, color: r.note ? '#111' : '#c7c7cc' }}>✎</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => update(r.playerId, { rating: r.rating === star ? 0 : star })}
                        hitSlop={{ top: 6, bottom: 6 }}
                      >
                        <Text style={{ fontSize: 26, color: star <= r.rating ? '#f59e0b' : '#e5e7eb' }}>★</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {r.noteOpen && (
                    <TextInput
                      value={r.note}
                      onChangeText={(t) => update(r.playerId, { note: t })}
                      placeholder="Coach note (optional)"
                      placeholderTextColor="#9ca3af"
                      multiline
                      style={{
                        backgroundColor: '#f3f4f6', borderRadius: 10, padding: 10, marginTop: 10,
                        fontSize: 14, color: '#111', minHeight: 44,
                      }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{ padding: 16, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={onSaveAll}
            disabled={saving}
            style={{
              backgroundColor: '#111', borderRadius: 14, paddingVertical: 15, alignItems: 'center',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                Save {ratedCount > 0 ? `${ratedCount} rating${ratedCount === 1 ? '' : 's'}` : 'ratings'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
