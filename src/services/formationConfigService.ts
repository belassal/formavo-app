/**
 * formationConfigService — club-level custom formations per format.
 *
 * Stored at clubs/{clubId}/config/formations as { byFormat: { '9v9': ['2-4-2'] } }.
 * Custom formations are just names — slot layout and picker previews are
 * generated from buildSlots(name), same geometry the pitch uses.
 */
import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import { buildSlots } from './formation';
import { slotRoles } from './positionMatch';
import { DEFAULT_FORMATS, type FormationDef } from './formationDefaults';

export type CustomFormationsByFormat = Record<string, string[]>;
export type SlotPosMap = Record<string, { x: number; y: number; role?: string }>;
/** formatKey → formationName → slotKey → {x,y} */
export type FormationLayouts = Record<string, Record<string, SlotPosMap>>;
export type FormationConfig = { byFormat: CustomFormationsByFormat; layouts: FormationLayouts };

/** "9v9" → 8 outfield players. */
export function outfieldCount(formatKey: string): number {
  const n = parseInt(formatKey, 10);
  return isNaN(n) ? 0 : n - 1;
}

/** Returns an error message, or null when the name is valid for the format. */
export function validateFormationName(
  name: string,
  formatKey: string,
  existingCustoms: string[] = [],
): string | null {
  const trimmed = name.trim();
  if (!/^[1-9](-[1-9]){1,3}$/.test(trimmed)) {
    return 'Use 2–4 lines of digits separated by dashes, e.g. 2-4-2';
  }
  const sum = trimmed.split('-').reduce((a, b) => a + parseInt(b, 10), 0);
  const need = outfieldCount(formatKey);
  if (sum !== need) {
    return `${formatKey} needs ${need} outfield players — ${trimmed} has ${sum}`;
  }
  const builtIn = (DEFAULT_FORMATS[formatKey]?.formations ?? []).map((f) => f.name);
  if (builtIn.includes(trimmed)) return `${trimmed} is already built in`;
  if (existingCustoms.includes(trimmed)) return `${trimmed} is already in your list`;
  return null;
}

/** Wraps a custom formation name as a FormationDef (preview from buildSlots). */
export function customFormationDef(name: string, formatKey: string): FormationDef {
  return {
    id: `custom-${formatKey}-${name}`,
    name,
    // Label each slot with its best-fit role (LB/CM/ST…) from the geometry heuristic
    positions: buildSlots(name).map((s) => ({
      role: slotRoles(s, name)[0] ?? s.label,
      x: s.x,
      y: s.y,
    })),
  };
}

function configRef(clubId: string) {
  return db.collection(COL.clubs).doc(clubId).collection('config').doc('formations');
}

export function listenFormationConfig(
  clubId: string,
  onData: (cfg: FormationConfig) => void,
): () => void {
  return configRef(clubId).onSnapshot(
    (snap) => {
      const data: any = snap.data() ?? {};
      onData({ byFormat: data.byFormat ?? {}, layouts: data.layouts ?? {} });
    },
    () => onData({ byFormat: {}, layouts: {} }),
  );
}

export function listenCustomFormations(
  clubId: string,
  onData: (byFormat: CustomFormationsByFormat) => void,
): () => void {
  return listenFormationConfig(clubId, (cfg) => onData(cfg.byFormat));
}

/** Save a club-wide default slot layout for a formation (built-in or custom). */
export async function saveFormationLayout(
  clubId: string,
  formatKey: string,
  formationName: string,
  layout: SlotPosMap,
) {
  await configRef(clubId).set(
    {
      layouts: { [formatKey]: { [formationName]: layout } },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearFormationLayout(clubId: string, formatKey: string, formationName: string) {
  await configRef(clubId).set(
    {
      layouts: { [formatKey]: { [formationName]: firestore.FieldValue.delete() } },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Overlay a saved layout (positions + coach-assigned roles) onto generated slots. */
export function applyLayout<T extends { key: string; x: number; y: number; role?: string }>(
  slots: T[],
  layout?: SlotPosMap,
): T[] {
  if (!layout) return slots;
  return slots.map((s) => {
    const o = layout[s.key];
    if (!o) return s;
    return { ...s, x: o.x, y: o.y, ...(o.role ? { role: o.role } : {}) };
  });
}

export async function addCustomFormation(clubId: string, formatKey: string, name: string) {
  await configRef(clubId).set(
    {
      byFormat: { [formatKey]: firestore.FieldValue.arrayUnion(name.trim()) },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeCustomFormation(clubId: string, formatKey: string, name: string) {
  await configRef(clubId).set(
    {
      byFormat: { [formatKey]: firestore.FieldValue.arrayRemove(name) },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
