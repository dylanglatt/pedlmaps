import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../lib/theme';

// DockHop mark: a hop arc between two docks, with the rider at the apex.
export default function Logo({ size = 26 }) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="dh" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6C5CFF" />
          <Stop offset="1" stopColor="#2FD3C3" />
        </LinearGradient>
      </Defs>
      <Path d="M 280 700 Q 512 120 744 700" fill="none" stroke="url(#dh)" strokeWidth={84} strokeLinecap="round" />
      <Circle cx={280} cy={700} r={48} fill={c.primary} />
      <Circle cx={744} cy={700} r={48} fill={c.primary} />
      <Circle cx={512} cy={410} r={60} fill={c.primary} />
      <Circle cx={512} cy={410} r={26} fill={c.bg} />
    </Svg>
  );
}
