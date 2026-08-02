/**
 * FormationsScreen — manage custom formations per format (7v7 / 9v9 / 11v11).
 * Built-in formations are shown locked; custom ones (stored on the club)
 * can be added with a validated "2-4-2" style input and removed with ×.
 * Custom formations appear in every formation picker (match creation,
 * mid-game switch) alongside the built-ins.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { listenMyClubId } from '../../services/clubService';
import { DEFAULT_FORMATS, type FormationPosition } from '../../services/formationDefaults';
import {
  addCustomFormation,
  customFormationDef,
  listenCustomFormations,
  removeCustomFormation,
  validateFormationName,
  outfieldCount,
  type CustomFormationsByFormat,
} from '../../services/formationConfigService';

// ── Full-size vertical pitch preview ─────────────────────────────────────────
const PW = 280;
const PH = 380;

function FormationPitch({ positions }: { positions: FormationPosition[] }) {
  const L = 'rgba(255,255,255,0.45)';
  return (
    <View style={{
      width: PW, height: PH, backgroundColor: '#1a8c42', borderRadius: 14,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden', alignSelf: 'center',
    }}>
      {/* Halfway line + centre circle */}
      <View style={{ position: 'absolute', top: PH / 2 - 1, left: 0, right: 0, height: 2, backgroundColor: L }} />
      <View style={{
        position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 1.5,
        borderColor: L, left: PW / 2 - 38, top: PH / 2 - 38,
      }} />
      {/* Penalty boxes */}
      <View style={{ position: 'absolute', top: -2, left: PW * 0.22, width: PW * 0.56, height: 52, borderWidth: 1.5, borderColor: L }} />
      <View style={{ position: 'absolute', bottom: -2, left: PW * 0.22, width: PW * 0.56, height: 52, borderWidth: 1.5, borderColor: L }} />

      {/* Player dots */}
      {positions.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.x * PW - 14,
            top: p.y * PH - 14,
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: p.role === 'GK' ? '#f59e0b' : '#fff',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.15)',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#0a1628' }}>{p.role}</Text>
        </View>
      ))}
    </View>
  );
}

export default function FormationsScreen() {
  const uid = auth().currentUser?.uid ?? null;
  const [clubId, setClubId] = useState<string | null>(null);
  const [customs, setCustoms] = useState<CustomFormationsByFormat>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ title: string; positions: FormationPosition[] } | null>(null);

  useEffect(() => {
    if (!uid) return;
    return listenMyClubId(uid, setClubId);
  }, [uid]);

  useEffect(() => {
    if (!clubId) return;
    return listenCustomFormations(clubId, setCustoms);
  }, [clubId]);

  const formats = useMemo(
    () => Object.entries(DEFAULT_FORMATS).filter(([, v]) => v.enabled),
    [],
  );

  const onAdd = async (formatKey: string) => {
    if (!clubId) return;
    const draft = (drafts[formatKey] || '').trim();
    const error = validateFormationName(draft, formatKey, customs[formatKey] ?? []);
    if (error) { Alert.alert('Invalid formation', error); return; }
    try {
      await addCustomFormation(clubId, formatKey, draft);
      setDrafts((d) => ({ ...d, [formatKey]: '' }));
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    }
  };

  const onRemove = (formatKey: string, name: string) => {
    if (!clubId) return;
    Alert.alert('Remove formation', `Remove ${name} from ${formatKey}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeCustomFormation(clubId, formatKey, name).catch((e: any) =>
            Alert.alert('Remove failed', e?.message ?? 'Unknown error'),
          ),
      },
    ]);
  };

  if (!clubId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Text style={{ fontSize: 15, color: '#9ca3af', textAlign: 'center', lineHeight: 22 }}>
          Create a team first — custom formations are saved with your club.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, lineHeight: 19 }}>
            Add your own formations per format — they appear in every formation picker.
            Lines are back to front: 2-4-2 means 2 defenders, 4 midfielders, 2 forwards.
          </Text>

          {formats.map(([formatKey, def]) => {
            const customList = customs[formatKey] ?? [];
            return (
              <View key={formatKey} style={{ marginBottom: 22 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', letterSpacing: 0.3, marginBottom: 8 }}>
                  {def.label}
                  <Text style={{ color: '#9ca3af', fontWeight: '500' }}>
                    {'  '}· {outfieldCount(formatKey)} outfield + GK
                  </Text>
                </Text>

                <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 }}>
                  {/* Built-in + custom chips */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {def.formations.filter((f) => !f.disabled).map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => setPreview({ title: `${def.label} · ${f.name}`, positions: f.positions })}
                        style={{
                          paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                          backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {customList.map((name) => (
                      <TouchableOpacity
                        key={name}
                        onPress={() =>
                          setPreview({ title: `${def.label} · ${name}`, positions: customFormationDef(name, formatKey).positions })
                        }
                        style={{
                          paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                          backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{name}</Text>
                        <TouchableOpacity
                          onPress={() => onRemove(formatKey, name)}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#f87171' }}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Add row */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TextInput
                      value={drafts[formatKey] ?? ''}
                      onChangeText={(t) => setDrafts((d) => ({ ...d, [formatKey]: t }))}
                      placeholder={`e.g. ${formatKey === '7v7' ? '3-1-2' : formatKey === '9v9' ? '2-4-2' : '4-5-1'}`}
                      placeholderTextColor="#9ca3af"
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      style={{
                        flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111',
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => onAdd(formatKey)}
                      style={{
                        backgroundColor: (drafts[formatKey] ?? '').trim() ? '#111' : '#e5e7eb',
                        borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center',
                      }}
                    >
                      <Text style={{
                        fontSize: 14, fontWeight: '800',
                        color: (drafts[formatKey] ?? '').trim() ? '#fff' : '#9ca3af',
                      }}>
                        Add
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Formation preview ── */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPreview(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 }}
        >
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111', textAlign: 'center', marginBottom: 14 }}>
              {preview?.title}
            </Text>
            {preview && <FormationPitch positions={preview.positions} />}
            <TouchableOpacity
              onPress={() => setPreview(null)}
              style={{ backgroundColor: '#111', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
