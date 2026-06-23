import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import Icon from './Icon';

const ROW_H = 48;
const SWAP_AT = ROW_H * 0.55;

// Two stacked waypoint rows you can drag (by the ≡ handle) to swap their order —
// "go to the stop first, or the destination first." Cap is one stop, so exactly
// two reorderable rows. `top`/`bottom` describe each row; onSwap flips them.
export default function ReorderPair({ top, bottom, onSwap, c, styles }) {
  const panTop = useRef(new Animated.Value(0)).current;
  const panBottom = useRef(new Animated.Value(0)).current;
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap; // always call the latest (avoids stale closure after a swap)

  const handle = (pan, dir) => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
    onPanResponderMove: (_, g) => {
      // only allow dragging toward the other row (top drags down, bottom drags up)
      const dy = dir === 'down' ? Math.max(0, g.dy) : Math.min(0, g.dy);
      pan.setValue(dy);
    },
    onPanResponderRelease: (_, g) => {
      const crossed = dir === 'down' ? g.dy > SWAP_AT : g.dy < -SWAP_AT;
      Animated.spring(pan, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      if (crossed) onSwapRef.current && onSwapRef.current();
    },
  });

  const topResp = useRef(handle(panTop, 'down')).current;
  const botResp = useRef(handle(panBottom, 'up')).current;

  const Row = ({ item, pan, resp }) => (
    <Animated.View style={{ transform: [{ translateY: pan }], zIndex: 5 }}>
      <View style={[styles.odRow, { height: ROW_H }]}>
        <Icon name={item.icon} size={18} color={item.color} />
        <TouchableOpacity style={styles.flex} onPress={item.onPress} activeOpacity={0.7}>
          <Text style={styles.odTxt} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
        {item.onRemove && (
          <TouchableOpacity onPress={item.onRemove} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Icon name="close" size={16} color={c.textFaint} />
          </TouchableOpacity>
        )}
        <View {...resp.panHandlers} style={{ paddingLeft: 8, paddingVertical: 6 }}>
          <Icon name="drag" size={18} color={c.textFaint} />
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
