import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

let SymbolView = null;
try { ({ SymbolView } = require('expo-symbols')); } catch {}

// Semantic name -> { sf: SF Symbol (iOS), ion: Ionicons fallback (web/Android) }.
const MAP = {
  walk: { sf: 'figure.walk', ion: 'walk' },
  bike: { sf: 'bicycle', ion: 'bicycle' },
  dock: { sf: 'parkingsign', ion: 'business' },
  bolt: { sf: 'bolt.fill', ion: 'flash' },
  home: { sf: 'house.fill', ion: 'home' },
  work: { sf: 'briefcase.fill', ion: 'briefcase' },
  search: { sf: 'magnifyingglass', ion: 'search' },
  close: { sf: 'xmark', ion: 'close' },
  clear: { sf: 'xmark.circle.fill', ion: 'close-circle' },
  back: { sf: 'chevron.left', ion: 'chevron-back' },
  forward: { sf: 'chevron.right', ion: 'chevron-forward' },
  time: { sf: 'clock', ion: 'time-outline' },
  pin: { sf: 'mappin.circle.fill', ion: 'location' },
  start: { sf: 'location.north.circle.fill', ion: 'navigate-circle' },
  navigate: { sf: 'location.fill', ion: 'navigate' },
  volumeOn: { sf: 'speaker.wave.2.fill', ion: 'volume-high' },
  volumeOff: { sf: 'speaker.slash.fill', ion: 'volume-mute' },
  star: { sf: 'star.fill', ion: 'star' },
  swap: { sf: 'arrow.left.arrow.right', ion: 'swap-horizontal' },
  warning: { sf: 'exclamationmark.triangle.fill', ion: 'warning' },
  // maneuvers
  straight: { sf: 'arrow.up', ion: 'arrow-up' },
  turnLeft: { sf: 'arrow.turn.up.left', ion: 'arrow-back' },
  turnRight: { sf: 'arrow.turn.up.right', ion: 'arrow-forward' },
  slightLeft: { sf: 'arrow.up.left', ion: 'arrow-up' },
  slightRight: { sf: 'arrow.up.right', ion: 'arrow-up' },
  uturn: { sf: 'arrow.uturn.down', ion: 'arrow-undo' },
  arrive: { sf: 'mappin.and.ellipse', ion: 'flag' },
};

export default function Icon({ name, size = 20, color, weight = 'regular', style }) {
  const m = MAP[name] || MAP.straight;
  if (SymbolView && Platform.OS === 'ios') {
    return (
      <SymbolView
        name={m.sf}
        tintColor={color}
        weight={weight}
        resizeMode="scaleAspectFit"
        style={[{ width: size, height: size }, style]}
      />
    );
  }
  return <Ionicons name={m.ion} size={size} color={color} style={style} />;
}
