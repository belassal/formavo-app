/**
 * FormationsScreen — manage formations per format (7v7 / 9v9 / 11v11).
 *
 * - Built-in formations shown locked; club custom ones added via a validated
 *   "2-4-2" input and removable with ×.
 * - Tap any formation chip to open it on a full pitch where the dots are
 *   DRAGGABLE. Saving stores a club-wide default layout for that formation —
 *   every future match pitch starts from it (per-match drags still override).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import { DEFAULT_FORMATS } from '../../services/formationDefaults';
import { buildSlots, type Slot } from '../../services/formation';
import { slotRoles } from '../../services/positionMatch';
import {
  addCustomFormation,
  applyLayout,
  clearFormationLayout,
  listenFormationConfig,
  removeCustomFormation,
  saveFormationLayout,
  validateFormationName,
  outfieldCount,
  type FormationConfig,
  type SlotPosMap,
} from '../../services/formationConfigService';

const PW = 300;
const PH = 400;
const DOT = 34;

const ROLES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function DraggableDot({
  slotKey,
  role,
  x,
  y,
  onDrop,
  onTap,
}: {
  slotKey: string;
  role: string;
  x: number;
  y: number;
  onDrop: (slotKey: string, x: number, y: number) => void;
  onTap: (slotKey: string) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef({ x, y });
  useEffect(() => { startRef.current = { x, y }; }, [x, y]);
  const callbacksRef = useRef({ onDrop, onTap });
  useEffect(() => { callbacksRef.current = { onDrop, onTap }; }, [onDrop, onTap]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => setDrag({ dx: g.dx, dy: g.dy }),
      onPanResponderRelease: (_, g) => {
        setDrag(null);
        // Small movement = a tap → open the role picker instead of moving
        if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
          callbacksRef.current.onTap(slotKey);
          return;
        }
        callbacksRef.current.onDrop(
          slotKey,
          clamp(startRef.current.x + g.dx / PW, 0.05, 0.95),
          clamp(startRef.current.y + g.dy / PH, 0.05, 0.95),
        );
      },
      onPanResponderTerminate: () => setDrag(null),
    }),
  ).current;

  const left = x * PW - DOT / 2 + (drag?.dx ?? 0);
  const top = y * PH - DOT / 2 + (drag?.dy ?? 0);

  return (
    <View
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        left,
        top,
        width: DOT,
        height: DOT,
        borderRadius: DOT / 2,
        backgroundColor: role === 'GK' ? '#f59e0b' : '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: drag ? '#4ade80' : 'rgba(0,0,0,0.15)',
        shadowColor: '#000',
        shadowOpacity: drag ? 0.4 : 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: '800', color: '#0a1628' }}>{role}</Text>
    </View>
  );
}

export default function FormationsScreen() {
  const uid = auth().currentUser?.uid ?? null;
  const [clubId, setClubId] = useState<string | null>(null);
  const [config, setConfig] = useState<FormationConfig>({ byFormat: {}, layouts: {} });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Editor state
  const [preview, setPreview] = useState<{ formatKey: string; name: string } | null>(null);
  const [editLayout, setEditLayout] = useState<SlotPosMap>({});
  const [dirty, setDirty] = useState(false);
  const [rolePickerSlot, setRolePickerSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    return listenMyClubId(uid, setClubId);
  }, [uid]);

  useEffect(() => {
    if (!clubId) return;
    return listenFormationConfig(clubId, setConfig);
  }, [clubId]);

  const formats = useMemo(
    () => Object.entries(DEFAULT_FORMATS).filter(([, v]) => v.enabled),
    [],
  );

  const openPreview = (formatKey: string, name: string) => {
    setEditLayout(config.layouts[formatKey]?.[name] ?? {});
    setDirty(false);
    setPreview({ formatKey, name });
  };

  const previewSlots: Slot[] = useMemo(() => {
    if (!preview) return [];
    return applyLayout(buildSlots(preview.name), editLayout);
  }, [preview, editLayout]);

  const hasSavedLayout = !!(preview && config.layouts[preview.formatKey]?.[preview.name]);

  const onDropDot = (slotKey: string, x: number, y: number) => {
    setEditLayout((prev) => ({ ...prev, [slotKey]: { ...prev[slotKey], x, y } }));
    setDirty(true);
  };

  const onPickRole = (role: string | null) => {
    const slotKey = rolePickerSlot;
    setRolePickerSlot(null);
    if (!slotKey) return;
    const base = previewSlots.find((s) => s.key === slotKey);
    if (!base) return;
    setEditLayout((prev) => {
      const cur = prev[slotKey] ?? { x: base.x, y: base.y };
      const next = { x: cur.x, y: cur.y, ...(role ? { role } : {}) };
      return { ...prev, [slotKey]: next };
    });
    setDirty(true);
  };

  const onSaveLayout = async () => {
    if (!clubId || !preview) return;
    // Persist the complete current geometry (+ chosen roles) so future tweaks are stable
    const full: SlotPosMap = {};
    for (const s of previewSlots) {
      full[s.key] = { x: s.x, y: s.y, ...(s.role ? { role: s.role } : {}) };
    }
    try {
      await saveFormationLayout(clubId, preview.formatKey, preview.name, full);
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    }
  };

  const onResetLayout = async () => {
    if (!clubId || !preview) return;
    try {
      await clearFormationLayout(clubId, preview.formatKey, preview.name);
      setEditLayout({});
      setDirty(false);
    } catch (e: any) {
      Alert.alert('Reset failed', e?.message ?? 'Unknown error');
    }
  };

  const onAdd = async (formatKey: string) => {
    if (!clubId) return;
    const draft = (drafts[formatKey] || '').trim();
    const error = validateFormationName(draft, formatKey, config.byFormat[formatKey] ?? []);
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
        onPress: () => {
          removeCustomFormation(clubId, formatKey, name).catch((e: any) =>
            Alert.alert('Remove failed', e?.message ?? 'Unknown error'),
          );
          clearFormationLayout(clubId, formatKey, name).catch(() => {});
        },
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

  const L = 'rgba(255,255,255,0.45)';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16, lineHeight: 19 }}>
            Tap a formation to see it on the pitch — drag players to fine-tune and save
            your club's default layout. Lines are back to front: 2-4-2 means 2 defenders,
            4 midfielders, 2 forwards.
          </Text>

          {formats.map(([formatKey, def]) => {
            const customList = config.byFormat[formatKey] ?? [];
            const layoutFor = (name: string) => !!config.layouts[formatKey]?.[name];
            return (
              <View key={formatKey} style={{ marginBottom: 22 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', letterSpacing: 0.3, marginBottom: 8 }}>
                  {def.label}
                  <Text style={{ color: '#9ca3af', fontWeight: '500' }}>
                    {'  '}· {outfieldCount(formatKey)} outfield + GK
                  </Text>
                </Text>

                <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {def.formations.filter((f) => !f.disabled).map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => openPreview(formatKey, f.name)}
                        style={{
                          paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                          backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>
                          {f.name}{layoutFor(f.name) ? ' ✎' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {customList.map((name) => (
                      <TouchableOpacity
                        key={name}
                        onPress={() => openPreview(formatKey, name)}
                        style={{
                          paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                          backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>
                          {name}{layoutFor(name) ? ' ✎' : ''}
                        </Text>
                        <TouchableOpacity
                          onPress={() => onRemove(formatKey, name)}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#f87171' }}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>

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

      {/* ── Formation editor ── */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 18 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111', textAlign: 'center' }}>
              {preview ? `${preview.formatKey} · ${preview.name}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 3, marginBottom: 12 }}>
              Drag to reposition · tap a player to rename the position
            </Text>

            <View style={{
              width: PW, height: PH, backgroundColor: '#1a8c42', borderRadius: 14,
              borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', overflow: 'hidden', alignSelf: 'center',
            }}>
              <View style={{ position: 'absolute', top: PH / 2 - 1, left: 0, right: 0, height: 2, backgroundColor: L }} />
              <View style={{
                position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 1.5,
                borderColor: L, left: PW / 2 - 40, top: PH / 2 - 40,
              }} />
              <View style={{ position: 'absolute', top: -2, left: PW * 0.22, width: PW * 0.56, height: 54, borderWidth: 1.5, borderColor: L }} />
              <View style={{ position: 'absolute', bottom: -2, left: PW * 0.22, width: PW * 0.56, height: 54, borderWidth: 1.5, borderColor: L }} />

              {preview && previewSlots.map((s) => (
                <DraggableDot
                  key={s.key}
                  slotKey={s.key}
                  role={s.role ?? slotRoles(s, preview.name)[0] ?? s.label}
                  x={s.x}
                  y={s.y}
                  onDrop={onDropDot}
                  onTap={setRolePickerSlot}
                />
              ))}

              {/* ── Role picker overlay ── */}
              {rolePickerSlot && (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(10,22,40,0.88)', justifyContent: 'center', padding: 18,
                }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15, textAlign: 'center', marginBottom: 14 }}>
                    Position name for this spot
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {ROLES.map((r) => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => onPickRole(r)}
                        style={{
                          paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10,
                          backgroundColor: '#fff', minWidth: 52, alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0a1628' }}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' }}>
                    <TouchableOpacity
                      onPress={() => onPickRole(null)}
                      style={{ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Auto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setRolePickerSlot(null)}
                      style={{ paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {(dirty || hasSavedLayout) && (
                <TouchableOpacity
                  onPress={onResetLayout}
                  style={{
                    flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
                    borderWidth: 1, borderColor: '#d1d5db',
                  }}
                >
                  <Text style={{ color: '#374151', fontWeight: '700', fontSize: 14 }}>Reset</Text>
                </TouchableOpacity>
              )}
              {dirty && (
                <TouchableOpacity
                  onPress={onSaveLayout}
                  style={{ flex: 1, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Save layout</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setPreview(null)}
                style={{ flex: 1, backgroundColor: '#111', borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  {dirty ? 'Close without saving' : 'Close'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
