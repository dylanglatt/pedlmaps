import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import Icon from './Icon';

// Route polyline + markers. `fill` makes it full-bleed; `follow` recenters on a
// moving point (for active navigation); `showUser` shows the location puck.
// `ink`/`paper` theme the route line and marker ring (ink = foreground line +
// place markers, paper = ring/casing) so everything adapts to light/dark maps.
export default function RouteMap({
  coords, markers, fill, follow, overview, showUser, markersOnly,
  ink = '#111', paper = '#fff',
}) {
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

  const hasCoords = coords && coords.length;
  const hasMarkers = markers && markers.length;
  if (!hasCoords && !hasMarkers) return null;
  const regionPts = hasCoords ? coords : markers.map((m) => [m.lat, m.lon]);
  const pts = hasCoords ? coords.map(([lat, lon]) => ({ latitude: lat, longitude: lon })) : [];
  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={fill ? StyleSheet.absoluteFill : styles.map}
      showsUserLocation={!!showUser}
      initialRegion={region(regionPts)}
    >
      {!markersOnly && hasCoords && (
        <>
          <Polyline coordinates={pts} strokeColor={paper} strokeWidth={9} lineCap="round" lineJoin="round" />
          <Polyline coordinates={pts} strokeColor={ink} strokeWidth={5.5} lineCap="round" lineJoin="round" />
        </>
      )}
      {(markers || []).map((m, i) => (
        <Marker
          key={i}
          coordinate={{ latitude: m.lat, longitude: m.lon }}
          title={m.title}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <MarkerGlyph m={m} paper={paper} />
        </Marker>
      ))}
    </MapView>
  );
}

// Two-tier marker vocabulary: places (origin dot, numbered stop square, dest
// flag square) read big and dark; bike stations (green bike chip, red "P" chip)
// are smaller and subordinate. Every marker gets a paper-colored ring + shadow.
function MarkerGlyph({ m, paper }) {
  const ring = { borderColor: paper };
  switch (m.kind) {
    case 'origin':
      return <View style={[styles.dot, { backgroundColor: m.color }, ring]} />;
    case 'stop':
      return (
        <View style={[styles.sq, { backgroundColor: m.color }, ring]}>
          <Text style={[styles.sqTxt, { color: paper }]}>{m.num ?? ''}</Text>
        </View>
      );
    case 'dest':
      return (
        <View style={[styles.sq, { backgroundColor: m.color }, ring]}>
          <Icon name="flag" size={13} color={paper} />
        </View>
      );
    case 'pickup':
      return (
        <View style={[styles.chip, { backgroundColor: m.color }, ring]}>
          <Icon name="bike" size={12} color="#fff" />
        </View>
      );
    case 'dock':
      return (
        <View style={[styles.chip, { backgroundColor: m.color }, ring]}>
          <Text style={styles.pTxt}>P</Text>
        </View>
      );
    default:
      return <View style={[styles.dot, { backgroundColor: m.color }, ring]} />;
  }
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

const markerShadow = {
  shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
};

const styles = StyleSheet.create({
  map: { width: '100%', height: 220, borderRadius: 12 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, ...markerShadow },
  sq: { minWidth: 26, height: 26, paddingHorizontal: 4, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center', ...markerShadow },
  sqTxt: { fontSize: 13, fontWeight: '800', lineHeight: 16 },
  chip: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', ...markerShadow },
  pTxt: { color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 },
});
