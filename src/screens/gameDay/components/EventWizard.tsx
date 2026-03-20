import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, FlatList, ScrollView } from 'react-native';
import type { PlayerLite } from '../../../services/lineupMapping';
import type { GoalSide, PitchPos } from '../../../models/matchEvent';

type WizardPreset =
  | { type: 'goal'; side: GoalSide }
  | { type: 'card' }
  | { type: 'sub' };

type Props = {
  visible: boolean;
  preset: WizardPreset | null;
  starters: PlayerLite[];
  bench: PlayerLite[];
  onCancel: () => void;
  onSave: (payload: {
    type: 'goal' | 'card' | 'sub';
    side?: GoalSide;
    pos?: PitchPos;
    assistPos?: PitchPos;
    scorerId?: string;
    assistId?: string;
    playerId?: string;
    cardColor?: 'yellow' | 'red';
    inPlayerId?: string;
    outPlayerId?: string;
  }) => void;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function MiniPitchPicker(props: {
  pos?: PitchPos;
  onPick: (p: PitchPos) => void;
}) {
  const L = 'rgba(255,255,255,0.40)'; // line colour
  const LB = 'rgba(255,255,255,0.70)'; // goal box brighter

  return (
    <View style={mp.wrap}>
      <Pressable
        style={mp.pitch}
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          props.onPick({ x: clamp01(locationX / mpSize.w), y: clamp01(locationY / mpSize.h) });
        }}
      >
        {/* ── Halfway line ── */}
        <View pointerEvents="none" style={[mp.line, { top: CY - 1, left: 0, right: 0, height: 2 }]} />

        {/* ── Center circle ── */}
        <View pointerEvents="none" style={[mp.circle, {
          width: CR * 2, height: CR * 2, borderRadius: CR,
          left: CX - CR, top: CY - CR,
          borderColor: L,
        }]} />

        {/* ── Center spot ── */}
        <View pointerEvents="none" style={[mp.spot, { left: CX - 3, top: CY - 3 }]} />

        {/* ══ TOP GOAL (attacking end) ══ */}
        {/* Goal posts */}
        <View pointerEvents="none" style={[mp.box, {
          top: -2, left: POST_L, width: POST_W, height: POST_H + 2,
          borderColor: LB, backgroundColor: 'rgba(255,255,255,0.10)',
        }]} />
        {/* 6-yard box */}
        <View pointerEvents="none" style={[mp.box, {
          top: -2, left: GOAL_L, width: GOAL_W, height: GOAL_H + 2,
          borderColor: L,
        }]} />
        {/* Penalty area */}
        <View pointerEvents="none" style={[mp.box, {
          top: -2, left: PEN_L, width: PEN_W, height: PEN_H + 2,
          borderColor: L,
        }]} />
        {/* Penalty spot */}
        <View pointerEvents="none" style={[mp.spot, { left: CX - 3, top: SPOT_Y - 3 }]} />

        {/* ══ BOTTOM GOAL (defensive end) ══ */}
        {/* Goal posts */}
        <View pointerEvents="none" style={[mp.box, {
          bottom: -2, left: POST_L, width: POST_W, height: POST_H + 2,
          borderColor: LB, backgroundColor: 'rgba(255,255,255,0.10)',
        }]} />
        {/* 6-yard box */}
        <View pointerEvents="none" style={[mp.box, {
          bottom: -2, left: GOAL_L, width: GOAL_W, height: GOAL_H + 2,
          borderColor: L,
        }]} />
        {/* Penalty area */}
        <View pointerEvents="none" style={[mp.box, {
          bottom: -2, left: PEN_L, width: PEN_W, height: PEN_H + 2,
          borderColor: L,
        }]} />
        {/* Penalty spot */}
        <View pointerEvents="none" style={[mp.spot, {
          left: CX - 3, top: mpSize.h - SPOT_Y - 3,
        }]} />

        {/* ── Corner arcs ── */}
        {[
          { top: -8,  left: -8  },
          { top: -8,  right: -8 },
          { bottom: -8, left: -8  },
          { bottom: -8, right: -8 },
        ].map((pos, i) => (
          <View key={i} pointerEvents="none" style={[mp.corner, pos, { borderColor: L }]} />
        ))}

        {/* ── Tap marker ── */}
        {props.pos && (
          <View
            pointerEvents="none"
            style={[mp.marker, {
              left: props.pos.x * mpSize.w - 7,
              top: props.pos.y * mpSize.h - 7,
            }]}
          />
        )}
      </Pressable>
      <Text style={mp.hint}>Tap to mark location (optional)</Text>
    </View>
  );
}

const mpSize = { w: 300, h: 220 };

// Pitch dimensions: 300×220 represents a standard 68m×105m pitch
// xScale = 300/68 ≈ 4.41 px/m,  yScale = 220/105 ≈ 2.095 px/m
const PEN_W    = 178;  // penalty area width  (40.32m)
const PEN_H    = 35;   // penalty area depth  (16.5m)
const PEN_L    = (300 - PEN_W) / 2;   // 61px

const GOAL_W   = 81;   // 6-yard box width    (18.32m)
const GOAL_H   = 12;   // 6-yard box depth    (5.5m)
const GOAL_L   = (300 - GOAL_W) / 2;  // ~109px

const POST_W   = 32;   // goal posts width    (7.32m)
const POST_H   = 7;    // goal depth (visual only)
const POST_L   = (300 - POST_W) / 2;  // 134px

const SPOT_Y   = 23;   // penalty spot from goal line (11m)
const CX       = 150;  // center x
const CY       = 110;  // center y (220/2)
const CR       = 30;   // center circle radius (visual)

export default function EventWizard({ visible, preset, starters, bench, onCancel, onSave }: Props) {
  const isGoal = preset?.type === 'goal';
  const isCard = preset?.type === 'card';
  const isSub = preset?.type === 'sub';

  const [goalPos, setGoalPos] = useState<PitchPos | undefined>(undefined);
  const [assistPos, setAssistPos] = useState<PitchPos | undefined>(undefined);

  const [scorerId, setScorerId] = useState<string>('');
  const [assistId, setAssistId] = useState<string>('');
  const [cardPlayerId, setCardPlayerId] = useState<string>('');
  const [cardColor, setCardColor] = useState<'yellow' | 'red'>('yellow');
  const [subOutId, setSubOutId] = useState<string>('');
  const [subInId, setSubInId] = useState<string>('');

  // reset when opening/preset changes
  React.useEffect(() => {
    if (!visible) return;
    setGoalPos(undefined);
    setAssistPos(undefined);
    setScorerId('');
    setAssistId('');
    setCardPlayerId('');
    setCardColor('yellow');
    setSubOutId('');
    setSubInId('');
  }, [visible, preset?.type, (preset as any)?.side]);

  const title = useMemo(() => {
    if (!preset) return 'Log Event';
    if (preset.type === 'goal') return preset.side === 'home' ? 'Log Home Goal' : 'Log Away Goal';
    if (preset.type === 'sub') return 'Substitution';
    return 'Log Card';
  }, [preset]);

  const canSave =
    (isGoal && !!scorerId) ||
    (isCard && !!cardPlayerId) ||
    (isSub && !!subOutId && !!subInId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>{title}</Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {isGoal && (
              <>
                <Text style={s.section}>Goal location</Text>
                <MiniPitchPicker pos={goalPos} onPick={setGoalPos} />

                {!!assistId && (
                  <>
                    <Text style={s.section}>Assist origin</Text>
                    <MiniPitchPicker pos={assistPos} onPick={setAssistPos} />
                  </>
                )}
              </>
            )}

            {isCard && (
              <>
                <Text style={s.section}>Card location (optional)</Text>
                <MiniPitchPicker pos={goalPos} onPick={setGoalPos} />
              </>
            )}

            {isGoal && (
              <>
                <Text style={s.section}>Scorer</Text>
                <FlatList
                  data={starters}
                  keyExtractor={(p) => p.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const active = scorerId === item.id;
                    return (
                      <TouchableOpacity
                        onPress={() => setScorerId(item.id)}
                        style={[s.pickRow, active ? s.pickRowActive : null]}
                      >
                        <Text style={[s.pickText, active ? { color: 'white' } : null]}>
                          {item.name}{item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                <Text style={s.section}>Assist (optional)</Text>
                <FlatList
                  data={starters.filter(p => p.id !== scorerId)}
                  keyExtractor={(p) => p.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const active = assistId === item.id;
                    return (
                      <TouchableOpacity
                        onPress={() => setAssistId(active ? '' : item.id)}
                        style={[s.pickRow, active ? s.pickRowActive : null]}
                      >
                        <Text style={[s.pickText, active ? { color: 'white' } : null]}>
                          {item.name}{item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}

            {isCard && (
              <>
                <Text style={s.section}>Player</Text>
                <FlatList
                  data={starters}
                  keyExtractor={(p) => p.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => {
                    const active = cardPlayerId === item.id;
                    return (
                      <TouchableOpacity
                        onPress={() => setCardPlayerId(item.id)}
                        style={[s.pickRow, active ? s.pickRowActive : null]}
                      >
                        <Text style={[s.pickText, active ? { color: 'white' } : null]}>
                          {item.name}{item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                <Text style={s.section}>Card</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setCardColor('yellow')}
                    style={[s.btn, cardColor === 'yellow' ? s.btnOn : null]}
                  >
                    <Text style={[s.btnText, cardColor === 'yellow' ? { color: 'white' } : null]}>Yellow</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setCardColor('red')}
                    style={[s.btn, cardColor === 'red' ? s.btnOn : null]}
                  >
                    <Text style={[s.btnText, cardColor === 'red' ? { color: 'white' } : null]}>Red</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {isSub && (
              <>
                <Text style={s.section}>Player Off</Text>
                {starters.length === 0 ? (
                  <Text style={s.emptyHint}>No starters on pitch.</Text>
                ) : (
                  <FlatList
                    data={starters}
                    keyExtractor={(p) => p.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const active = subOutId === item.id;
                      return (
                        <TouchableOpacity
                          onPress={() => setSubOutId(item.id)}
                          style={[s.pickRow, active ? s.pickRowActive : null]}
                        >
                          <Text style={[s.pickText, active ? { color: 'white' } : null]}>
                            {item.name}{item.number ? `  #${item.number}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}

                <Text style={s.section}>Player On</Text>
                {bench.length === 0 ? (
                  <Text style={s.emptyHint}>No bench players available.</Text>
                ) : (
                  <FlatList
                    data={bench.filter(p => p.id !== subOutId)}
                    keyExtractor={(p) => p.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => {
                      const active = subInId === item.id;
                      return (
                        <TouchableOpacity
                          onPress={() => setSubInId(item.id)}
                          style={[s.pickRow, active ? s.pickRowActive : null]}
                        >
                          <Text style={[s.pickText, active ? { color: 'white' } : null]}>
                            {item.name}{item.number ? `  #${item.number}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity onPress={onCancel} style={[s.btn, { backgroundColor: 'transparent' }]}>
              <Text style={[s.btnText, { color: '#111' }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!canSave}
              onPress={() => {
                if (!preset) return;

                if (preset.type === 'goal') {
                  onSave({
                    type: 'goal',
                    side: preset.side,
                    pos: goalPos,
                    assistPos: assistId ? assistPos : undefined,
                    scorerId,
                    assistId: assistId || undefined,
                  });
                } else if (preset.type === 'card') {
                  onSave({
                    type: 'card',
                    pos: goalPos,
                    playerId: cardPlayerId,
                    cardColor,
                  });
                } else {
                  onSave({
                    type: 'sub',
                    outPlayerId: subOutId,
                    inPlayerId: subInId,
                  });
                }
              }}
              style={[s.btn, { backgroundColor: '#111' }, !canSave ? { opacity: 0.4 } : null]}
            >
              <Text style={[s.btnText, { color: 'white' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90%' },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 4 },
  section: { marginTop: 12, fontWeight: '900' },
  emptyHint: { marginTop: 8, color: '#9ca3af', fontSize: 13 },
  pickRow: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginTop: 10 },
  pickRowActive: { backgroundColor: '#111', borderColor: '#111' },
  pickText: { fontWeight: '900', color: '#111' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, borderColor: '#111' },
  btnOn: { backgroundColor: '#111' },
  btnText: { fontWeight: '900' },
});

const mp = StyleSheet.create({
  wrap: { marginTop: 12, alignItems: 'center' },
  pitch: {
    width: mpSize.w,
    height: mpSize.h,
    backgroundColor: '#1a8c42',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  // generic full-width/height line
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.40)' },
  // unfilled circle / arc
  circle: { position: 'absolute', borderWidth: 1.5, backgroundColor: 'transparent' },
  // rectangular box outline (penalty area, goal box, etc.)
  box: {
    position: 'absolute',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  // small filled dot
  spot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.75)' },
  // corner quarter-circle (16×16 circle, three sides hidden by overflow)
  corner: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, backgroundColor: 'transparent' },
  // tap marker
  marker: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#facc15',
    borderWidth: 2, borderColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  hint: { marginTop: 8, color: '#444', fontSize: 12, fontWeight: '600' },
});
