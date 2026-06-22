import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { availabilityLevel, countFor } from '../lib/gbfs';
import { useTheme } from '../lib/theme';

// Native map with viewport culling + zoom level-of-detail:
//  far  -> grid clusters,  mid -> dots,  near -> full pills.
export default function StationMap({ stations, center, mode, bikeType = 'both', selectedId, onSelect }) {
  const c = useTheme();
  const ref = useRef(null);
  const [region, setRegion] = useState({ latitude: center.lat, longitude: center.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 });

  const { lod, items } = useMemo(() => {
    const latD = region.latitudeDelta, lonD = region.longitudeDelta;
    const minLat = region.latitude - latD * 0.7, maxLat = region.latitude + latD * 0.7;
    const minLon = region.longitude - lonD * 0.7, maxLon = region.longitude + lonD * 0.7;
    const vis = stations.filter((s) => s.lat >= minLat && s.lat <= maxLat && s.lon >= minLon && s.lon <= maxLon);

    if (latD > 0.08) {
      const cell = latD / 5;
      const grid = {};
      for (const s of vis) {
        const k = `${Math.round(s.lat / cell)}_${Math.round(s.lon / cell)}`;
        const e = grid[k] || (grid[k] = { lat: 0, lon: 0, n: 0 });
        e.lat += s.lat; e.lon += s.lon; e.n += 1;
      }
      const clusters = Object.entries(grid).map(([k, e]) => ({ id: 'c' + k, lat: e.lat / e.n, lon: e.lon / e.n, count: e.n }));
      return { lod: 'cluster', items: clusters };
    }
    if (latD > 0.03) return { lod: 'dot', items: vis };
    return { lod: 'pill', items: vis };
  }, [stations, region, mode, bikeType]);

  const zoomTo = (lat, lon) => {
    ref.current && ref.current.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: Math.max(0.02, region.latitudeDelta / 3), longitudeDelta: Math.max(0.02, region.longitudeDelta / 3) },
      400
    );
  };

  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={StyleSheet.absoluteFill}
      showsUserLocation
      userInterfaceStyle={c.scheme}
      initialRegion={region}
      onRegionChangeComplete={setRegion}
    >
      {lod === 'cluster' && items.map((cl) => (
        <Marker key={cl.id} coordinate={{ latitude: cl.lat, longitude: cl.lon }} onPress={() => zoomTo(cl.lat, cl.lon)} tracksViewChanges={false}>
          <View style={[styles.cluster, { backgroundColor: c.primary, borderColor: c.bg }]}>
            <Text style={styles.clusterTxt}>{cl.count}</Text>
          </View>
        </Marker>
      ))}

      {lod === 'dot' && items.map((s) => (
        <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lon }} onPress={() => onSelect && onSelect(s)} tracksViewChanges={false}>
          <View style={[styles.dot, { backgroundColor: c[availabilityLevel(s, mode, bikeType)], borderColor: c.bg }]} />
        </Marker>
      ))}

      {lod === 'pill' && items.map((s) => {
        const color = c[availabilityLevel(s, mode, bikeType)];
        const selected = selectedId === s.id;
        const showBoth = mode === 'bike' && bikeType === 'both';
        return (
          <Marker key={s.id} coordinate={{ latitude: s.lat, longitude: s.lon }} onPress={() => onSelect && onSelect(s)} zIndex={selected ? 99 : 1} tracksViewChanges={false}>
            <View style={[styles.pill, { backgroundColor: color, borderColor: c.bg }, selected && styles.pillSel]}>
              {mode === 'dock' ? (
                <Text style={styles.txt}>{s.docks}</Text>
              ) : showBoth ? (
                <View style={styles.row}>
                  <Ionicons name="flash" size={11} color="#fff" />
                  <Text style={styles.txt}>{s.ebikes}</Text>
                  <Ionicons name="bicycle" size={12} color="#fff" style={{ marginLeft: 4 }} />
                  <Text style={styles.txt}>{s.classic}</Text>
                </View>
              ) : (
                <View style={styles.row}>
                  <Ionicons name={bikeType === 'electric' ? 'flash' : 'bicycle'} size={11} color="#fff" />
                  <Text style={styles.txt}>{countFor(s, mode, bikeType)}</Text>
                </View>
              )}
            </View>
            <Callout tooltip>
              <View style={[styles.callout, { backgroundColor: c.elevated, borderColor: c.border }]}>
                <Text style={[styles.cName, { color: c.text }]}>{s.name}</Text>
                <Text style={[styles.cMeta, { color: c.textMute }]}>
                  {mode === 'dock' ? `${s.docks} open docks` : `${s.classic} regular · ${s.ebikes} electric`}
                </Text>
              </View>
            </Callout>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pillSel: { transform: [{ scale: 1.25 }] },
  txt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  dot: { width: 13, height: 13, borderRadius: 7, borderWidth: 1.5 },
  cluster: { minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 4 },
  clusterTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
  callout: { padding: 10, borderRadius: 12, borderWidth: 1, minWidth: 150 },
  cName: { fontSize: 14, fontWeight: '700' },
  cMeta: { fontSize: 12, marginTop: 2 },
});
