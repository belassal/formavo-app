import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, FlatList } from 'react-native';
import type { PlayerLite } from '../../../services/lineupMapping';
import type { GoalSide, PitchPos } from '../../../models/matchEvent';

type WizardPreset =
  | { type: 'goal'; side: GoalSide }
  | { type: 'card' };

type Props = {
  visible: boolean;
  preset: WizardPreset | null;
  starters: PlayerLite[];
  onCancel: () => void;
  onSave: (payload: {
    type: 'goal'|'card';
    side?: GoalSide;
    pos?: PitchPos;
    assistPos?: PitchPos;
    scorerId?: string;
    assistId?: string;
    playerId?: string;
    cardColor?: 'yellow'|'red';
  }) => void;
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function MiniPitchPicker(props: {
  pos?: PitchPos;
  onPick: (p: PitchPos) => void;
}) {
  return (
    <View style={mp.wrap}>
      <Pressable
        style={mp.pitch}
        onPress={(e) => {
          const { locationX, locationY } = e.nativeEvent;
          const w = mpSize.w;
          const h = mpSize.h;
          props.onPick({ x: clamp01(locationX / w), y: clamp01(locationY / h) });
        }}
      >
        <View pointerEvents="none" style={mp.halfLine} />
        <View pointerEvents="none" style={mp.centerCircle} />
        {props.pos && (
          <View
            pointerEvents="none"
            style={[
              mp.marker,
              { left: props.pos.x * mpSize.w - 6, top: props.pos.y * mpSize.h - 6 },
            ]}
          />
        )}
      </Pressable>
      <Text style={mp.hint}>Tap to mark location (optional)</Text>
    </View>
  );
}

const mpSize = { w: 300, h: 200 };

export default function EventWizard({ visible, preset, starters, onCancel, onSave }: Props) {
  const isGoal = preset?.type === 'goal';
  const isCard = preset?.type === 'card';

  const [goalPos, setGoalPos] = useState<PitchPos | undefined>(undefined);
  const [assistPos, setAssistPos] = useState<PitchPos | undefined>(undefined);

  const [scorerId, setScorerId] = useState<string>('');
  const [assistId, setAssistId] = useState<string>('');
  const [cardPlayerId, setCardPlayerId] = useState<string>('');
  const [cardColor, setCardColor] = useState<'yellow'|'red'>('yellow');

  // reset when opening/preset changes
  React.useEffect(() => {
    if (!visible) return;
    setGoalPos(undefined);
    setAssistPos(undefined);
    setScorerId('');
    setAssistId('');
    setCardPlayerId('');
    setCardColor('yellow');
  }, [visible, preset?.type, (preset as any)?.side]);

  const title = useMemo(() => {
    if (!preset) return 'Log Event';
    if (preset.type === 'goal') return preset.side === 'home' ? 'Log Home Goal' : 'Log Away Goal';
    return 'Log Card';
  }, [preset]);

  const canSave =
    (isGoal && !!scorerId) ||
    (isCard && !!cardPlayerId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>{title}</Text>

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
                renderItem={({ item }) => {
                  const active = scorerId === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => setScorerId(item.id)}
                      style={[s.pickRow, active ? s.pickRowActive : null]}
                    >
                      <Text style={[s.pickText, active ? { color:'white' } : null]}>
                        {item.name}{item.number ? `  #${item.number}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 180 }}
              />

              <Text style={s.section}>Assist (optional)</Text>
              <FlatList
                data={starters.filter(p => p.id !== scorerId)}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => {
                  const active = assistId === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => setAssistId(active ? '' : item.id)}
                      style={[s.pickRow, active ? s.pickRowActive : null]}
                    >
                      <Text style={[s.pickText, active ? { color:'white' } : null]}>
                        {item.name}{item.number ? `  #${item.number}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 180 }}
              />
            </>
          )}

          {isCard && (
            <>
              <Text style={s.section}>Player</Text>
              <FlatList
                data={starters}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => {
                  const active = cardPlayerId === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => setCardPlayerId(item.id)}
                      style={[s.pickRow, active ? s.pickRowActive : null]}
                    >
                      <Text style={[s.pickText, active ? { color:'white' } : null]}>
                        {item.name}{item.number ? `  #${item.number}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 220 }}
              />

              <Text style={s.section}>Card</Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                <TouchableOpacity
                  onPress={() => setCardColor('yellow')}
                  style={[s.btn, cardColor === 'yellow' ? s.btnOn : null]}
                >
                  <Text style={[s.btnText, cardColor === 'yellow' ? { color:'white' } : null]}>Yellow</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setCardColor('red')}
                  style={[s.btn, cardColor === 'red' ? s.btnOn : null]}
                >
                  <Text style={[s.btnText, cardColor === 'red' ? { color:'white' } : null]}>Red</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={s.footer}>
            <TouchableOpacity onPress={onCancel} style={[s.btn, { backgroundColor:'transparent' }]}>
              <Text style={[s.btnText, { color:'#111' }]}>Cancel</Text>
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
                } else {
                  onSave({
                    type: 'card',
                    pos: goalPos,
                    playerId: cardPlayerId,
                    cardColor,
                  });
                }
              }}
              style={[s.btn, { backgroundColor:'#111' }, !canSave ? { opacity:0.4 } : null]}
            >
              <Text style={[s.btnText, { color:'white' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.35)', justifyContent:'flex-end' },
  sheet: { backgroundColor:'white', padding:16, borderTopLeftRadius:18, borderTopRightRadius:18, maxHeight:'90%' },
  title: { fontSize:18, fontWeight:'900' },
  section: { marginTop:12, fontWeight:'900' },
  pickRow: { borderWidth:1, borderColor:'#ddd', borderRadius:12, padding:12, marginTop:10 },
  pickRowActive: { backgroundColor:'#111', borderColor:'#111' },
  pickText: { fontWeight:'900', color:'#111' },
  footer: { flexDirection:'row', justifyContent:'flex-end', gap:10, marginTop:14 },
  btn: { paddingVertical:10, paddingHorizontal:14, borderWidth:1, borderRadius:12, borderColor:'#111' },
  btnOn: { backgroundColor:'#111' },
  btnText: { fontWeight:'900' },
});

const mp = StyleSheet.create({
  wrap: { marginTop: 12, alignItems:'center' },
  pitch: {
    width: mpSize.w,
    height: mpSize.h,
    backgroundColor: '#0f7a3a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.12)',
    overflow:'hidden',
  },
  halfLine: { position:'absolute', top:'50%', left:0, right:0, height:2, backgroundColor:'rgba(255,255,255,0.35)' },
  centerCircle: {
    position:'absolute', width:80, height:80, borderRadius:40, borderWidth:2, borderColor:'rgba(255,255,255,0.35)',
    left:'50%', top:'50%', transform:[{ translateX:-40 }, { translateY:-40 }],
  },
  marker: { position:'absolute', width:12, height:12, borderRadius:6, backgroundColor:'white' },
  hint: { marginTop: 8, color:'#444', fontSize: 12, fontWeight:'600' },
});
