import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import Icon from './Icon';

const ROW_H = 48;
const GAP = ROW_H + 1;          // row height + the hairline divider between rows
const SWAP_AT = ROW_H * 0.5;    // drag past half a row to commit the swap

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
        elevation: active ? 6 : 0,
        backgroundColor: c.elevated,
        shadowColor: '#000',
        shadowOpacity: active ? 0.18 : 0,
        shadowRadius: active ? 8 : 0,
        shadowOffset: { width: 0, height: active ? 4 : 0 },
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
        <View {...resp.panHandlers} style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 12 }}>
          <Icon name="drag" size={20} color={active ? c.primary : c.textFaint} />
        </View>
      </View>
    </Animated.View>
  );
}

// Two stacked waypoint rows you can drag (by the ≡ handle) to swap their order —
// "go to the stop first, or the destination first." Cap is one stop, so exactly
// two reorderable rows. On grab the row lifts (scale + shadow + haptic); once you
// cross the threshold the OTHER row slides into the vacated slot so the landing
// spot is obvious; releasing past the threshold commits the swap. onSwap flips
// them; onDragStart/End let the parent disable its ScrollView during the drag.
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

  const finish = (dragPan, dragScale, otherPan) => {
    const didCross = crossedRef.current;
    crossedRef.current = false;
    setActive(null);
    const spring = (val, toValue) =>
      Animated.spring(val, { toValue, useNativeDriver: false, speed: 20, bounciness: 6 }).start();
    spring(dragPan, 0);
    spring(otherPan, 0);
    spring(dragScale, 1);
    fire(onEndRef.current);
    if (didCross) {
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      fire(onSwapRef.current);
    }
  };

  const makeResponder = (which) => {
    const dragPan = which === 'top' ? panTop : panBottom;
    const dragScale = which === 'top' ? scaleTop : scaleBottom;
    const otherPan = which === 'top' ? panBottom : panTop;
    const down = which === 'top'; // top drags down, bottom drags up
    return PanResponder.create({
      // claim the gesture off the handle before the parent ScrollView can scroll
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        crossedRef.current = false;
        setActive(which);
        haptic(() => Haptics.selectionAsync());
        Animated.spring(dragScale, { toValue: 1.04, useNativeDriver: false, speed: 30, bounciness: 8 }).start();
        fire(onStartRef.current);
      },
      onPanResponderMove: (_, g) => {
        const dy = down ? Math.max(0, g.dy) : Math.min(0, g.dy);
        dragPan.setValue(dy);
        const crossed = down ? dy > SWAP_AT : dy < -SWAP_AT;
        if (crossed !== crossedRef.current) {
          crossedRef.current = crossed;
          haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
          // slide the other row into the slot being vacated, for a live preview
          Animated.spring(otherPan, {
            toValue: crossed ? (down ? -GAP : GAP) : 0,
            useNativeDriver: false, speed: 24, bounciness: 6,
          }).start();
        }
      },
      onPanResponderRelease: () => finish(dragPan, dragScale, otherPan),
      onPanResponderTerminate: () => finish(dragPan, dragScale, otherPan),
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
