import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';

// Shows the planned route polyline + station/destination markers (iOS/Android).
export default function RouteMap({ coords, markers }) {
  if (!coords || !coords.length) return null;
  const pts = coords.map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
  return (
    <MapView provider={PROVIDER_DEFAULT} style={styles.map} initialRegion={region(coords)}>
      <Polyline coordinates={pts} strokeColor="#1a73e8" strokeWidth={4} />
      {markers.map((m, i) => (
        <Marker
          key={i}
          coordinate={{ latitude: m.lat, longitude: m.lon }}
          title={m.title}
          pinColor={m.color}
        />
      ))}
    </MapView>
  );
}

function region(coords) {
  const lats = coords.map((c) => c[0]);
  const lons = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.008, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.008, (maxLon - minLon) * 1.6),
  };
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 220, borderRadius: 12 },
});
