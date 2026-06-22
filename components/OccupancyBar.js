import React from 'react';
import { View, StyleSheet } from 'react-native';

// Slim segmented gauge: classic bikes | e-bikes | open docks.
export default function OccupancyBar({ classic = 0, ebikes = 0, docks = 0, c }) {
  const total = Math.max(1, classic + ebikes + docks);
  const seg = (n, color, key) =>
    n > 0 ? <View key={key} style={{ flex: n / total, backgroundColor: color }} /> : null;
  return (
    <View style={[styles.track, { backgroundColor: c.empty }]}>
      {seg(classic, c.classic, 'c')}
      {seg(ebikes, c.ebike, 'e')}
      {seg(docks, c.empty, 'd')}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
});
