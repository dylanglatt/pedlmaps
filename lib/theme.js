// Shared design tokens. Import this everywhere instead of hardcoding values.

export const colors = {
  bg: '#FFFFFF',
  surface: '#F5F7FA',
  surfaceAlt: '#EBEFF4',
  border: '#E2E8F0',
  text: '#0F172A',
  textMute: '#64748B',
  textFaint: '#94A3B8',

  primary: '#0A66C2',
  primaryDark: '#08509A',
  onPrimary: '#FFFFFF',

  // availability semantics (used by the map + list)
  good: '#15803D',
  goodBg: '#DCFCE7',
  low: '#B45309',
  lowBg: '#FEF3C7',
  none: '#94A3B8',
  noneBg: '#F1F5F9',
  off: '#475569',
  offBg: '#E2E8F0',

  route: '#0A66C2',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
};

// 4pt spacing grid.
export const space = (n) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

export const type = {
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { fontSize: 12, color: colors.textMute },
};

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pop: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
};
