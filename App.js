import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, Platform, StatusBar,
} from 'react-native';
import StationMap from './components/StationMap';
import StationList from './components/StationList';
import TripScreen from './components/TripScreen';
import { fetchStations, nearest } from './lib/gbfs';
import { getLocation, DEFAULT_CENTER } from './lib/location';
import { loadSaved, saveSaved } from './lib/storage';
import { Ionicons } from '@expo/vector-icons';
import { formatAge } from './lib/geo';
import { colors, radius, shadow } from './lib/theme';

const REFRESH_MS = 45000;

export default function App() {
  const [all, setAll] = useState([]);
  const [tab, setTab] = useState('nearby');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike');
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

  const stations = useMemo(() => nearest(all, center.lat, center.lon, 75), [all, center]);

  const onToggleSave = useCallback((which, id) => {
    setSaved((prev) => {
      const key = which === 'home' ? 'homeId' : 'workId';
      const next = { ...prev, [key]: prev[key] === id ? null : id };
      saveSaved(next);
      return next;
    });
  }, []);

  const byId = useMemo(() => {
    const m = {};
    for (const s of all) m[s.id] = s;
    return m;
  }, [all]);
  const home = saved.homeId ? byId[saved.homeId] : null;
  const work = saved.workId ? byId[saved.workId] : null;

  const statusEl = error ? (
    <View style={[styles.statusDot, { backgroundColor: colors.danger }]} />
  ) : (
    <View style={[styles.statusDot, { backgroundColor: loading ? colors.textFaint : colors.good }]} />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brandMark}>🚲</Text>
          <Text style={styles.title}>CitiNav</Text>
        </View>
        <View style={styles.statusRow}>
          {statusEl}
          <Text style={styles.sub}>
            {error ? error : loading ? 'Loading stations…' : `${stations.length} nearby · updated ${formatAge(Math.floor((updatedAt || Date.now()) / 1000))}`}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { k: 'nearby', label: 'Nearby' },
          { k: 'trip', label: 'Plan a trip' },
        ].map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.tab, tab === t.k && styles.tabOn]}
            onPress={() => setTab(t.k)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabTxt, tab === t.k && styles.tabTxtOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'trip' ? (
        <TripScreen stations={all} />
      ) : (
        <>
          {/* Saved chips */}
          {(home || work) && (
            <View style={styles.savedBar}>
              {home && (
                <View style={styles.chip}>
                  <Ionicons name="home" size={13} color={colors.primary} />
                  <Text style={styles.chipTxt}>{home.classic} reg · {home.ebikes} elec</Text>
                </View>
              )}
              {work && (
                <View style={styles.chip}>
                  <Ionicons name="briefcase" size={13} color={colors.primary} />
                  <Text style={styles.chipTxt}>{work.docks} docks open</Text>
                </View>
              )}
            </View>
          )}

          {/* Mode segmented control */}
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

          {/* Map */}
          <View style={styles.mapWrap}>
            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.centerTxt}>Finding stations near you…</Text>
              </View>
            ) : (
              <StationMap stations={stations} center={center} mode={mode} />
            )}
          </View>

          {/* List */}
          <View style={styles.listWrap}>
            {!loading && stations.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>No stations nearby</Text>
                <Text style={styles.centerTxt}>Try again in a moment, or check your connection.</Text>
              </View>
            ) : (
              <StationList stations={stations} mode={mode} saved={saved} onToggleSave={onToggleSave} />
            )}
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
          activeOpacity={0.8}
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
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandMark: { fontSize: 20 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  sub: { fontSize: 12, color: colors.textMute },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 3,
    marginHorizontal: 16,
    marginTop: 10,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  tabOn: { backgroundColor: colors.bg, ...shadow.card },
  tabTxt: { fontSize: 14, fontWeight: '700', color: colors.textMute },
  tabTxtOn: { color: colors.text },

  savedBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12,
  },
  chipIcon: { fontSize: 13 },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },

  controls: { paddingHorizontal: 16, paddingVertical: 12 },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  segItemOn: { backgroundColor: colors.bg, ...shadow.card },
  segTxt: { fontSize: 14, color: colors.textMute, fontWeight: '700' },
  segTxtOn: { color: colors.text },

  mapWrap: { flex: 1.1, position: 'relative', overflow: 'hidden' },
  listWrap: { flex: 1, borderTopWidth: 1, borderTopColor: colors.border },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  centerTxt: { fontSize: 13, color: colors.textMute, textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
