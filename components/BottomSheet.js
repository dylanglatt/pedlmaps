import React, { useRef, useMemo, useEffect } from 'react';
import { View, Animated, PanResponder, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme, radius, shadow } from '../lib/theme';

// Controlled draggable sheet. `index` selects a snap point (0 peek, 1 mid, 2 full);
// dragging reports the new nearest snap via onIndexChange.
export default function BottomSheet({ index = 1, onIndexChange, renderHeader, children }) {
  const c = useTheme();
  const { height } = useWindowDimensions();
  const MAX = Math.round(height * 0.9);
  const snaps = useMemo(() => [Math.round(height * 0.16), Math.round(height * 0.52), MAX], [height, MAX]);
  const toY = (visible) => MAX - visible;

  const translateY = useRef(new Animated.Value(toY(snaps[1]))).current;
  const start = useRef(toY(snaps[index] ?? snaps[1]));

  useEffect(() => {
    Animated.spring(translateY, { toValue: toY(snaps[index] ?? snaps[1]), useNativeDriver: true, bounciness: 2, speed: 14 }).start();
  }, [index, snaps]); // eslint-disable-line

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
        const cur = start.current + g.dy;
        let best = 0, bd = Infinity;
        snaps.forEach((s, i) => { const d = Math.abs(toY(s) - cur); if (d < bd) { bd = d; best = i; } });
        if (Math.abs(g.dy) < 6) best = (index + 1) % snaps.length; // tap handle to cycle
        Animated.spring(translateY, { toValue: toY(snaps[best]), useNativeDriver: true, bounciness: 2, speed: 14 }).start();
        onIndexChange && onIndexChange(best);
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
      position: 'absolute', left: 0, right: 0, bottom: 0, height: MAX, zIndex: 1000,
      backgroundColor: c.elevated,
      borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      ...shadow(c).pop,
    },
    grip: { paddingTop: 8, paddingHorizontal: 16 },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 10 },
    content: { flex: 1 },
  });
}
