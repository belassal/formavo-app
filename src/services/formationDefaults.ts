// ─────────────────────────────────────────────────────────────
//  Formation defaults — used by FormationPickerModal
//  Each position uses x/y in 0..1 coords (x=horizontal, y=vertical)
//  y=0 is the attacking end, y=1 is the GK end  (matches GameDayPitch)
// ─────────────────────────────────────────────────────────────

export type FormationPosition = {
  role: string;
  x: number; // 0..1
  y: number; // 0..1
};

export type FormationDef = {
  id: string;
  name: string;         // e.g. "4-3-3"
  disabled?: boolean;
  positions: FormationPosition[];
};

export type FormatDef = {
  label: string;        // "7v7" | "9v9" | "11v11"
  enabled: boolean;
  formations: FormationDef[];
};

export type FormatsConfig = Record<string, FormatDef>;

export const DEFAULT_FORMATS: FormatsConfig = {
  '7v7': {
    label: '7v7',
    enabled: true,
    formations: [
      {
        id: '7-2-3-1', name: '2-3-1',
        positions: [
          { role: 'GK', x: 0.50, y: 0.88 },
          { role: 'LB', x: 0.28, y: 0.68 }, { role: 'RB', x: 0.72, y: 0.68 },
          { role: 'LM', x: 0.20, y: 0.45 }, { role: 'CM', x: 0.50, y: 0.42 }, { role: 'RM', x: 0.80, y: 0.45 },
          { role: 'ST', x: 0.50, y: 0.20 },
        ],
      },
      {
        id: '7-3-2-1', name: '3-2-1',
        positions: [
          { role: 'GK', x: 0.50, y: 0.88 },
          { role: 'LB', x: 0.22, y: 0.65 }, { role: 'CB', x: 0.50, y: 0.62 }, { role: 'RB', x: 0.78, y: 0.65 },
          { role: 'LM', x: 0.33, y: 0.40 }, { role: 'RM', x: 0.67, y: 0.40 },
          { role: 'ST', x: 0.50, y: 0.18 },
        ],
      },
      {
        id: '7-2-2-2', name: '2-2-2',
        positions: [
          { role: 'GK', x: 0.50, y: 0.88 },
          { role: 'LB', x: 0.30, y: 0.68 }, { role: 'RB', x: 0.70, y: 0.68 },
          { role: 'LM', x: 0.30, y: 0.45 }, { role: 'RM', x: 0.70, y: 0.45 },
          { role: 'LS', x: 0.30, y: 0.20 }, { role: 'RS', x: 0.70, y: 0.20 },
        ],
      },
      {
        id: '7-1-3-2', name: '1-3-2',
        positions: [
          { role: 'GK', x: 0.50, y: 0.88 },
          { role: 'SW', x: 0.50, y: 0.70 },
          { role: 'LM', x: 0.20, y: 0.48 }, { role: 'CM', x: 0.50, y: 0.45 }, { role: 'RM', x: 0.80, y: 0.48 },
          { role: 'LS', x: 0.35, y: 0.20 }, { role: 'RS', x: 0.65, y: 0.20 },
        ],
      },
    ],
  },
  '9v9': {
    label: '9v9',
    enabled: true,
    formations: [
      {
        id: '9-3-2-3', name: '3-2-3',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.22, y: 0.68 }, { role: 'CB',  x: 0.50, y: 0.66 }, { role: 'RB',  x: 0.78, y: 0.68 },
          { role: 'LM',  x: 0.33, y: 0.47 }, { role: 'RM',  x: 0.67, y: 0.47 },
          { role: 'LW',  x: 0.18, y: 0.22 }, { role: 'ST',  x: 0.50, y: 0.18 }, { role: 'RW',  x: 0.82, y: 0.22 },
        ],
      },
      {
        id: '9-3-3-2', name: '3-3-2',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.22, y: 0.68 }, { role: 'CB',  x: 0.50, y: 0.66 }, { role: 'RB',  x: 0.78, y: 0.68 },
          { role: 'LM',  x: 0.20, y: 0.46 }, { role: 'CM',  x: 0.50, y: 0.43 }, { role: 'RM',  x: 0.80, y: 0.46 },
          { role: 'LS',  x: 0.33, y: 0.20 }, { role: 'RS',  x: 0.67, y: 0.20 },
        ],
      },
      {
        id: '9-2-3-3', name: '2-3-3',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.30, y: 0.68 }, { role: 'RB',  x: 0.70, y: 0.68 },
          { role: 'LM',  x: 0.20, y: 0.48 }, { role: 'CM',  x: 0.50, y: 0.45 }, { role: 'RM',  x: 0.80, y: 0.48 },
          { role: 'LW',  x: 0.18, y: 0.22 }, { role: 'ST',  x: 0.50, y: 0.18 }, { role: 'RW',  x: 0.82, y: 0.22 },
        ],
      },
      {
        id: '9-4-2-2', name: '4-2-2',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.15, y: 0.66 }, { role: 'LCB', x: 0.38, y: 0.64 }, { role: 'RCB', x: 0.62, y: 0.64 }, { role: 'RB', x: 0.85, y: 0.66 },
          { role: 'LM',  x: 0.33, y: 0.44 }, { role: 'RM',  x: 0.67, y: 0.44 },
          { role: 'LS',  x: 0.33, y: 0.20 }, { role: 'RS',  x: 0.67, y: 0.20 },
        ],
      },
    ],
  },
  '11v11': {
    label: '11v11',
    enabled: true,
    formations: [
      {
        id: '11-4-3-3', name: '4-3-3',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.15, y: 0.68 }, { role: 'LCB', x: 0.37, y: 0.66 }, { role: 'RCB', x: 0.63, y: 0.66 }, { role: 'RB',  x: 0.85, y: 0.68 },
          { role: 'LM',  x: 0.22, y: 0.46 }, { role: 'CM',  x: 0.50, y: 0.43 }, { role: 'RM',  x: 0.78, y: 0.46 },
          { role: 'LW',  x: 0.18, y: 0.22 }, { role: 'ST',  x: 0.50, y: 0.18 }, { role: 'RW',  x: 0.82, y: 0.22 },
        ],
      },
      {
        id: '11-4-4-2', name: '4-4-2',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.15, y: 0.68 }, { role: 'LCB', x: 0.37, y: 0.66 }, { role: 'RCB', x: 0.63, y: 0.66 }, { role: 'RB',  x: 0.85, y: 0.68 },
          { role: 'LM',  x: 0.15, y: 0.46 }, { role: 'LCM', x: 0.38, y: 0.44 }, { role: 'RCM', x: 0.62, y: 0.44 }, { role: 'RM',  x: 0.85, y: 0.46 },
          { role: 'LS',  x: 0.35, y: 0.20 }, { role: 'RS',  x: 0.65, y: 0.20 },
        ],
      },
      {
        id: '11-3-5-2', name: '3-5-2',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LCB', x: 0.22, y: 0.68 }, { role: 'CB',  x: 0.50, y: 0.66 }, { role: 'RCB', x: 0.78, y: 0.68 },
          { role: 'LWB', x: 0.10, y: 0.46 }, { role: 'LCM', x: 0.30, y: 0.44 }, { role: 'CM',  x: 0.50, y: 0.42 }, { role: 'RCM', x: 0.70, y: 0.44 }, { role: 'RWB', x: 0.90, y: 0.46 },
          { role: 'LS',  x: 0.35, y: 0.20 }, { role: 'RS',  x: 0.65, y: 0.20 },
        ],
      },
      {
        id: '11-4-2-3-1', name: '4-2-3-1',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LB',  x: 0.15, y: 0.68 }, { role: 'LCB', x: 0.37, y: 0.66 }, { role: 'RCB', x: 0.63, y: 0.66 }, { role: 'RB',  x: 0.85, y: 0.68 },
          { role: 'LDM', x: 0.33, y: 0.52 }, { role: 'RDM', x: 0.67, y: 0.52 },
          { role: 'LAM', x: 0.15, y: 0.34 }, { role: 'CAM', x: 0.50, y: 0.32 }, { role: 'RAM', x: 0.85, y: 0.34 },
          { role: 'ST',  x: 0.50, y: 0.16 },
        ],
      },
      {
        id: '11-5-3-2', name: '5-3-2',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LWB', x: 0.10, y: 0.66 }, { role: 'LCB', x: 0.28, y: 0.64 }, { role: 'CB',  x: 0.50, y: 0.63 }, { role: 'RCB', x: 0.72, y: 0.64 }, { role: 'RWB', x: 0.90, y: 0.66 },
          { role: 'LM',  x: 0.22, y: 0.44 }, { role: 'CM',  x: 0.50, y: 0.42 }, { role: 'RM',  x: 0.78, y: 0.44 },
          { role: 'LS',  x: 0.35, y: 0.20 }, { role: 'RS',  x: 0.65, y: 0.20 },
        ],
      },
      {
        id: '11-3-4-3', name: '3-4-3',
        positions: [
          { role: 'GK',  x: 0.50, y: 0.88 },
          { role: 'LCB', x: 0.22, y: 0.68 }, { role: 'CB',  x: 0.50, y: 0.66 }, { role: 'RCB', x: 0.78, y: 0.68 },
          { role: 'LM',  x: 0.12, y: 0.46 }, { role: 'LCM', x: 0.37, y: 0.44 }, { role: 'RCM', x: 0.63, y: 0.44 }, { role: 'RM',  x: 0.88, y: 0.46 },
          { role: 'LW',  x: 0.18, y: 0.22 }, { role: 'ST',  x: 0.50, y: 0.18 }, { role: 'RW',  x: 0.82, y: 0.22 },
        ],
      },
    ],
  },
};
