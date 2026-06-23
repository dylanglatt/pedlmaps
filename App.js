import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import StationMap from './components/StationMap';
import StationList from './components/StationList';
import StationSheet from './components/StationSheet';
import SavedPlaceCard from './components/SavedPlaceCard';
import TripScreen from './components/TripScreen';
import BottomSheet from './components/BottomSheet';
import NavScreen from './components/NavScreen';
import Icon from './components/Icon';
import { fetchStations, nearest } from './lib/gbfs';
import { getLocation, DEFAULT_CENTER } from './lib/location';
import { loadPlaces, addPlace, removePlace, setFlipMode, makePlace, migrateLegacy } from './lib/savedPlaces';
import { loadUnits, saveUnits } from './lib/storage';
import { formatAge } from './lib/geo';
import { useTheme, radius, shadow } from './lib/theme';

// Name a custom place. Alert.prompt is iOS-only; elsewhere we fall back to the
// station name (the saved-places edit flow will cover renaming later).
function promptNickname(defaultName, cb) {
  if (Platform.OS === 'ios' && Alert.prompt) {
    Alert.prompt('Name this place', null,
      (text) => cb((text || '').trim() || defaultName),
      'plain-text', defaultName);
  } else {
    cb(defaultName);
  }
}

SplashScreen.preventAutoHideAsync().catch(() => {});
const REFRESH_MS = 45000;

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const [all, setAll] = useState([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike');
  const [bikeType, setBikeType] = useState('both');
  const [units, setUnits] = useState('imperial');
  const [selectedId, setSelectedId] = useState(null);
  const [chartId, setChartId] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [searching, setSearching] = useState(false);
  const [navTrip, setNavTrip] = useState(null);
  const timer = useRef(null);
  const migrated = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStations();
      setAll(s); setUpdatedAt(Date.now()); setError(null);
    } catch (e) { setError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const [loc, pl, un] = await Promise.all([getLocation(), loadPlaces(), loadUnits()]);
      setCenter(loc); setPlaces(pl); setUnits(un); await refresh();
      SplashScreen.hideAsync().catch(() => {});
    })();
    timer.current = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [refresh]);

  // Once stations arrive, run the one-time migration from the old home/work model.
  useEffect(() => {
    if (migrated.current || !all.length) return;
    migrated.current = true;
    (async () => { const m = await migrateLegacy(all); if (m) setPlaces(m); })();
  }, [all]);

  const stations = useMemo(() => nearest(all, center.lat, center.lon, 75), [all, center]);
  const listStations = useMemo(() => stations.slice(0, 8), [stations]); // just the closest few; map covers the rest, status keeps full nearby count
  const chartStation = useMemo(() => all.find((s) => s.id === chartId) || null, [all, chartId]);

  const reloadPlaces = useCallback(async () => { setPlaces(await loadPlaces()); }, []);

  const changeUnits = useCallback((u) => { setUnits(u); saveUnits(u); }, []);

  const openSearch = useCallback(() => { setSearching(true); setSheetIndex(2); }, []);
  const closeSearch = useCallback(() => { setSearching(false); setSheetIndex(1); }, []);

  const styles = useMemo(() => makeStyles(c), [c]);

  const statusColor = error ? c.danger : loading ? c.textFaint : c.good;
  const statusText = error ? 'Offline' : loading ? 'Loading…' : `${stations.length} stations nearby · updated ${formatAge(Math.floor((updatedAt || Date.now()) / 1000))}`;

  const Header = () =>
    searching ? (
      <View style={styles.planHead}>
        <Text style={styles.planTitle}>Plan a trip</Text>
        <TouchableOpacity onPress={closeSearch} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={styles.browseHead}>
        <View style={styles.statusRow}>
          <View style={styles.statusLine}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusTxt} numberOfLines={1}>{statusText}</Text>
          </View>
          <View style={styles.unitToggle}>
            {[{ k: 'imperial', label: 'mi' }, { k: 'metric', label: 'km' }].map((u) => (
              <TouchableOpacity key={u.k} style={[styles.unitItem, units === u.k && styles.unitItemOn]} onPress={() => changeUnits(u.k)} activeOpacity={0.8}>
                <Text style={[styles.unitTxt, units === u.k && styles.unitTxtOn]}>{u.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={styles.search} onPress={openSearch} activeOpacity={0.8}>
          <Icon name="search" size={18} color={c.textMute} />
          <Text style={styles.searchTxt}>Where to?</Text>
        </TouchableOpacity>
        <View style={styles.seg}>
          {[{ k: 'bike', label: 'Bikes' }, { k: 'dock', label: 'Docks' }].map((o) => (
            <TouchableOpacity key={o.k} style={[styles.segItem, mode === o.k && styles.segItemOn]} onPress={() => setMode(o.k)} activeOpacity={0.85}>
              <Text style={[styles.segTxt, mode === o.k && styles.segTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {mode === 'bike' && (
          <View style={styles.seg}>
            {[
              { k: 'both', label: 'Both' },
              { k: 'electric', label: 'Electric' },
              { k: 'classic', label: 'Manual' },
            ].map((o) => (
              <TouchableOpacity key={o.k} style={[styles.segItem, bikeType === o.k && styles.segItemOn]} onPress={() => setBikeType(o.k)} activeOpacity={0.85}>
                <Text style={[styles.segTxt, bikeType === o.k && styles.segTxtOn]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );

  return (
    <View style={styles.root}>
      <StatusBar barStyle={c.scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <StationMap stations={all} center={center} mode={mode} bikeType={bikeType} selectedId={selectedId} onSelect={(s) => { setSelectedId(s.id); setChartId(s.id); }} />


      <BottomSheet index={sheetIndex} onIndexChange={setSheetIndex} renderHeader={Header} bottomInset={insets.bottom}>
        {searching ? (
          <TripScreen stations={all} onStartNav={setNavTrip} />
        ) : !loading && stations.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No stations nearby</Text>
            <Text style={styles.centerTxt}>Try again in a moment.</Text>
          </View>
        ) : (
          <StationList
            stations={listStations}
            mode={mode}
            bikeType={bikeType}
            units={units}
            onOpenChart={(s) => setChartId(s.id)}
            onSelect={(s) => { setSelectedId(s.id); setCenter({ lat: s.lat, lon: s.lon }); }}
          />
        )}
      </BottomSheet>

      {chartStation && <StationSheet station={chartStation} initialMode={mode} onClose={() => setChartId(null)} />}

      {navTrip && <NavScreen trip={navTrip} onEnd={() => setNavTrip(null)} />}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    dot: { width: 7, height: 7, borderRadius: 4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2, flexShrink: 1 },
    statusTxt: { fontSize: 12, color: c.textMute, fontWeight: '500' },
    unitToggle: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 2, marginLeft: 8 },
    unitItem: { paddingVertical: 3, paddingHorizontal: 11, borderRadius: radius.pill },
    unitItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    unitTxt: { fontSize: 12, color: c.textMute, fontWeight: '600' },
    unitTxtOn: { color: c.text },

    browseHead: { paddingBottom: 10, gap: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 16 },
    searchTxt: { fontSize: 16, color: c.textMute, fontWeight: '500' },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segItem: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 14, color: c.textMute, fontWeight: '600' },
    segTxtOn: { color: c.text },

    planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
    planTitle: { fontWeight: '800', fontSize: 18, color: c.text },
    cancel: { fontWeight: '600', fontSize: 15, color: c.primary },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    centerTxt: { fontSize: 13, color: c.textMute, textAlign: 'center', fontWeight: '400' },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  });
}
