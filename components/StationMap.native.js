import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { stationColor } from '../lib/gbfs';

// Native map (iOS/Android) via react-native-maps. Works in Expo Go.
export default function StationMap({ stations, center, mode, onSelect }) {
  return (
    <MapView
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      initialRegion={{
        latitude: center.lat,
        longitude: center.lon,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      {stations.map((s) => (
        <Marker
          key={s.id}
          coordinate={{ latitude: s.lat, longitude: s.lon }}
          onPress={() => onSelect && onSelect(s)}
        >
          <View style={[styles.dot, { backgroundColor: stationColor(s, mode) }]}>
            <View style={styles.inner} />
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.detail}>
                {mode === 'dock'
                  ? `${s.docks} open docks`
                  : `${s.classic} regular · ${s.ebikes} electric`}
              </Text>
            </View>
          </Callout>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  callout: { minWidth: 150, padding: 4 },
  name: { fontWeight: '700', fontSize: 14, color: '#111' },
  detail: { fontSize: 13, color: '#444', marginTop: 2 },
});
