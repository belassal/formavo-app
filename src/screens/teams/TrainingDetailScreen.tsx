import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
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
  createRecurringTrainings,
  updateTraining,
  softDeleteTraining,
  markTrainingAttended,
  setTrainingAttendance,
  type Training,
  type TrainingStatus,
} from '../../services/trainingService';
import { listenTeamMembers } from '../../services/teamService';
import { listenTeamMemberships } from '../../services/playerService';
import DateTimePickerModal, { formatDateISO } from '../../components/DateTimePickerModal';
import auth from '@react-native-firebase/auth';
import { openMaps } from '../../utils/openMaps';
import LocationMapPreview from '../../components/LocationMapPreview';
import LocationPickerModal from '../../components/LocationPickerModal';
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
  const [locationName, setLocationName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TrainingStatus>('scheduled');

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [repeatType, setRepeatType] = useState<'none' | 'weekly' | 'biweekly'>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [showRepeatUntilPicker, setShowRepeatUntilPicker] = useState(false);

  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [declinedIds, setDeclinedIds] = useState<string[]>([]);
  const [attendedIds, setAttendedIds] = useState<string[]>([]);
  const [togglingAttendance, setTogglingAttendance] = useState<string | null>(null);
  // Full player roster for attendance breakdown
  const [roster, setRoster] = useState<{ id: string; playerName: string }[]>([]);
  // Parent member docs — used to resolve player names for confirmed/declined IDs
  const [parentMembers, setParentMembers] = useState<{ id: string; linkedPlayerId: string; linkedPlayerName: string }[]>([]);
  const [submittingRsvp, setSubmittingRsvp] = useState(false);

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
        setLocationName('');
        setFieldName(data.fieldName ?? '');
        setNotes(data.notes ?? '');
        setStatus(data.status ?? 'scheduled');
        setConfirmedIds(data.confirmedPlayerIds ?? []);
        setDeclinedIds(data.declinedPlayerIds ?? []);
        setAttendedIds(data.attendedPlayerIds ?? []);
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
          .map((m) => ({ id: m.id, linkedPlayerId: m.linkedPlayerId, linkedPlayerName: m.linkedPlayerName || 'Unknown Player' }))
      );
    });
    return () => { unsubRoster(); unsubMembers(); };
  }, [teamId, isNew]);

  const isParent = route.params.role === 'parent';

  const toggleAttendance = async (playerId: string) => {
    if (!trainingId) return;
    const nowAttended = attendedIds.includes(playerId);
    setTogglingAttendance(playerId);
    try {
      await markTrainingAttended({ teamId, trainingId, playerId, attended: !nowAttended });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update attendance.');
    } finally {
      setTogglingAttendance(null);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a session title.');
      return;
    }
    try {
      setSaving(true);
      if (isNew) {
        if (repeatType !== 'none' && repeatUntil) {
          await createRecurringTrainings({
            teamId,
            title: title.trim(),
            startISO,
            endISO,
            location: location.trim() || undefined,
            fieldName: fieldName.trim() || undefined,
            notes: notes.trim() || undefined,
            repeatType,
            repeatUntil,
          });
        } else {
          await createTraining({
            teamId,
            title: title.trim(),
            startISO,
            endISO,
            location: location.trim() || undefined,
            fieldName: fieldName.trim() || undefined,
            notes: notes.trim() || undefined,
          });
        }
      } else {
        await updateTraining({
          teamId,
          trainingId: trainingId!,
          title: title.trim(),
          startISO,
          endISO,
          location: location.trim(),
          fieldName: fieldName.trim(),
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

  const openRepeatPicker = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Cancel', 'Does not repeat', 'Weekly', 'Every 2 weeks'], cancelButtonIndex: 0 },
      (idx) => {
        if (idx === 1) setRepeatType('none');
        else if (idx === 2) setRepeatType('weekly');
        else if (idx === 3) setRepeatType('biweekly');
      },
    );
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

  // ── Read-only view for parents ──
  if (isParent && !isNew) {
    const statusColors: Record<string, string> = {
      scheduled: '#9ca3af',
      completed: '#374151',
      cancelled: '#ef4444',
      live: '#16a34a',
    };
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f2f2f7' }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Session info card */}
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111' }}>{title}</Text>
            <Text style={{ fontSize: 14, color: '#6b7280' }}>
              {(() => {
                if (!startISO) return '';
                const startFormatted = formatDateISO(startISO);
                if (!endISO || endISO === startISO) return startFormatted;
                // If same date, only show end time (after ' · ')
                const startDate = startISO.split(' ')[0];
                const endDate = endISO.split(' ')[0];
                const endFormatted = formatDateISO(endISO);
                const endTimePart = endFormatted.split(' · ')[1] ?? endFormatted;
                return startDate === endDate
                  ? `${startFormatted} – ${endTimePart}`
                  : `${startFormatted} – ${endFormatted}`;
              })()}
            </Text>
            {status && status !== 'scheduled' && (
              <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#f3f4f6' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: statusColors[status] ?? '#9ca3af', textTransform: 'uppercase' }}>
                  {status}
                </Text>
              </View>
            )}
          </View>

          {/* Location */}
          {location ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 16 }}>
              <LocationMapPreview address={location} fieldName={fieldName} />
            </View>
          ) : fieldName ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 16 }}>
              <Text style={{ fontSize: 14, color: '#374151', fontWeight: '500' }}>{fieldName}</Text>
            </View>
          ) : null}

          {/* Notes row */}
          {notes ? (
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 6, letterSpacing: 0.4 }}>NOTES</Text>
              <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20 }}>{notes}</Text>
            </View>
          ) : null}
        </View>

        {/* RSVP for parent's child */}
        {(() => {
          const uid = auth().currentUser?.uid;
          const me = parentMembers.find((m) => m.id === uid);
          if (!me) return null;
          const { linkedPlayerId: pid, linkedPlayerName: playerName } = me;
          const isGoing = confirmedIds.includes(pid);
          const isCant = declinedIds.includes(pid);

          const handleRsvp = async (status: 'confirmed' | 'declined') => {
            if (!trainingId || submittingRsvp) return;
            setSubmittingRsvp(true);
            try {
              await setTrainingAttendance({ teamId, trainingId, playerId: pid, status });
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not save response.');
            } finally {
              setSubmittingRsvp(false);
            }
          };

          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 12 }}>
              <View>
                <Text style={{ fontSize: 12, color: '#9ca3af', fontWeight: '500' }}>Answering on behalf of</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#111', marginTop: 2 }}>{playerName}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => handleRsvp('confirmed')}
                  disabled={submittingRsvp}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                    backgroundColor: isGoing ? '#16a34a' : '#f3f4f6',
                    borderWidth: isGoing ? 0 : 1, borderColor: '#e5e7eb',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isGoing ? '#fff' : '#374151' }}>
                    {submittingRsvp ? '…' : '✓  Attending'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRsvp('declined')}
                  disabled={submittingRsvp}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                    backgroundColor: isCant ? '#ef4444' : '#f3f4f6',
                    borderWidth: isCant ? 0 : 1, borderColor: '#e5e7eb',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: isCant ? '#fff' : '#374151' }}>
                    {submittingRsvp ? '…' : "✕  Can't Make It"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Attendance list */}
        {(() => {
          const resolveName = (id: string): string => {
            const fromRoster = roster.find((r) => r.id === id);
            if (fromRoster) return fromRoster.playerName;
            const fromParent = parentMembers.find((m) => m.linkedPlayerId === id);
            return fromParent?.linkedPlayerName ?? 'Unknown Player';
          };
          const goingNames = confirmedIds.map(resolveName);
          const cantNames = declinedIds.map(resolveName);
          const noResponsePlayers = roster.filter(
            (r) => !confirmedIds.includes(r.id) && !declinedIds.includes(r.id)
          );
          if (confirmedIds.length === 0 && declinedIds.length === 0 && noResponsePlayers.length === 0) return null;
          return (
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>

              {/* Going */}
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a', letterSpacing: 0.4, marginBottom: 8 }}>
                  GOING ({goingNames.length})
                </Text>
                {goingNames.length === 0 ? (
                  <Text style={{ fontSize: 14, color: '#9ca3af' }}>No responses yet</Text>
                ) : (
                  goingNames.map((name, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' }} />
                      <Text style={{ fontSize: 14, color: '#111' }}>{name}</Text>
                    </View>
                  ))
                )}
              </View>

              {/* Can't make it */}
              {cantNames.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444', letterSpacing: 0.4, marginBottom: 8 }}>
                    CAN'T MAKE IT ({cantNames.length})
                  </Text>
                  {cantNames.map((name, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
                      <Text style={{ fontSize: 14, color: '#111' }}>{name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* No response */}
              {noResponsePlayers.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.4, marginBottom: 8 }}>
                    NO RESPONSE ({noResponsePlayers.length})
                  </Text>
                  {noResponsePlayers.map((p, i) => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' }} />
                      <Text style={{ fontSize: 14, color: '#6b7280' }}>{p.playerName}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

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
            <TouchableOpacity
              onPress={() => setShowLocationPicker(true)}
              activeOpacity={0.7}
              style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
            >
              <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Location</Text>
              <Text style={{ flex: 1, fontSize: 15, color: locationName || location ? '#111' : '#d1d5db' }} numberOfLines={1}>
                {locationName || location || 'Select a location…'}
              </Text>
              {locationName || location ? (
                <TouchableOpacity onPress={() => { setLocation(''); setLocationName(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 16, color: '#9ca3af' }}>✕</Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 18, color: '#d1d5db' }}>›</Text>
              )}
            </TouchableOpacity>
            <View style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
              <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Field</Text>
              <TextInput
                value={fieldName}
                onChangeText={setFieldName}
                placeholder="e.g. BMO 1, Field 3"
                placeholderTextColor="#d1d5db"
                style={{ flex: 1, fontSize: 15, color: '#111' }}
              />
            </View>
            {isNew && (
              <>
                <TouchableOpacity
                  onPress={openRepeatPicker}
                  style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                >
                  <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Repeat</Text>
                  <Text style={{ flex: 1, fontSize: 15, color: '#111' }}>
                    {repeatType === 'none' ? 'Does not repeat' : repeatType === 'weekly' ? 'Weekly' : 'Every 2 weeks'}
                  </Text>
                  <Text style={{ fontSize: 18, color: '#d1d5db' }}>›</Text>
                </TouchableOpacity>
                {repeatType !== 'none' && (
                  <TouchableOpacity
                    onPress={() => setShowRepeatUntilPicker(true)}
                    style={{ borderTopWidth: 1, borderTopColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                  >
                    <Text style={{ width: 100, fontSize: 14, fontWeight: '500', color: '#6b7280' }}>Repeat until</Text>
                    <Text style={{ flex: 1, fontSize: 15, color: repeatUntil ? '#111' : '#d1d5db' }}>
                      {repeatUntil ? (() => {
                        const [y, m, d] = repeatUntil.split('-');
                        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                        return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
                      })() : 'Select end date'}
                    </Text>
                    <Text style={{ fontSize: 18, color: '#d1d5db' }}>›</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
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

        {/* Check-In (coach only, existing sessions only) */}
        {!isNew && roster.length > 0 && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4, letterSpacing: 0.5 }}>
              CHECK-IN  ·  {attendedIds.length} / {roster.length} present
            </Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
              {roster.map((player, index) => {
                const present = attendedIds.includes(player.id);
                const toggling = togglingAttendance === player.id;
                return (
                  <View
                    key={player.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: '#f3f4f6',
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: '#111' }}>{player.playerName}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => toggleAttendance(player.id)}
                        disabled={!!toggling}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 14,
                          borderRadius: 20,
                          backgroundColor: present ? '#dcfce7' : '#f3f4f6',
                          borderWidth: 1,
                          borderColor: present ? '#16a34a' : '#e5e7eb',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: present ? '#16a34a' : '#9ca3af' }}>
                          {toggling ? '…' : present ? '✓ Present' : 'Absent'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

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
      <DateTimePickerModal
        visible={showRepeatUntilPicker}
        value={repeatUntil ? `${repeatUntil} 00:00` : startISO}
        onConfirm={(iso) => { setRepeatUntil(iso.split(' ')[0]); setShowRepeatUntilPicker(false); }}
        onClose={() => setShowRepeatUntilPicker(false)}
      />
      <LocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelect={(loc) => { setLocation(loc.address); setLocationName(loc.name); setShowLocationPicker(false); }}
      />
    </KeyboardAvoidingView>
  );
}
