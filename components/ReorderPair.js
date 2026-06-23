import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import Icon from './Icon';

const ROW_H = 48;
const SWAP_AT = ROW_H * 0.5;

// Two stacked waypoint rows you can drag (by the ≡ handle) to swap their order —
// "go to the stop first, or the destination first." Cap is one stop, so exactly
// two reorderable rows. onSwap flips them; onDragStart/End let the parent disable
// its ScrollView so the drag isn't stolen.
export default function ReorderPair({ top, bottom, onSwap, onDragStart, onDragEnd, c, styles }) {
  const panTop = useRef(new Animated.Value(0)).current;
  const panBottom = useRef(new Animated.Value(0)).current;
  const onSwapRef = useRef(onSwap); onSwapRef.current = onSwap;
  const onStartRef = useRef(onDragStart); onStartRef.current = onDragStart;
  const onEndRef = useRef(onDragEnd); onEndRef.current = onDragEnd;

  const handle = (pan, dir) => PanResponder.create({
    // claim the gesture before the parent ScrollView can scroll
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: () => { onStartRef.current && onStartRef.current(); },
    onPanResponderMove: (_, g) => {
      const dy = dir === 'down' ? Math.max(0, g.dy) : Math.min(0, g.dy);
      pan.setValue(dy);
    },
    onPanResponderRelease: (_, g) => {
      const crossed = dir === 'down' ? g.dy > SWAP_AT : g.dy < -SWAP_AT;
      Animated.spring(pan, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 6 }).start();
      onEndRef.current && onEndRef.current();
      if (crossed) onSwapRef.current && onSwapRef.current();
    },
    onPanResponderTerminate: () => {
      Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
      onEndRef.current && onEndRef.current();
    },
  });

  const topResp = useRef(handle(panTop, 'down')).current;
  const botResp = useRef(handle(panBottom, 'up')).current;

  const Row = ({ item, pan, resp }) => (
    <Animated.View style={{ transform: [{ translateY: pan }], zIndex: 5, backgroundColor: c.elevated }}>
      <View style={[styles.odRow, { height: ROW_H }]}>
        <Icon name={item.icon} size={item.icon === 'dot' ? 14 : 18} color={item.color} />
        <TouchableOpacity style={styles.flex} onPress={item.onPress} activeOpacity={0.7}>
          <Text style={styles.odTxt} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
        {item.onRemove && (
          <TouchableOpacity onPress={item.onRemove} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Icon name="close" size={16} color={c.textFaint} />
          </TouchableOpacity>
        )}
        <View {...resp.panHandlers} style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 12 }}>
          <Icon name="drag" size={20} color={c.textFaint} />
        </View>
      </View>
    </Animated.View>
  );

  return (
    <View>
      <Row item={top} pan={panTop} resp={topResp} />
      <View style={styles.odDivider} />
      <Row item={bottom} pan={panBottom} resp={botResp} />
    </View>
  );
}
