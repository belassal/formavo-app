/**
 * Formavo brand color palette.
 * Navy + neon green — matches the logo aesthetic.
 */
export const B = {
  // Core brand
  navy:        '#0a1628',
  navyLight:   '#132040',
  navyBorder:  'rgba(255,255,255,0.08)',

  // Greens
  green:       '#22c55e',   // primary accent
  greenBright: '#4ade80',   // lighter, for text on dark
  greenGlow:   '#16a34a',   // darker green
  greenSurface:'#f0fdf4',   // very light tint (backgrounds)
  greenBorder: '#dcfce7',   // light green border
  greenDim:    '#bbf7d0',   // muted green

  // Neutral overrides (richer than plain black)
  ink:         '#0f172a',   // replace #111 for a deeper tone
  inkMid:      '#374151',
  inkLight:    '#6b7280',
  inkFaint:    '#9ca3af',
  surface:     '#f2f2f7',
  card:        '#ffffff',
  border:      '#e5e7eb',
} as const;
