import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { availabilityLevel, countFor } from '../lib/gbfs';
import { distanceMeters } from '../lib/geo';
import { useTheme } from '../lib/theme';

// Hide a station pill this close to the user dot so the dot stands clean (it's
// still in the station list). Just the dot's own footprint — only suppresses a
// station you're effectively standing on.
const USER_HIDE_M = 20;

// Native map with viewport culling + zoom level-of-detail:
//  far  -> grid clusters,  mid -> dots,  near -> full pills.
export default function StationMap({ stations, center, userLoc = null, mode, bikeType = 'both', selectedId, onSelect, recenterTick = 0 }) {
  const c = useTheme();
  const ref = useRef(null);
  const [region, setRegion] = useState({ latitude: center.lat, longitude: center.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 });

  // react-native-maps shows a blank custom marker if tracksViewChanges starts
  // false, so paint once then freeze it (perf: the dot view never changes, only
  // its coordinate, which doesn't need re-rasterizing).
  const [userTracks, setUserTracks] = useState(true);
  useEffect(() => {
    if (!userLoc) return;
    setUserTracks(true);
    const t = setTimeout(() => setUserTracks(false), 1500);
    return () => clearTimeout(t);
  }, [userLoc ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter the map on `center` whenever the locate button bumps recenterTick.
  // (Gated on the tick so list-selection center changes don't yank the map.)
  useEffect(() => {
    if (!recenterTick || !ref.current) return;
    ref.current.animateToRegion(
      { latitude: center.lat, longitude: center.lon, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      500
    );
  }, [recenterTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const { lod, items } = useMemo(() => {
    const latD = region.latitudeDelta, lonD = region.longitudeDelta;
    const minLat = region.latitude - latD * 0.7, maxLat = region.latitude + latD * 0.7;
    const minLon = region.longitude - lonD * 0.7, maxLon = region.longitude + lonD * 0.7;
    let vis = stations.filter((s) => s.lat >= minLat && s.lat <= maxLat && s.lon >= minLon && s.lon <= maxLon);
    // Drop the pill directly under the user dot so the dot reads clean.
    if (userLoc) vis = vis.filter((s) => distanceMeters(s.lat, s.lon, userLoc.lat, userLoc.lon) > USER_HIDE_M);

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
  }, [stations, region, mode, bikeType, userLoc]);

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
                // A single bike-type filter is active — the toggle already says
                // which type, so just show the number (no redundant icon).
                <Text style={styles.txt}>{countFor(s, mode, bikeType)}</Text>
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

      {userLoc && (
        <Marker
          coordinate={{ latitude: userLoc.lat, longitude: userLoc.lon }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={1000}
          tracksViewChanges={userTracks}
        >
          <View style={[styles.userHalo, { backgroundColor: hexA(c.nav, 0.16) }]}>
            <View style={styles.userCasing}>
              <View style={[styles.userDot, { backgroundColor: c.nav }]} />
            </View>
          </View>
        </Marker>
      )}
    </MapView>
  );
}

// Hex color -> rgba string at the given alpha (for the translucent accuracy halo).
function hexA(hex, a) {
  const h = (hex || '#0A84FF').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
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

  // User-location dot: translucent accuracy halo > white casing > solid dot.
  userHalo: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  userCasing: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 }, elevation: 4,
  },
  userDot: { width: 14, height: 14, borderRadius: 7 },
});
