import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import {
  createTraining,
  updateTraining,
  softDeleteTraining,
  type Training,
  type TrainingStatus,
} from '../../services/trainingService';
import { listenTeamMembers } from '../../services/teamService';
import { listenTeamMemberships } from '../../services/playerService';
import DateTimePickerModal, { formatDateISO } from '../../components/DateTimePickerModal';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

type Route = RouteProp<TeamsStackParamList, 'TrainingDetail'>;
type Nav = NativeStackNavigationProp<TeamsStackParamList>;

const STATUS_OPTIONS: { label: string; value: TrainingStatus }[] = [
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

function defaultStart(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 09:00`;
}

function defaultEnd(startISO: string): string {
  const [datePart, timePart] = startISO.split(' ');
  if (!datePart || !timePart) return startISO;
  const [hh, mm] = timePart.split(':').map(Number);
  const total = hh * 60 + mm + 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${datePart} ${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

function TimeRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
      <TouchableOpacity
        onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
      >
        <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>{label}</Text>
        <Text style={{ flex: 1, fontSize: 15, color: value ? '#111' : '#d1d5db' }}>
          {value ? formatDateISO(value) : 'Select…'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function TrainingDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { teamId, trainingId } = route.params;
  const isNew = !trainingId;

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [title, setTitle] = useState('');
  const [startISO, setStartISO] = useState(defaultStart);
  const [endISO, setEndISO] = useState(() => defaultEnd(defaultStart()));
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TrainingStatus>('scheduled');

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  // Full player roster for attendance breakdown
  const [roster, setRoster] = useState<{ id: string; playerName: string }[]>([]);
  // Parent member docs — used to resolve player names for confirmed/declined IDs
  const [parentMembers, setParentMembers] = useState<{ linkedPlayerId: string; linkedPlayerName: string }[]>([]);

  useEffect(() => {
    if (!trainingId) return;
    const unsub = db.collection(COL.teams)
      .doc(teamId)
      .collection(COL.trainings)
      .doc(trainingId)
      .onSnapshot((snap) => {
        if (!snap.exists) return;
        const data = snap.data() as Training;
        setTitle(data.title ?? '');
        if (data.startISO) setStartISO(data.startISO);
        if (data.endISO) setEndISO(data.endISO);
        setLocation(data.location ?? '');
        setNotes(data.notes ?? '');
        setStatus(data.status ?? 'scheduled');
        setConfirmedIds(data.confirmedPlayerIds ?? []);
        setDeclinedIds(data.declinedPlayerIds ?? []);
      }, console.warn);
    return () => unsub();
  }, [teamId, trainingId]);

  useEffect(() => {
    if (isNew) return;
    // Full player roster for attendance buckets
    const unsubRoster = listenTeamMemberships(teamId, (rows) => {
      setRoster(rows.map((r) => ({ id: r.id, playerName: r.playerName })));
    });
    // Parent member docs to resolve player names from confirmed/declined IDs
    const unsubMembers = listenTeamMembers(teamId, (members) => {
      setParentMembers(
        members
          .filter((m) => m.role === 'parent' && m.status === 'active' && m.linkedPlayerId)
          .map((m) => ({ linkedPlayerId: m.linkedPlayerId, linkedPlayerName: m.linkedPlayerName || 'Unknown Player' }))
      );
    });
    return () => { unsubRoster(); unsubMembers(); };
  }, [teamId, isNew]);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a session title.');
      return;
    }
    try {
      setSaving(true);
      if (isNew) {
        await createTraining({
          teamId,
          title: title.trim(),
          startISO,
          endISO,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await updateTraining({
          teamId,
          trainingId: trainingId!,
          title: title.trim(),
          startISO,
          endISO,
          location: location.trim(),
          notes: notes.trim(),
          status,
        });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!trainingId) return;
    Alert.alert('Delete session?', 'This will permanently remove this training session.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);
            await softDeleteTraining({ teamId, trainingId: trainingId! });
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('Delete Failed', e?.message ?? 'Unknown error');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const cardStyle = {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden' as const,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={{ flex: 1, backgroundColor: '#f2f2f7' }} contentContainerStyle={{ padding: 16, gap: 20 }}>

        {/* Session details */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
            SESSION DETAILS
          </Text>
          <View style={cardStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Title</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Tuesday Training"
                placeholderTextColor="#d1d5db"
                autoCapitalize="words"
                style={{ flex: 1, fontSize: 15, color: '#111' }}
              />
            </View>
            <TimeRow label="Start" value={startISO} onPress={() => setShowStartPicker(true)} />
            <TimeRow label="End" value={endISO} onPress={() => setShowEndPicker(true)} />
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Location</Text>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Field, gym, etc."
                placeholderTextColor="#d1d5db"
                style={{ flex: 1, fontSize: 15, color: '#111' }}
              />
            </View>
          </View>
        </View>

        {/* Status (edit only) */}
        {!isNew && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
              STATUS
            </Text>
            <View style={[cardStyle, { flexDirection: 'row', padding: 12, gap: 8 }]}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setStatus(opt.value)}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: active ? '#111' : '#f3f4f6' }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : '#374151' }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Notes */}
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
            NOTES
          </Text>
          <View style={cardStyle}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Session plan, focus areas, etc."
                placeholderTextColor="#d1d5db"
                multiline
                numberOfLines={4}
                style={{ fontSize: 15, color: '#111', minHeight: 80, textAlignVertical: 'top' }}
              />
            </View>
          </View>
        </View>

        {/* Attendance (edit only) */}
        {!isNew && (() => {
          // Resolve player name: prefer roster (has full active list), fall back to parentMembers
          const resolveName = (id: string): string => {
            const fromRoster = roster.find((r) => r.id === id);
            if (fromRoster) return fromRoster.playerName;
            const fromParent = parentMembers.find((m) => m.linkedPlayerId === id);
            return fromParent?.linkedPlayerName ?? 'Unknown Player';
          };

          const goingPlayers = confirmedIds.map((id) => ({ id, name: resolveName(id) }));
          const cantMakeItPlayers = declinedIds.map((id) => ({ id, name: resolveName(id) }));
          const noResponsePlayers = roster.filter(
            (r) => !confirmedIds.includes(r.id) && !declinedIds.includes(r.id)
          );

          return (
            <View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
                ATTENDANCE
              </Text>
              <View style={cardStyle}>
                {/* Going */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a', marginBottom: 6, letterSpacing: 0.4 }}>
                    GOING ({goingPlayers.length})
                  </Text>
                  {goingPlayers.length === 0 ? (
                    <Text style={{ fontSize: 14, color: '#9ca3af' }}>—</Text>
                  ) : (
                    goingPlayers.map((p) => (
                      <Text key={p.id} style={{ fontSize: 14, color: '#111', paddingVertical: 2 }}>{p.name}</Text>
                    ))
                  )}
                </View>

                {/* Can't Make It */}
                <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444', marginBottom: 6, letterSpacing: 0.4 }}>
                    CAN'T MAKE IT ({cantMakeItPlayers.length})
                  </Text>
                  {cantMakeItPlayers.length === 0 ? (
                    <Text style={{ fontSize: 14, color: '#9ca3af' }}>—</Text>
                  ) : (
                    cantMakeItPlayers.map((p) => (
                      <Text key={p.id} style={{ fontSize: 14, color: '#111', paddingVertical: 2 }}>{p.name}</Text>
                    ))
                  )}
                </View>

                {/* No Response */}
                <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 6, letterSpacing: 0.4 }}>
                    NO RESPONSE ({noResponsePlayers.length})
                  </Text>
                  {noResponsePlayers.length === 0 ? (
                    <Text style={{ fontSize: 14, color: '#9ca3af' }}>—</Text>
                  ) : (
                    noResponsePlayers.map((p) => (
                      <Text key={p.id} style={{ fontSize: 14, color: '#6b7280', paddingVertical: 2 }}>{p.playerName}</Text>
                    ))
                  )}
                </View>
              </View>
            </View>
          );
        })()}

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{ backgroundColor: '#111', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>
            {saving ? 'Saving…' : isNew ? 'Create Session' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        {!isNew && (
          <TouchableOpacity
            onPress={handleDelete}
            disabled={deleting}
            style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#fecaca', paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#ef4444' }}>
              {deleting ? 'Deleting…' : 'Delete Session'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <DateTimePickerModal
        visible={showStartPicker}
        value={startISO}
        onConfirm={(iso) => { setStartISO(iso); setEndISO(defaultEnd(iso)); setShowStartPicker(false); }}
        onClose={() => setShowStartPicker(false)}
      />
      <DateTimePickerModal
        visible={showEndPicker}
        value={endISO}
        onConfirm={(iso) => { setEndISO(iso); setShowEndPicker(false); }}
        onClose={() => setShowEndPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}
