import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import Icon from './Icon';

const ROW_H = 48;
const GAP = ROW_H + 1;          // row height + the hairline divider between rows
const SWAP_AT = ROW_H * 0.5;    // drag past half a row to commit the swap
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const fire = (fn) => { if (fn) fn(); };
const haptic = (fn) => { try { fn(); } catch {} };

// One waypoint row. Defined at MODULE scope (not inside ReorderPair's render) so
// React never remounts it mid-gesture — that remount was the main source of the
// drag jank. Position/scale are driven by Animated.Values via setValue, so the
// frame-by-frame motion does not trigger React re-renders.
function Row({ item, pan, scale, active, resp, c, styles }) {
  return (
    <Animated.View
      style={{
        transform: [{ translateY: pan }, { scale }],
        zIndex: active ? 10 : 1,
        elevation: active ? 12 : 0,
        borderRadius: active ? 14 : 0,
        borderWidth: active ? 1 : 0,
        borderColor: active ? c.primary : 'transparent',
        backgroundColor: c.elevated,
        shadowColor: '#000',
        shadowOpacity: active ? 0.28 : 0,
        shadowRadius: active ? 14 : 0,
        shadowOffset: { width: 0, height: active ? 6 : 0 },
      }}
    >
      <View style={[styles.odRow, { height: ROW_H }]}>
        {item.num != null
          ? <View style={styles.numSq}><Text style={styles.numTxt}>{item.num}</Text></View>
          : <Icon name={item.icon} size={item.icon === 'dot' ? 14 : 18} color={item.color} />}
        <TouchableOpacity style={styles.flex} onPress={item.onPress} activeOpacity={0.7}>
          <Text style={styles.odTxt} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
        {item.onRemove && (
          <TouchableOpacity onPress={item.onRemove} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Icon name="close" size={16} color={c.textFaint} />
          </TouchableOpacity>
        )}
        {/* Big grab target so the handle is easy to catch. */}
        <View {...resp.panHandlers} hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }} style={{ paddingLeft: 14, paddingRight: 8, paddingVertical: 14 }}>
          <Icon name="drag" size={20} color={active ? c.primary : c.textFaint} />
        </View>
      </View>
    </Animated.View>
  );
}

// Two stacked waypoint rows you can drag (by the ≡ handle) to swap their order —
// "go to the stop first, or the destination first." Cap is one stop, so exactly
// two reorderable rows. On grab the row lifts (scale + shadow + haptic); the drag
// tracks your finger 1:1 (clamped to one slot); once you cross the midpoint the
// OTHER row slides into the vacated slot so the landing spot is obvious; releasing
// past the threshold commits the swap. Springs are damped (no bounce) for a crisp,
// Uber-like settle. onSwap flips them; onDragStart/End let the parent disable its
// ScrollView during the drag.
export default function ReorderPair({ top, bottom, onSwap, onDragStart, onDragEnd, c, styles }) {
  const panTop = useRef(new Animated.Value(0)).current;
  const panBottom = useRef(new Animated.Value(0)).current;
  const scaleTop = useRef(new Animated.Value(1)).current;
  const scaleBottom = useRef(new Animated.Value(1)).current;
  const [active, setActive] = useState(null); // 'top' | 'bottom' | null

  const onSwapRef = useRef(onSwap); onSwapRef.current = onSwap;
  const onStartRef = useRef(onDragStart); onStartRef.current = onDragStart;
  const onEndRef = useRef(onDragEnd); onEndRef.current = onDragEnd;
  const crossedRef = useRef(false);

  // Crisp, non-bouncy settle — the main thing that makes it feel "off the shelf".
  const settle = (val, toValue) =>
    Animated.spring(val, { toValue, useNativeDriver: false, speed: 18, bounciness: 0 }).start();

  const finish = (which, dragPan, dragScale, otherPan) => {
    const didCross = crossedRef.current;
    crossedRef.current = false;
    fire(onEndRef.current);
    if (didCross) {
      // Drop in place: settle the dragged row into the slot it's over (don't snap
      // it back), then commit the new order and zero the transforms in the SAME
      // frame — the row lands where you dropped it instead of teleporting back
      // while only the names swap.
      const target = which === 'top' ? GAP : -GAP;
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      Animated.parallel([
        Animated.spring(dragPan, { toValue: target, useNativeDriver: false, speed: 20, bounciness: 0 }),
        Animated.spring(dragScale, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 0 }),
      ]).start(() => {
        fire(onSwapRef.current);
        dragPan.setValue(0);
        otherPan.setValue(0);
        dragScale.setValue(1);
        setActive(null);
      });
    } else {
      // not far enough — return to the original slot, no reorder
      setActive(null);
      settle(dragPan, 0);
      settle(otherPan, 0);
      settle(dragScale, 1);
    }
  };

  const makeResponder = (which) => {
    const dragPan = which === 'top' ? panTop : panBottom;
    const dragScale = which === 'top' ? scaleTop : scaleBottom;
    const otherPan = which === 'top' ? panBottom : panTop;
    const down = which === 'top'; // top drags down, bottom drags up
    return PanResponder.create({
      // claim the gesture off the handle before the parent ScrollView can scroll,
      // and never hand it back mid-drag
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        crossedRef.current = false;
        setActive(which);
        haptic(() => Haptics.selectionAsync());
        Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: false, speed: 28, bounciness: 0 }).start();
        fire(onStartRef.current);
      },
      onPanResponderMove: (_, g) => {
        // track the finger 1:1, clamped so the row stays within the pair
        const dy = down ? clamp(g.dy, 0, GAP) : clamp(g.dy, -GAP, 0);
        dragPan.setValue(dy);
        const crossed = down ? dy > SWAP_AT : dy < -SWAP_AT;
        if (crossed !== crossedRef.current) {
          crossedRef.current = crossed;
          haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
          // slide the other row into the slot being vacated, for a live preview
          Animated.spring(otherPan, {
            toValue: crossed ? (down ? -GAP : GAP) : 0,
            useNativeDriver: false, speed: 22, bounciness: 0,
          }).start();
        }
      },
      onPanResponderRelease: () => finish(which, dragPan, dragScale, otherPan),
      onPanResponderTerminate: () => finish(which, dragPan, dragScale, otherPan),
    });
  };

  const topResp = useRef(makeResponder('top')).current;
  const botResp = useRef(makeResponder('bottom')).current;

  return (
    <View>
      <Row item={top} pan={panTop} scale={scaleTop} active={active === 'top'} resp={topResp} c={c} styles={styles} />
      <View style={styles.odDivider} />
      <Row item={bottom} pan={panBottom} scale={scaleBottom} active={active === 'bottom'} resp={botResp} c={c} styles={styles} />
    </View>
  );
}
