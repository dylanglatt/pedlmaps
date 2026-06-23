import React from 'react';
import { Image } from 'react-native';

// pedl app mark — bike + route arrow (assets/icon.png), rounded like an app tile.
export default function Logo({ size = 26 }) {
  return (
    <Image
      source={require('../assets/icon.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      resizeMode="cover"
    />
  );
}
