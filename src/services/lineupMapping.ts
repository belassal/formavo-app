import type { Slot } from './formation';

export type PlayerLite = { id: string; name: string; number?: string };

export type PlayerOnPitch = {
  player: PlayerLite;
  slot: Slot;
};

export function mapLineupToSlots(
  starters: PlayerLite[],
  slots: Slot[]
): PlayerOnPitch[] {
  if (!starters?.length) return [];

  // Always keep GK slot first if present
  const gkSlot = slots.find(s => s.key === 'GK');
  const otherSlots = slots.filter(s => s.key !== 'GK');

  // Sort other slots: defenders (closest to bottom) first, then upfield.
  // Because y is larger near bottom, sort by y DESC; tie by x ASC.
  const sorted = [...otherSlots].sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const result: PlayerOnPitch[] = [];

  let idx = 0;

  // Optional GK auto-assign: take first player as GK
  if (gkSlot) {
    const p = starters[idx++];
    if (p) result.push({ player: p, slot: gkSlot });
  }

  // Fill remaining slots
  for (const slot of sorted) {
    const p = starters[idx++];
    if (!p) break;
    result.push({ player: p, slot });
  }

  return result;
}

/**
 * Prefer previously-assigned slots (playerId -> slotKey) to keep positions stable.
 * Remaining starters are placed deterministically back->front, left->right.
 */
export function mapLineupToSlotsAssignedFirst(
  starters: PlayerLite[],
  slots: Slot[],
  playerToSlotKey: Record<string, string>
): PlayerOnPitch[] {
  if (!starters?.length) return [];

  const slotByKey = new Map(slots.map((s) => [s.key, s] as const));
  const usedSlots = new Set<string>();
  const usedPlayers = new Set<string>();

  const out: PlayerOnPitch[] = [];

  // 1) Place assigned players first
  for (const p of starters) {
    const sk = playerToSlotKey[p.id];
    if (!sk) continue;

    const slot = slotByKey.get(sk);
    if (!slot) continue;

    // prevent collisions
    if (usedSlots.has(sk)) continue;

    out.push({ player: p, slot });
    usedSlots.add(sk);
    usedPlayers.add(p.id);
  }

  // 2) Fill remaining slots with remaining starters (deterministic)
  const remainingSlots = slots
    .filter((s) => !usedSlots.has(s.key))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const remainingPlayers = starters.filter((p) => !usedPlayers.has(p.id));

  for (let i = 0; i < Math.min(remainingSlots.length, remainingPlayers.length); i++) {
    out.push({ player: remainingPlayers[i], slot: remainingSlots[i] });
  }

  return out;
}