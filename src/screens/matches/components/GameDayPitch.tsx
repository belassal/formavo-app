import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';

import { buildSlots } from '../../../services/formation';
import {
  mapLineupToSlotsAssignedFirst,
  PlayerLite,
} from '../../../services/lineupMapping';

type Props = {
  formation: string;
  starters: PlayerLite[];

  // playerId -> slotKey
  playerToSlotKey: Record<string, string>;

  // tap any slot (empty OR occupied) to open the assign/clear modal
  onSlotPress?: (slotKey: string) => void;
};

export default function GameDayPitch({
  formation,
  starters,
  playerToSlotKey,
  onSlotPress,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isPortrait = height >= width;

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

  const mapped = useMemo(
    () => mapLineupToSlotsAssignedFirst(starters, slots, playerToSlotKey),
    [starters, slots, playerToSlotKey]
  );

  // slotKey -> player
  const playerBySlotKey = useMemo(() => {
    const m: Record<string, PlayerLite> = {};
    mapped.forEach(({ player, slot }) => {
      m[slot.key] = player;
    });
    return m;
  }, [mapped]);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.pitch,
          {
            width: pitchSize.pitchWidth,
            height: pitchSize.pitchHeight,
          },
        ]}
      >
        <View style={styles.halfLine} />
        <View style={styles.centerCircle} />

        {/* Render ALL slots (occupied OR empty) */}
        {slots.map((slot) => {
          const left = slot.x * pitchSize.pitchWidth;
          const top = slot.y * pitchSize.pitchHeight;

          const player = playerBySlotKey[slot.key];

          if (player) {
            return (
              <Pressable
                key={slot.key}
                onPress={() => onSlotPress?.(slot.key)}
                style={[
                  styles.player,
                  {
                    left,
                    top,
                    transform: [{ translateX: -22 }, { translateY: -22 }],
                  },
                ]}
              >
                {/* little “-” badge so it’s obvious you can remove */}
                <View style={styles.minusBadge}>
                  <Text style={styles.minusText}>–</Text>
                </View>

                <Text style={styles.number}>{player.number || ''}</Text>
                <Text numberOfLines={1} style={styles.name}>
                  {player.name}
                </Text>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={slot.key}
              onPress={() => onSlotPress?.(slot.key)}
              style={[
                styles.emptySlot,
                {
                  left,
                  top,
                  transform: [{ translateX: -18 }, { translateY: -18 }],
                },
              ]}
            >
              <Text style={styles.plus}>+</Text>
            </Pressable>
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

  minusBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#b00020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minusText: { color: 'white', fontWeight: '900', fontSize: 14, lineHeight: 14 },

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
});
