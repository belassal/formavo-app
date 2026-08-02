export type Slot = {
  key: string;      // unique
  label: string;    // optional role label
  x: number;        // 0..1
  y: number;        // 0..1
};

export function parseFormation(formation: string): number[] {
  // "4-3-3" -> [4,3,3]
  const parts = formation.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  return parts.length ? parts : [4, 4, 2]; // sensible fallback
}

function spreadAcrossLine(count: number): number[] {
  // returns x positions 0..1
  if (count <= 1) return [0.5];
  // Tighter spread for small lines so wide players don't hug the touchline
  // (2 players → 0.28/0.72 like the hand-tuned defaults, not 0.08/0.92).
  const margin = count === 2 ? 0.28 : count === 3 ? 0.2 : count === 4 ? 0.14 : 0.08;
  const usable = 1 - margin * 2;
  const step = usable / (count - 1);
  return Array.from({ length: count }, (_, i) => margin + i * step);
}

export function buildSlots(formation: string): Slot[] {
  const lines = parseFormation(formation); // e.g. [4,3,3]
  const slots: Slot[] = [];

  // Pitch y bands (portrait-friendly)
  // bottom GK, then defenders, mids, forwards
  const yGK = 0.88;

  const yTop = 0.18;     // forwards near top
  const yBottom = 0.74;  // defenders near bottom (but above GK)
  const lineCount = lines.length;

  // Spread lines vertically between yTop..yBottom
  const yStep = lineCount === 1 ? 0 : (yBottom - yTop) / (lineCount - 1);
  const yLines = Array.from({ length: lineCount }, (_, i) => yBottom - i * yStep); 
  // note: defenders will be first line (i=0) at yBottom, forwards last line at yTop

  // GK
  slots.push({ key: 'GK', label: 'GK', x: 0.5, y: yGK });

  // Field lines
  lines.forEach((count, lineIndex) => {
    const xs = spreadAcrossLine(count);
    const y = yLines[lineIndex];

    for (let i = 0; i < count; i++) {
      slots.push({
        key: `L${lineIndex + 1}-${i + 1}`,
        label: `L${lineIndex + 1}`,
        x: xs[i],
        y,
      });
    }
  });

  return slots;
}