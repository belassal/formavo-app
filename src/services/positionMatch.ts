/**
 * positionMatch — intelligent player→slot assignment.
 *
 * Players carry an ordered `positions` array (priority: index 0 = natural
 * position). Slots are generic (`GK`, `L{line}-{i}`) but their role is
 * derivable from formation geometry: line index gives the band
 * (defense → midfield → attack) and x gives side (left / center / right).
 *
 * Used by GameDay for the initial lineup auto-assign and for re-slotting
 * on mid-game formation switches. Players with no positions fall back to
 * the legacy back-to-front fill, so the feature degrades gracefully.
 */
import type { Slot } from './formation';
import { parseFormation } from './formation';

/** Ranked roles a slot can accept, best fit first. */
export function slotRoles(slot: Slot, formation: string): string[] {
  if (slot.key === 'GK') return ['GK'];

  const lines = parseFormation(formation);
  const L = lines.length;
  const m = slot.key.match(/^L(\d+)-/);
  const lineIndex = m ? parseInt(m[1], 10) : 1; // 1-based; line 1 = defense
  const band = L <= 1 ? 1 : (lineIndex - 1) / (L - 1); // 0 → defense, 1 → attack
  const left = slot.x < 0.35;
  const right = slot.x > 0.65;

  // Back line
  if (band <= 0.001) {
    if (left) return ['LB', 'CB', 'LW'];
    if (right) return ['RB', 'CB', 'RW'];
    return ['CB', 'CDM', 'LB', 'RB'];
  }
  // Front line
  if (band >= 0.999) {
    if (left) return ['LW', 'ST', 'CAM'];
    if (right) return ['RW', 'ST', 'CAM'];
    return ['ST', 'CAM', 'CM'];
  }
  // Deeper midfield
  if (band < 0.45) {
    if (left) return ['LW', 'LB', 'CM'];
    if (right) return ['RW', 'RB', 'CM'];
    return ['CDM', 'CM', 'CB'];
  }
  // Advanced midfield
  if (band > 0.55) {
    if (left) return ['LW', 'CAM', 'CM'];
    if (right) return ['RW', 'CAM', 'CM'];
    return ['CAM', 'CM', 'ST'];
  }
  // Central midfield band
  if (left) return ['LW', 'CM', 'LB'];
  if (right) return ['RW', 'CM', 'RB'];
  return ['CM', 'CDM', 'CAM'];
}

export type MatchablePlayer = { id: string; positions: string[] };

const NO_MATCH = 100;

/** Lower = better. Player priority weighs double a slot's role rank. */
function pairCost(player: MatchablePlayer, roles: string[]): number {
  let best = NO_MATCH;
  player.positions.forEach((pos, playerRank) => {
    const roleRank = roles.indexOf(pos);
    if (roleRank >= 0) best = Math.min(best, playerRank * 2 + roleRank);
  });
  return best;
}

/**
 * Assign players to slots by position preference.
 * - GK slot is hard-preferred: a player listing GK wins it (by priority),
 *   else `preferredGkId` (e.g. whoever is in goal right now).
 * - Remaining pairs greedily by cheapest cost.
 * - Anyone unmatched fills leftover slots back-to-front (legacy behavior).
 * Returns playerId → slotKey.
 */
export function assignByPositions(
  players: MatchablePlayer[],
  slots: Slot[],
  formation: string,
  preferredGkId?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const freePlayers = new Set(players.map((p) => p.id));
  const freeSlots = new Set(slots.map((s) => s.key));
  const byId = new Map(players.map((p) => [p.id, p]));
  const rolesBySlot = new Map(slots.map((s) => [s.key, slotRoles(s, formation)]));

  // 1) Goalkeeper
  if (freeSlots.has('GK')) {
    const gkListed = players
      .filter((p) => freePlayers.has(p.id) && p.positions.includes('GK'))
      .sort((a, b) => a.positions.indexOf('GK') - b.positions.indexOf('GK'))[0];
    const gkId =
      gkListed?.id ??
      (preferredGkId && freePlayers.has(preferredGkId) ? preferredGkId : undefined);
    if (gkId) {
      out[gkId] = 'GK';
      freePlayers.delete(gkId);
      freeSlots.delete('GK');
    }
  }

  // 2) Cheapest pairs first
  const pairs: { id: string; key: string; cost: number }[] = [];
  for (const id of freePlayers) {
    const p = byId.get(id)!;
    if (p.positions.length === 0) continue; // no preferences → leftover fill
    for (const key of freeSlots) {
      const cost = pairCost(p, rolesBySlot.get(key) || []);
      if (cost < NO_MATCH) pairs.push({ id, key, cost });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  for (const pr of pairs) {
    if (!freePlayers.has(pr.id) || !freeSlots.has(pr.key)) continue;
    out[pr.id] = pr.key;
    freePlayers.delete(pr.id);
    freeSlots.delete(pr.key);
  }

  // 3) Leftovers back-to-front
  const remainingSlots = slots
    .filter((s) => freeSlots.has(s.key))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const remainingPlayers = [...freePlayers];
  remainingSlots.forEach((s, i) => {
    const id = remainingPlayers[i];
    if (id) out[id] = s.key;
  });

  return out;
}
