/**
 * MiniPitchDisplay — read-only mini pitch that shows goal / assist positions.
 * Same markings as the EventWizard picker, but no tap interaction.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PitchPos } from '../models/matchEvent';

type Props = {
  goalPos?: PitchPos;
  assistPos?: PitchPos;
};

const W = 300;
const H = 220;

// Same proportions as EventWizard MiniPitchPicker
const PEN_W  = 178;  const PEN_H  = 35;   const PEN_L  = (W - PEN_W)  / 2;
const GOAL_W = 81;   const GOAL_H = 12;   const GOAL_L = (W - GOAL_W) / 2;
const POST_W = 32;   const POST_H = 7;    const POST_L = (W - POST_W) / 2;
const SPOT_Y = 23;
const CX = W / 2;   const CY = H / 2;   const CR = 30;

export default function MiniPitchDisplay({ goalPos, assistPos }: Props) {
  const L  = 'rgba(255,255,255,0.40)';
  const LB = 'rgba(255,255,255,0.70)';

  return (
    <View style={s.wrap}>
      <View style={s.pitch}>
        {/* Halfway line */}
        <View pointerEvents="none" style={[s.line, { top: CY - 1, left: 0, right: 0, height: 2 }]} />

        {/* Center circle */}
        <View pointerEvents="none" style={[s.circle, { width: CR * 2, height: CR * 2, borderRadius: CR, left: CX - CR, top: CY - CR, borderColor: L }]} />

        {/* Center spot */}
        <View pointerEvents="none" style={[s.spot, { left: CX - 3, top: CY - 3 }]} />

        {/* ── Top goal ── */}
        <View pointerEvents="none" style={[s.box, { top: -2, left: POST_L, width: POST_W, height: POST_H + 2, borderColor: LB, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <View pointerEvents="none" style={[s.box, { top: -2, left: GOAL_L, width: GOAL_W, height: GOAL_H + 2, borderColor: L }]} />
        <View pointerEvents="none" style={[s.box, { top: -2, left: PEN_L,  width: PEN_W,  height: PEN_H  + 2, borderColor: L }]} />
        <View pointerEvents="none" style={[s.spot, { left: CX - 3, top: SPOT_Y - 3 }]} />

        {/* ── Bottom goal ── */}
        <View pointerEvents="none" style={[s.box, { bottom: -2, left: POST_L, width: POST_W, height: POST_H + 2, borderColor: LB, backgroundColor: 'rgba(255,255,255,0.10)' }]} />
        <View pointerEvents="none" style={[s.box, { bottom: -2, left: GOAL_L, width: GOAL_W, height: GOAL_H + 2, borderColor: L }]} />
        <View pointerEvents="none" style={[s.box, { bottom: -2, left: PEN_L,  width: PEN_W,  height: PEN_H  + 2, borderColor: L }]} />
        <View pointerEvents="none" style={[s.spot, { left: CX - 3, top: H - SPOT_Y - 3 }]} />

        {/* ── Corner arcs ── */}
        {([
          { top: -8,    left: -8   },
          { top: -8,    right: -8  },
          { bottom: -8, left: -8   },
          { bottom: -8, right: -8  },
        ] as any[]).map((pos, i) => (
          <View key={i} pointerEvents="none" style={[s.corner, pos, { borderColor: L }]} />
        ))}

        {/* ── Assist marker (draw first so goal marker sits on top) ── */}
        {assistPos && (
          <View
            pointerEvents="none"
            style={[s.assistMarker, { left: assistPos.x * W - 8, top: assistPos.y * H - 8 }]}
          />
        )}

        {/* ── Goal marker ── */}
        {goalPos && (
          <View
            pointerEvents="none"
            style={[s.goalMarker, { left: goalPos.x * W - 9, top: goalPos.y * H - 9 }]}
          >
            <Text style={{ fontSize: 12, lineHeight: 14 }}>⚽</Text>
          </View>
        )}
      </View>

      {/* Legend */}
      {(goalPos || assistPos) && (
        <View style={s.legend}>
          {goalPos   && <View style={s.legendRow}><View style={[s.legendDot, s.legendGoal]} /><Text style={s.legendLabel}>Goal</Text></View>}
          {assistPos && <View style={s.legendRow}><View style={[s.legendDot, s.legendAssist]} /><Text style={s.legendLabel}>Assist</Text></View>}
        </View>
      )}

      {!goalPos && !assistPos && (
        <Text style={s.noLocation}>No location recorded</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { alignItems: 'center', marginTop: 8 },
  pitch: {
    width: W, height: H,
    backgroundColor: '#1a8c42',
    borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  line:   { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.40)' },
  circle: { position: 'absolute', borderWidth: 1.5, backgroundColor: 'transparent' },
  box:    { position: 'absolute', borderWidth: 1.5, backgroundColor: 'transparent' },
  spot:   { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.75)' },
  corner: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, backgroundColor: 'transparent' },

  goalMarker: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#facc15',
    borderWidth: 2, borderColor: 'white',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  assistMarker: {
    position: 'absolute',
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#60a5fa',
    borderWidth: 2, borderColor: 'white',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },

  legend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendGoal:   { backgroundColor: '#facc15' },
  legendAssist: { backgroundColor: '#60a5fa' },
  legendLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  noLocation: { marginTop: 10, fontSize: 13, color: '#9ca3af' },
});
