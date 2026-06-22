import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { stationColor, relevantCount } from '../lib/gbfs';

// Native map (iOS/Android) via react-native-maps. Works in Expo Go.
export default function StationMap({ stations, center, mode, ebikeOnly, onSelect }) {
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
          tracksViewChanges={false}
        >
          <View style={[styles.dot, { backgroundColor: stationColor(s, mode, ebikeOnly) }]}>
            <View style={styles.inner} />
          </View>
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
});
