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

  /** Available container size — when provided, pitch fills it exactly */
  containerSize?: { width: number; height: number };
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
  const baseLeft = clamp(base.x, 0.02, 0.98) * pitchWidth;
  const baseTop = clamp(base.y, 0.02, 0.98) * pitchHeight;

  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ left: number; top: number }>({ left: baseLeft, top: baseTop });

  // Sync startRef whenever base position changes (pitch resize, posOverride update) — only when not dragging
  if (!drag) {
    startRef.current = { left: baseLeft, top: baseTop };
  }

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

        const x = clamp(leftPx / pitchWidth, 0.02, 0.98);
        const y = clamp(topPx / pitchHeight, 0.02, 0.98);

        onDragCommit?.(slot.key, { x, y });
        setDrag(null);
      },

      onPanResponderTerminate: () => setDrag(null),
    });
  }, [layoutMode, baseLeft, baseTop, pitchWidth, pitchHeight, onDragCommit, slot.key]);

  const left = drag ? startRef.current.left + drag.dx : baseLeft;
  const top  = drag ? startRef.current.top  + drag.dy : baseTop;

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

// ── Mowed grass stripes ───────────────────────────────────────────────────
function PitchStripes({ width, height }: { width: number; height: number }) {
  const STRIPE_COUNT = 10;
  const stripeH = height / STRIPE_COUNT;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: STRIPE_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * stripeH,
            height: stripeH,
            backgroundColor: i % 2 === 0 ? '#1a7a3c' : '#197338',
          }}
        />
      ))}
    </View>
  );
}

// ── Field markings ────────────────────────────────────────────────────────
function PitchMarkings({ width: W, height: H }: { width: number; height: number }) {
  const lw = 1.5;
  const lc = 'rgba(255,255,255,0.6)';

  const pad = W * 0.025; // inset from edge for boundary line

  // Penalty box: 62% wide, 18% tall
  const pbW = W * 0.62;
  const pbH = H * 0.18;
  const pbX = (W - pbW) / 2;

  // Goal box: 36% wide, 8% tall
  const gbW = W * 0.36;
  const gbH = H * 0.08;
  const gbX = (W - gbW) / 2;

  // Goal (just inside the pitch boundary)
  const goalW = W * 0.24;
  const goalH = H * 0.025;
  const goalX = (W - goalW) / 2;

  // Penalty spot distance from goal line
  const spotY = H * 0.12;
  const spotR = 2.5;

  // Centre circle
  const ccR = Math.min(W, H) * 0.13;

  // Corner arc — small quarter circle, rendered as full circle clipped by overflow:hidden
  const caR = Math.min(W, H) * 0.05;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>

      {/* Outer boundary */}
      <View style={{
        position: 'absolute', top: pad, left: pad, right: pad, bottom: pad,
        borderWidth: lw, borderColor: lc, borderRadius: 2,
      }} />

      {/* Half-way line */}
      <View style={{
        position: 'absolute', top: H * 0.5 - lw / 2,
        left: pad, right: pad, height: lw, backgroundColor: lc,
      }} />

      {/* Centre circle */}
      <View style={{
        position: 'absolute',
        width: ccR * 2, height: ccR * 2, borderRadius: ccR,
        borderWidth: lw, borderColor: lc,
        left: W / 2 - ccR, top: H / 2 - ccR,
      }} />

      {/* Centre spot */}
      <View style={{
        position: 'absolute', width: spotR * 2, height: spotR * 2,
        borderRadius: spotR, backgroundColor: lc,
        left: W / 2 - spotR, top: H / 2 - spotR,
      }} />

      {/* ── Top half ── */}
      {/* Penalty area */}
      <View style={{
        position: 'absolute', top: pad, left: pbX,
        width: pbW, height: pbH,
        borderWidth: lw, borderColor: lc, borderTopWidth: 0,
      }} />
      {/* Goal box */}
      <View style={{
        position: 'absolute', top: pad, left: gbX,
        width: gbW, height: gbH,
        borderWidth: lw, borderColor: lc, borderTopWidth: 0,
      }} />
      {/* Goal line (inside pitch) */}
      <View style={{
        position: 'absolute', top: pad, left: goalX,
        width: goalW, height: goalH,
        borderWidth: lw, borderColor: 'rgba(255,255,255,0.4)', borderTopWidth: 0,
        borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
      }} />
      {/* Penalty spot */}
      <View style={{
        position: 'absolute', width: spotR * 2, height: spotR * 2,
        borderRadius: spotR, backgroundColor: lc,
        left: W / 2 - spotR, top: spotY,
      }} />

      {/* ── Bottom half ── */}
      {/* Penalty area */}
      <View style={{
        position: 'absolute', bottom: pad, left: pbX,
        width: pbW, height: pbH,
        borderWidth: lw, borderColor: lc, borderBottomWidth: 0,
      }} />
      {/* Goal box */}
      <View style={{
        position: 'absolute', bottom: pad, left: gbX,
        width: gbW, height: gbH,
        borderWidth: lw, borderColor: lc, borderBottomWidth: 0,
      }} />
      {/* Goal line (inside pitch) */}
      <View style={{
        position: 'absolute', bottom: pad, left: goalX,
        width: goalW, height: goalH,
        borderWidth: lw, borderColor: 'rgba(255,255,255,0.4)', borderBottomWidth: 0,
        borderTopLeftRadius: 2, borderTopRightRadius: 2,
      }} />
      {/* Penalty spot */}
      <View style={{
        position: 'absolute', width: spotR * 2, height: spotR * 2,
        borderRadius: spotR, backgroundColor: lc,
        left: W / 2 - spotR, bottom: spotY,
      }} />

      {/* ── Corner arcs — centred on each corner, clipped by pitch overflow:hidden ── */}
      <View style={{
        position: 'absolute', top: pad - caR, left: pad - caR,
        width: caR * 2, height: caR * 2, borderRadius: caR,
        borderWidth: lw, borderColor: lc,
      }} />
      <View style={{
        position: 'absolute', top: pad - caR, right: pad - caR,
        width: caR * 2, height: caR * 2, borderRadius: caR,
        borderWidth: lw, borderColor: lc,
      }} />
      <View style={{
        position: 'absolute', bottom: pad - caR, left: pad - caR,
        width: caR * 2, height: caR * 2, borderRadius: caR,
        borderWidth: lw, borderColor: lc,
      }} />
      <View style={{
        position: 'absolute', bottom: pad - caR, right: pad - caR,
        width: caR * 2, height: caR * 2, borderRadius: caR,
        borderWidth: lw, borderColor: lc,
      }} />

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
  containerSize,
}: Props) {
  const dims = useWindowDimensions();

  // Use measured container size when available, otherwise fall back to window dims
  const availW = containerSize?.width  ?? dims.width;
  const availH = containerSize?.height ?? dims.height;

  const pitchSize = useMemo(() => {
    // Fill full container width. Pitch is taller than wide (ratio ~1.55).
    const pad = 6;
    const pitchWidth  = availW - pad * 2;
    const pitchHeight = Math.min(pitchWidth * 1.55, availH - pad * 2);
    return { pitchWidth, pitchHeight };
  }, [availW, availH]);

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
        {/* ── Mowed grass stripes ── */}
        <PitchStripes width={pitchSize.pitchWidth} height={pitchSize.pitchHeight} />

        {/* ── Field markings ── */}
        <PitchMarkings width={pitchSize.pitchWidth} height={pitchSize.pitchHeight} />

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
    backgroundColor: '#1a7a3c',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    // Subtle shadow to lift the pitch off the dark background
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
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