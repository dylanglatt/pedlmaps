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
  const [bikeType, setBikeType] = useState('both'); // 'both' | 'classic' | 'electric'
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
        <View style={styles.statusLine}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusTxt} numberOfLines={1}>{statusText}</Text>
        </View>
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
        {mode === 'bike' && (
          <View style={styles.typeRow}>
            {[
              { k: 'both', label: 'Both', icon: null },
              { k: 'classic', label: 'Classic', icon: 'bicycle' },
              { k: 'electric', label: 'Electric', icon: 'flash' },
            ].map((o) => (
              <TouchableOpacity key={o.k} style={[styles.chip, bikeType === o.k && styles.chipOn]} onPress={() => setBikeType(o.k)} activeOpacity={0.8}>
                {o.icon && <Ionicons name={o.icon} size={13} color={bikeType === o.k ? c.onPrimary : c.textMute} />}
                <Text style={[styles.chipTxt, bikeType === o.k && styles.chipTxtOn]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
        <StationMap stations={all} center={center} mode={mode} bikeType={bikeType} selectedId={selectedId} onSelect={(s) => setSelectedId(s.id)} />
      )}

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
            bikeType={bikeType}
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

    dot: { width: 7, height: 7, borderRadius: 4 },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2 },
    statusTxt: { fontSize: 12, color: c.textMute, fontFamily: font.medium },

    browseHead: { paddingBottom: 10, gap: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 16 },
    searchTxt: { fontSize: 16, color: c.textMute, fontFamily: font.medium },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segItem: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 14, color: c.textMute, fontFamily: font.semibold },
    segTxtOn: { color: c.text },

    typeRow: { flexDirection: 'row', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipTxt: { fontSize: 13, fontFamily: font.semibold, color: c.textMute },
    chipTxtOn: { color: c.onPrimary },

    planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
    planTitle: { fontFamily: font.display, fontSize: 18, color: c.text },
    cancel: { fontFamily: font.semibold, fontSize: 15, color: c.primary },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    centerTxt: { fontSize: 13, color: c.textMute, textAlign: 'center', fontFamily: font.regular },
    emptyTitle: { fontSize: 16, fontFamily: font.semibold, color: c.text },
  });
}
