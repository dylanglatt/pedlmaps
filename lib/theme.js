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

const light = {
  scheme: 'light',
  bg: '#FFFFFF',
  surface: '#F4F6F9',
  surfaceAlt: '#E9EDF2',
  elevated: '#FFFFFF',
  border: '#E3E8EF',
  hairline: '#EEF1F5',
  text: '#0B1220',
  textMute: '#5B6573',
  textFaint: '#97A2B0',
  primary: '#0A66C2',
  onPrimary: '#FFFFFF',
  good: '#15803D', goodBg: '#DCFCE7',
  low: '#B45309', lowBg: '#FEF3C7',
  none: '#8A94A3', noneBg: '#EEF1F5',
  off: '#64748B', offBg: '#E3E8EF',
  classic: '#0A66C2',
  ebike: '#7C3AED',
  empty: '#D5DBE3',
  danger: '#DC2626', dangerBg: '#FEE2E2',
  overlay: 'rgba(255,255,255,0.88)',
};

const dark = {
  scheme: 'dark',
  bg: '#0A0E13',
  surface: '#141A22',
  surfaceAlt: '#1C2530',
  elevated: '#161D26',
  border: '#26313F',
  hairline: '#1A222C',
  text: '#F2F6FB',
  textMute: '#9DAEC0',
  textFaint: '#657486',
  primary: '#4DA3FF',
  onPrimary: '#08121E',
  good: '#34D399', goodBg: '#0F3A2B',
  low: '#FBBF24', lowBg: '#3A2E10',
  none: '#64748B', noneBg: '#1C2530',
  off: '#94A3B8', offBg: '#26313F',
  classic: '#4DA3FF',
  ebike: '#A78BFA',
  empty: '#2B3744',
  danger: '#F87171', dangerBg: '#3A1616',
  overlay: 'rgba(10,14,19,0.84)',
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
