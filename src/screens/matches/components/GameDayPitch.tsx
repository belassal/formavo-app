import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  PanResponder,
} from 'react-native';

import { buildSlots, type Slot } from '../../../services/formation';
import type { PlayerLite } from '../../../services/lineupMapping';

type SlotPos = { x: number; y: number }; // 0..1 (relative)

type Props = {
  formation: string;
  starters: PlayerLite[];
  playerToSlotKey: Record<string, string>; // playerId -> slotKey

  // Optional per-match custom layout overrides (relative 0..1)
  slotPos?: Record<string, SlotPos>; // slotKey -> {x,y}
  layoutMode?: boolean; // when true: drag bubbles instead of assigning
  onSlotPosChange?: (slotKey: string, pos: SlotPos) => void;

  /** Tap a filled bubble (player). */
  onPlayerPress?: (playerId: string) => void;
  /** Tap a slot (empty or filled) to open the assign modal. */
  onSlotPress?: (slotKey: string) => void;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function slotLabel(slot: Slot) {
  if (slot.key === 'GK') return 'GK';
  return slot.label || '';
}

// Bigger threshold = taps work reliably and pan only takes over on real drags.
const DRAG_THRESHOLD = 14;

function SlotBubble(props: {
  slot: Slot;
  pitchWidth: number;
  pitchHeight: number;
  posOverride?: SlotPos;
  layoutMode?: boolean;
  onDragCommit?: (slotKey: string, pos: SlotPos) => void;
  children: React.ReactNode;
  onPress?: () => void; // open assign OR player press depending on caller
  onLongPress?: () => void; // open assign (normal mode)
  style: any;
}) {
  const {
    slot,
    pitchWidth,
    pitchHeight,
    posOverride,
    layoutMode,
    onDragCommit,
    children,
    onPress,
    onLongPress,
    style,
  } = props;

  const base = posOverride ? posOverride : { x: slot.x, y: slot.y };
  const baseLeft = clamp(base.x, 0.04, 0.96) * pitchWidth;
  const baseTop = clamp(base.y, 0.04, 0.96) * pitchHeight;

  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ left: number; top: number }>({ left: baseLeft, top: baseTop });

  const pan = useMemo(() => {
    return PanResponder.create({
      // Let taps through on start
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,

      // Take over only on real drag
      onMoveShouldSetPanResponder: (_, g) =>
        !!layoutMode && (Math.abs(g.dx) + Math.abs(g.dy) > DRAG_THRESHOLD),
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !!layoutMode && (Math.abs(g.dx) + Math.abs(g.dy) > DRAG_THRESHOLD),

      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: () => {
        if (!layoutMode) return;
        startRef.current = { left: baseLeft, top: baseTop };
        setDrag({ dx: 0, dy: 0 });
      },

      onPanResponderMove: (_, g) => {
        if (!layoutMode) return;
        setDrag({ dx: g.dx, dy: g.dy });
      },

      onPanResponderRelease: (_, g) => {
        if (!layoutMode) return;

        const leftPx = startRef.current.left + g.dx;
        const topPx = startRef.current.top + g.dy;

        const x = clamp(leftPx / pitchWidth, 0.04, 0.96);
        const y = clamp(topPx / pitchHeight, 0.04, 0.96);

        onDragCommit?.(slot.key, { x, y });
        setDrag(null);
      },

      onPanResponderTerminate: () => setDrag(null),
    });
  }, [layoutMode, baseLeft, baseTop, pitchWidth, pitchHeight, onDragCommit, slot.key]);

  const left = startRef.current.left + (drag?.dx ?? 0);
  const top = startRef.current.top + (drag?.dy ?? 0);

  return (
    <View
      collapsable={false}
      {...(layoutMode ? pan.panHandlers : {})}
      style={[style, { left, top }]}
    >
      {children}

      {/* Tap layer:
          - Normal mode: onPress + onLongPress work
          - Layout mode: tap opens assign (and drag still works with threshold)
      */}
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onPress}
        onLongPress={!layoutMode ? onLongPress : undefined}
      />
    </View>
  );
}

export default function GameDayPitch({
  formation,
  starters,
  playerToSlotKey,
  slotPos,
  layoutMode,
  onSlotPosChange,
  onPlayerPress,
  onSlotPress,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;

  // Portrait priority
  const pitchAspectRatio = isPortrait ? 0.66 : 1.6; // width / height

  const pitchSize = useMemo(() => {
    const padding = 20;
    const maxWidth = width - padding * 2;
    const maxHeight = height - padding * 2;

    let pitchWidth = maxWidth;
    let pitchHeight = pitchWidth / pitchAspectRatio;

    if (pitchHeight > maxHeight) {
      pitchHeight = maxHeight;
      pitchWidth = pitchHeight * pitchAspectRatio;
    }

    return { pitchWidth, pitchHeight };
  }, [width, height, pitchAspectRatio]);

  const slots = useMemo(() => buildSlots(formation), [formation]);

  const playerBySlotKey = useMemo(() => {
    const m: Record<string, PlayerLite> = {};
    for (const p of starters || []) {
      const sk = playerToSlotKey?.[p.id];
      if (sk) m[sk] = p;
    }
    return m;
  }, [starters, playerToSlotKey]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.pitch,
          { width: pitchSize.pitchWidth, height: pitchSize.pitchHeight },
        ]}
      >
        <View pointerEvents="none" style={styles.halfLine} />
        <View pointerEvents="none" style={styles.centerCircle} />

        {layoutMode && (
          <View pointerEvents="none" style={styles.hintWrap}>
            <Text style={styles.hintText}>Drag to move • Tap to assign</Text>
          </View>
        )}
        {slots.map((slot) => {
          const player = playerBySlotKey[slot.key];
          const label = slotLabel(slot);

          const openAssign = () => onSlotPress?.(slot.key);

          if (player) {
            return (
              <SlotBubble
                key={slot.key}
                slot={slot}
                pitchWidth={pitchSize.pitchWidth}
                pitchHeight={pitchSize.pitchHeight}
                posOverride={slotPos?.[slot.key]}
                layoutMode={layoutMode}
                onDragCommit={onSlotPosChange}
                onPress={layoutMode ? openAssign : () => onPlayerPress?.(player.id)}
                onLongPress={openAssign}
                style={[
                  styles.player,
                  { transform: [{ translateX: -22 }, { translateY: -22 }] },
                ]}
              >
                <Text style={styles.number}>{player.number || ''}</Text>
                <Text numberOfLines={1} style={styles.name}>
                  {player.name}
                </Text>
                <Text style={styles.slotHint}>{label}</Text>
              </SlotBubble>
            );
          }

          return (
            <SlotBubble
              key={slot.key}
              slot={slot}
              pitchWidth={pitchSize.pitchWidth}
              pitchHeight={pitchSize.pitchHeight}
              posOverride={slotPos?.[slot.key]}
              layoutMode={layoutMode}
              onDragCommit={onSlotPosChange}
              onPress={openAssign}
              style={[
                styles.emptySlot,
                { transform: [{ translateX: -18 }, { translateY: -18 }] },
              ]}
            >
              <Text style={styles.plus}>{layoutMode ? '↕︎' : '+'}</Text>
              <Text style={styles.slotHintEmpty}>{label}</Text>
            </SlotBubble>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1220',
    justifyContent: 'center',
    alignItems: 'center',
  },

  pitch: {
    backgroundColor: '#0f7a3a',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },

  halfLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },

  centerCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    left: '50%',
    top: '50%',
    transform: [{ translateX: -60 }, { translateY: -60 }],
  },

  player: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  number: {
    fontWeight: '800',
    fontSize: 12,
    color: '#0b1220',
  },

  name: {
    fontSize: 9,
    marginTop: 2,
    color: '#0b1220',
    textAlign: 'center',
  },

  emptySlot: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  plus: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 18,
  },

  slotHint: {
    position: 'absolute',
    bottom: -12,
    fontSize: 9,
    color: 'rgba(255,255,255,0.85)',
  },

  slotHintEmpty: {
    position: 'absolute',
    bottom: -12,
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
  },
  hintWrap: {
  position: 'absolute',
  top: 10,
  left: 10,
  right: 10,
  alignItems: 'center',
  zIndex: 50,
  },
  hintText: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },
});