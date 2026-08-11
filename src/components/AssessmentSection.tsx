/**
 * AssessmentSection — four-corner assessment history + coach entry form.
 * Dropped into PlayerProfileScreen; self-contained (listeners + modal).
 */
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import auth from '@react-native-firebase/auth';
import {
  addAssessment,
  deleteAssessment,
  listenPlayerAssessments,
  CORNERS,
  WINDOWS,
  type Corner,
  type PlayerAssessment,
} from '../services/assessmentService';

const CORNER_LABELS: Record<Corner, string> = {
  technical: 'Technical',
  tactical: 'Tactical',
  physical: 'Physical',
  mental: 'Mental',
};

function CornerBar({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
      <Text style={{ width: 72, fontSize: 12, color: '#6b7280' }}>{label}</Text>
      <View style={{ flex: 1, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3 }}>
        <View style={{
          width: `${(value / 5) * 100}%`, height: 6, borderRadius: 3,
          backgroundColor: value >= 4 ? '#22c55e' : value >= 3 ? '#a3e635' : '#f59e0b',
        }} />
      </View>
      <Text style={{ width: 16, fontSize: 12, fontWeight: '800', color: '#111', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function AssessmentSection({
  teamId,
  playerId,
  playerName,
  canEdit,
}: {
  teamId: string;
  playerId: string;
  playerName: string;
  canEdit: boolean;
}) {
  const [assessments, setAssessments] = useState<PlayerAssessment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [windowLabel, setWindowLabel] = useState<string>(WINDOWS[0]);
  const [customWindow, setCustomWindow] = useState('');
  const [scores, setScores] = useState<Record<Corner, number>>({
    technical: 3, tactical: 3, physical: 3, mental: 3,
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => listenPlayerAssessments(teamId, playerId, setAssessments), [teamId, playerId]);

  const save = async () => {
    const user = auth().currentUser;
    if (!user) return;
    const label = windowLabel === 'Custom' ? customWindow.trim() : windowLabel;
    if (!label) { Alert.alert('Window required', 'Name this assessment window.'); return; }
    setSaving(true);
    try {
      await addAssessment({
        teamId, playerId, playerName,
        window: label, scores, notes,
        coachId: user.uid,
        coachName: user.displayName ?? 'Coach',
      });
      setShowForm(false);
      setNotes('');
      setCustomWindow('');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (a: PlayerAssessment) => {
    Alert.alert('Delete assessment?', `${a.window} · ${playerName}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteAssessment(teamId, a.id).catch((e: any) =>
          Alert.alert('Delete failed', e?.message ?? 'Unknown error')),
      },
    ]);
  };

  if (assessments.length === 0 && !canEdit) return null;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginLeft: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af' }}>ASSESSMENTS</Text>
        {canEdit && (
          <TouchableOpacity
            onPress={() => setShowForm(true)}
            style={{ backgroundColor: '#f3f4f6', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#111' }}>+ Assess</Text>
          </TouchableOpacity>
        )}
      </View>

      {assessments.length === 0 ? (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 }}>
          <Text style={{ fontSize: 13, color: '#9ca3af' }}>
            No assessments yet. Capture Preseason, Mid-season and End-of-season snapshots to
            show development over time.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {assessments.map((a) => (
            <View key={a.id} style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#111' }}>{a.window}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>
                    {a.createdAt?.toDate ? a.createdAt.toDate().toISOString().substring(0, 10) : ''} · {a.coachName}
                  </Text>
                  {canEdit && (
                    <TouchableOpacity onPress={() => confirmDelete(a)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 15, color: '#ef4444', fontWeight: '700' }}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              {CORNERS.map((c) => (
                <CornerBar key={c} label={CORNER_LABELS[c]} value={a.scores?.[c] ?? 0} />
              ))}
              {!!a.notes && (
                <Text style={{ fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 19 }}>"{a.notes}"</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ── Entry form ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111' }}>Assess {playerName}</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginTop: 14 }}>WINDOW</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {[...WINDOWS, 'Custom'].map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWindowLabel(w)}
                  style={{
                    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                    backgroundColor: windowLabel === w ? '#111' : '#f3f4f6',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: windowLabel === w ? '#fff' : '#374151' }}>{w}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {windowLabel === 'Custom' && (
              <TextInput
                value={customWindow}
                onChangeText={setCustomWindow}
                placeholder="e.g. Winter camp"
                placeholderTextColor="#9ca3af"
                style={{ backgroundColor: '#f3f4f6', borderRadius: 10, padding: 11, marginTop: 8, fontSize: 14, color: '#111' }}
              />
            )}

            {CORNERS.map((c) => (
              <View key={c} style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>{CORNER_LABELS[c]}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setScores((s) => ({ ...s, [c]: n }))}
                      style={{
                        width: 40, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: scores[c] === n ? '#111' : '#f3f4f6',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '800', color: scores[c] === n ? '#fff' : '#374151' }}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor="#9ca3af"
              multiline
              style={{ backgroundColor: '#f3f4f6', borderRadius: 10, padding: 11, marginTop: 14, fontSize: 14, color: '#111', minHeight: 60 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowForm(false)} disabled={saving} style={{ padding: 10 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={save}
                disabled={saving}
                style={{ paddingVertical: 10, paddingHorizontal: 22, backgroundColor: '#111', borderRadius: 12, opacity: saving ? 0.6 : 1 }}
              >
                <Text style={{ fontWeight: '700', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
