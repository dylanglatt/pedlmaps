import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import StationMap from './components/StationMap';
import StationList from './components/StationList';
import TripScreen from './components/TripScreen';
import { fetchStations, nearest } from './lib/gbfs';
import { getLocation, DEFAULT_CENTER } from './lib/location';
import { loadSaved, saveSaved } from './lib/storage';

const REFRESH_MS = 45000;

export default function App() {
  const [all, setAll] = useState([]);
  const [tab, setTab] = useState('nearby'); // 'nearby' | 'trip'
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike'); // 'bike' | 'dock'
  const [saved, setSaved] = useState({ homeId: null, workId: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const stations = await fetchStations();
      setAll(stations);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [loc, sv] = await Promise.all([getLocation(), loadSaved()]);
      setCenter(loc);
      setSaved(sv);
      await refresh();
    })();
    timer.current = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [refresh]);

  const stations = useMemo(
    () => nearest(all, center.lat, center.lon, 75),
    [all, center]
  );

  const onToggleSave = useCallback(
    (which, id) => {
      setSaved((prev) => {
        const key = which === 'home' ? 'homeId' : 'workId';
        const next = { ...prev, [key]: prev[key] === id ? null : id };
        saveSaved(next);
        return next;
      });
    },
    []
  );

  const byId = useMemo(() => {
    const m = {};
    for (const s of all) m[s.id] = s;
    return m;
  }, [all]);
  const home = saved.homeId ? byId[saved.homeId] : null;
  const work = saved.workId ? byId[saved.workId] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>{tab === 'nearby' ? 'Citi Bike Nearby' : 'Plan a Trip'}</Text>
        <Text style={styles.sub}>
          {loading ? 'Loading…' : error ? `⚠ ${error}` : `${stations.length} stations`}
        </Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        {[
          { k: 'nearby', label: 'Nearby' },
          { k: 'trip', label: 'Plan a trip' },
        ].map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.tab, tab === t.k && styles.tabOn]}
            onPress={() => setTab(t.k)}
          >
            <Text style={[styles.tabTxt, tab === t.k && styles.tabTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'trip' ? (
        <TripScreen stations={all} />
      ) : (
      <>
      {/* Saved home/work quick glance */}
      {(home || work) && (
        <View style={styles.savedBar}>
          {home && (
            <Text style={styles.savedItem}>🏠 {home.classic} reg · {home.ebikes} elec</Text>
          )}
          {work && <Text style={styles.savedItem}>💼 {work.docks} docks open</Text>}
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <Seg
          options={[
            { k: 'bike', label: 'Need a bike' },
            { k: 'dock', label: 'Need a dock' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>

      {/* Map (top) */}
      <View style={styles.mapWrap}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <StationMap
            stations={stations}
            center={center}
            mode={mode}
          />
        )}
      </View>

      {/* List (bottom) */}
      <View style={styles.listWrap}>
        <StationList
          stations={stations}
          mode={mode}
          saved={saved}
          onToggleSave={onToggleSave}
        />
      </View>
      </>
      )}
    </SafeAreaView>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <TouchableOpacity
          key={o.k}
          style={[styles.segItem, value === o.k && styles.segItemOn]}
          onPress={() => onChange(o.k)}
        >
          <Text style={[styles.segTxt, value === o.k && styles.segTxtOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 20, fontWeight: '800', color: '#111' },
  sub: { fontSize: 12, color: '#777', marginTop: 2 },
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  tabOn: { backgroundColor: '#111' },
  tabTxt: { fontSize: 14, fontWeight: '700', color: '#666' },
  tabTxtOn: { color: '#fff' },
  savedBar: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  savedItem: { fontSize: 13, fontWeight: '600', color: '#1a73e8' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seg: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 10, padding: 2 },
  segItem: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  segItemOn: { backgroundColor: '#fff', shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  segTxt: { fontSize: 13, color: '#666', fontWeight: '600' },
  segTxtOn: { color: '#111' },
  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eee' },
  pillOn: { backgroundColor: '#1a73e8' },
  pillDisabled: { opacity: 0.4 },
  pillTxt: { fontSize: 13, fontWeight: '600', color: '#666' },
  pillTxtOn: { color: '#fff' },
  mapWrap: { flex: 1.1, position: 'relative', overflow: 'hidden' },
  listWrap: { flex: 1, borderTopWidth: 1, borderTopColor: '#eee' },
});
