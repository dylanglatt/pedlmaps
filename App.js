import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import StationMap from './components/StationMap';
import StationList from './components/StationList';
import TripScreen from './components/TripScreen';
import BottomSheet from './components/BottomSheet';
import NavScreen from './components/NavScreen';
import Logo from './components/Logo';
import { fetchStations, nearest } from './lib/gbfs';
import { getLocation, DEFAULT_CENTER } from './lib/location';
import { loadSaved, saveSaved } from './lib/storage';
import { formatAge } from './lib/geo';
import { useTheme, radius, font, shadow } from './lib/theme';

const REFRESH_MS = 45000;

export default function App() {
  const c = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold,
  });

  const [all, setAll] = useState([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike');
  const [selectedId, setSelectedId] = useState(null);
  const [saved, setSaved] = useState({ homeId: null, workId: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [searching, setSearching] = useState(false);
  const [navTrip, setNavTrip] = useState(null);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStations();
      setAll(s); setUpdatedAt(Date.now()); setError(null);
    } catch (e) { setError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const [loc, sv] = await Promise.all([getLocation(), loadSaved()]);
      setCenter(loc); setSaved(sv); await refresh();
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

  const openSearch = useCallback(() => { setSearching(true); setSheetIndex(2); }, []);
  const closeSearch = useCallback(() => { setSearching(false); setSheetIndex(1); }, []);

  const styles = useMemo(() => makeStyles(c), [c]);

  if (!fontsLoaded) {
    return (
      <View style={[styles.splash, { backgroundColor: c.bg }]}>
        <Logo size={56} />
        <ActivityIndicator color={c.primary} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const statusColor = error ? c.danger : loading ? c.textFaint : c.good;
  const statusText = error ? 'Offline' : loading ? 'Loading…' : `${stations.length} nearby · ${formatAge(Math.floor((updatedAt || Date.now()) / 1000))}`;

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
        <TouchableOpacity style={styles.search} onPress={openSearch} activeOpacity={0.8}>
          <Ionicons name="search" size={18} color={c.textMute} />
          <Text style={styles.searchTxt}>Where to?</Text>
        </TouchableOpacity>
        <View style={styles.seg}>
          {[{ k: 'bike', label: 'Bikes' }, { k: 'dock', label: 'Docks' }].map((o) => (
            <TouchableOpacity key={o.k} style={[styles.segItem, mode === o.k && styles.segItemOn]} onPress={() => setMode(o.k)} activeOpacity={0.85}>
              <Text style={[styles.segTxt, mode === o.k && styles.segTxtOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );

  return (
    <View style={styles.root}>
      <StatusBar barStyle={c.scheme === 'dark' ? 'light-content' : 'dark-content'} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
          <Text style={styles.centerTxt}>Finding stations near you…</Text>
        </View>
      ) : (
        <StationMap stations={all} center={center} mode={mode} selectedId={selectedId} onSelect={(s) => setSelectedId(s.id)} />
      )}

      {/* Floating brand pill */}
      <View style={styles.brandWrap} pointerEvents="box-none">
        <View style={styles.brandCard}>
          <Logo size={24} />
          <View>
            <Text style={styles.brand}>DockHop</Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: statusColor }]} />
              <Text style={styles.status} numberOfLines={1}>{statusText}</Text>
            </View>
          </View>
        </View>
      </View>

      <BottomSheet index={sheetIndex} onIndexChange={setSheetIndex} renderHeader={Header}>
        {searching ? (
          <TripScreen stations={all} onStartNav={setNavTrip} />
        ) : !loading && stations.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No stations nearby</Text>
            <Text style={styles.centerTxt}>Try again in a moment.</Text>
          </View>
        ) : (
          <StationList
            stations={stations}
            mode={mode}
            saved={saved}
            onToggleSave={onToggleSave}
            onSelect={(s) => { setSelectedId(s.id); setCenter({ lat: s.lat, lon: s.lon }); }}
          />
        )}
      </BottomSheet>

      {navTrip && <NavScreen trip={navTrip} onEnd={() => setNavTrip(null)} />}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    brandWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: Platform.OS === 'ios' ? 56 : 12, paddingHorizontal: 14, zIndex: 1100 },
    brandCard: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: c.elevated, borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 12, ...shadow(c).card },
    brand: { fontFamily: font.display, fontSize: 17, color: c.text, letterSpacing: -0.3 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    status: { fontSize: 11, color: c.textMute, fontFamily: font.medium },

    browseHead: { paddingBottom: 10, gap: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 16 },
    searchTxt: { fontSize: 16, color: c.textMute, fontFamily: font.medium },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segItem: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 14, color: c.textMute, fontFamily: font.semibold },
    segTxtOn: { color: c.text },

    planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
    planTitle: { fontFamily: font.display, fontSize: 18, color: c.text },
    cancel: { fontFamily: font.semibold, fontSize: 15, color: c.primary },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    centerTxt: { fontSize: 13, color: c.textMute, textAlign: 'center', fontFamily: font.regular },
    emptyTitle: { fontSize: 16, fontFamily: font.semibold, color: c.text },
  });
}
