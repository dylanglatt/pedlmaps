import React, { useRef, useState, useMemo } from 'react';
import { View, Animated, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme, radius, shadow } from '../lib/theme';

// Lightweight draggable sheet (no extra deps). Snap points are *visible heights*.
export default function BottomSheet({ renderHeader, children }) {
  const c = useTheme();
  const { height } = useWindowDimensions();
  const MAX = Math.round(height * 0.9);
  const snaps = useMemo(
    () => [Math.round(height * 0.18), Math.round(height * 0.52), MAX],
    [height, MAX]
  );
  const toY = (visible) => MAX - visible;

  const translateY = useRef(new Animated.Value(toY(snaps[1]))).current;
  const start = useRef(toY(snaps[1]));
  const idx = useRef(1);

  const snapTo = (i) => {
    idx.current = i;
    Animated.spring(translateY, { toValue: toY(snaps[i]), useNativeDriver: true, bounciness: 3, speed: 14 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => { translateY.stopAnimation((v) => { start.current = v; }); },
      onPanResponderMove: (_, g) => {
        let v = start.current + g.dy;
        v = Math.max(toY(MAX), Math.min(toY(snaps[0]), v));
        translateY.setValue(v);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dy) < 6) {
          snapTo((idx.current + 1) % snaps.length); // tap handle to cycle
          return;
        }
        const cur = start.current + g.dy;
        let best = 0, bd = Infinity;
        snaps.forEach((s, i) => { const d = Math.abs(toY(s) - cur); if (d < bd) { bd = d; best = i; } });
        snapTo(best);
      },
    })
  ).current;

  const styles = useMemo(() => makeStyles(c, MAX), [c, MAX]);

  return (
    <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
      <View {...pan.panHandlers} style={styles.grip}>
        <View style={styles.handle} />
        {renderHeader && renderHeader()}
      </View>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

function makeStyles(c, MAX) {
  return StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      height: MAX,
      zIndex: 1000,
      backgroundColor: c.elevated,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      ...shadow(c).pop,
    },
    grip: { paddingTop: 8, paddingBottom: 6, paddingHorizontal: 16 },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 8 },
    content: { flex: 1 },
  });
}
