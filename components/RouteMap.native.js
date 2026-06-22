import React, { useRef, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';

// Route polyline + markers. `fill` makes it full-bleed; `follow` recenters on a
// moving point (for active navigation); `showUser` shows the location puck.
export default function RouteMap({ coords, markers, fill, follow, overview, showUser }) {
  const ref = useRef(null);
  useEffect(() => {
    if (follow && ref.current) {
      ref.current.animateToRegion(
        { latitude: follow.lat, longitude: follow.lon, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        700
      );
    }
  }, [follow?.lat, follow?.lon]);

  useEffect(() => {
    if (overview && ref.current && coords && coords.length) {
      ref.current.animateToRegion(region(coords), 600);
    }
  }, [overview]);

  if (!coords || !coords.length) return null;
  const pts = coords.map(([lat, lon]) => ({ latitude: lat, longitude: lon }));
  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={fill ? StyleSheet.absoluteFill : styles.map}
      showsUserLocation={!!showUser}
      initialRegion={region(coords)}
    >
      <Polyline coordinates={pts} strokeColor="#3B34B8" strokeWidth={9} lineCap="round" lineJoin="round" />
      <Polyline coordinates={pts} strokeColor="#5B53E6" strokeWidth={6} lineCap="round" lineJoin="round" />
      {(markers || []).map((m, i) => (
        <Marker key={i} coordinate={{ latitude: m.lat, longitude: m.lon }} title={m.title} pinColor={m.color} />
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

const styles = StyleSheet.create({ map: { width: '100%', height: 220, borderRadius: 12 } });
