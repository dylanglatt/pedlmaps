import { useColorScheme } from 'react-native';

// Static tokens (theme-independent).
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n) => n * 4;

export const font = {
  display: 'SpaceGrotesk_700Bold',
  displaySemi: 'SpaceGrotesk_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

// DockHop brand: ink chrome + electric indigo accent (with a teal partner used
// in the logo and the e-bike segment). Availability stays green/amber/grey.
const light = {
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#F3F5FA',
  surfaceAlt: '#E8ECF5',
  elevated: '#FFFFFF',
  border: '#E4E8F2',
  hairline: '#EEF1F7',
  text: '#0C1322',
  textMute: '#5A6478',
  textFaint: '#98A2B3',
  primary: '#5B53E6',
  onPrimary: '#FFFFFF',
  accent2: '#0EA5B5',
  good: '#15803D', goodBg: '#DCFCE7',
  low: '#B45309', lowBg: '#FEF3C7',
  none: '#8A94A3', noneBg: '#EEF1F7',
  off: '#64748B', offBg: '#E4E8F2',
  classic: '#5B53E6',
  ebike: '#0EA5B5',
  empty: '#D7DCE6',
  danger: '#DC2626', dangerBg: '#FEE2E2',
  overlay: 'rgba(255,255,255,0.88)',
};

const dark = {
  scheme: 'dark',
  bg: '#0B0F18',
  surface: '#141A26',
  surfaceAlt: '#1D2533',
  elevated: '#161D2A',
  border: '#27313F',
  hairline: '#1A2230',
  text: '#F2F5FA',
  textMute: '#9AA7B8',
  textFaint: '#647183',
  primary: '#8B83FF',
  onPrimary: '#0B0F18',
  accent2: '#2FD3C3',
  good: '#34D399', goodBg: '#0F3A2B',
  low: '#FBBF24', lowBg: '#3A2E10',
  none: '#647183', noneBg: '#1D2533',
  off: '#94A3B8', offBg: '#27313F',
  classic: '#8B83FF',
  ebike: '#2FD3C3',
  empty: '#2B3744',
  danger: '#F87171', dangerBg: '#3A1616',
  overlay: 'rgba(11,15,24,0.84)',
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

// { fg, bg } for an availability level ('good'|'low'|'none'|'off').
export function levelColor(c, level) {
  return { fg: c[level], bg: c[`${level}Bg`] };
}

export function shadow(c) {
  const dark = c.scheme === 'dark';
  return {
    card: {
      shadowColor: '#000',
      shadowOpacity: dark ? 0.45 : 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    pop: {
      shadowColor: '#000',
      shadowOpacity: dark ? 0.55 : 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
  };
}
