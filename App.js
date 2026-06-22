import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, StatusBar,
  SafeAreaView,
} from 'react-native';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';

import StationMap from './components/StationMap';
import StationList from './components/StationList';
import TripScreen from './components/TripScreen';
import BottomSheet from './components/BottomSheet';
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
  const [tab, setTab] = useState('nearby');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike');
  const [selectedId, setSelectedId] = useState(null);
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

  const styles = useMemo(() => makeStyles(c), [c]);

  if (!fontsLoaded) {
    return (
      <View style={[styles.splash, { backgroundColor: c.bg }]}>
        <Text style={{ fontSize: 28 }}>🚲</Text>
        <ActivityIndicator color={c.primary} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const statusColor = error ? c.danger : loading ? c.textFaint : c.good;
  const statusText = error
    ? error
    : loading
    ? 'Loading stations…'
    : `${stations.length} nearby · updated ${formatAge(Math.floor((updatedAt || Date.now()) / 1000))}`;

  const Tabs = (
    <View style={styles.tabBar}>
      {[{ k: 'nearby', label: 'Nearby' }, { k: 'trip', label: 'Plan a trip' }].map((t) => (
        <TouchableOpacity
          key={t.k}
          style={[styles.tab, tab === t.k && styles.tabOn]}
          onPress={() => setTab(t.k)}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabTxt, tab === t.k && styles.tabTxtOn]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const Brand = (
    <View style={styles.brandCard}>
      <Text style={styles.brand}>CitiNav</Text>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Text style={styles.status} numberOfLines={1}>{statusText}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle={c.scheme === 'dark' ? 'light-content' : 'dark-content'} />

      {tab === 'nearby' ? (
        <>
          {/* Full-screen map */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={c.primary} />
              <Text style={styles.centerTxt}>Finding stations near you…</Text>
            </View>
          ) : (
            <StationMap
              stations={all}
              center={center}
              mode={mode}
              selectedId={selectedId}
              onSelect={(s) => setSelectedId(s.id)}
            />
          )}

          {/* Floating top */}
          <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
            <View style={styles.topInner} pointerEvents="box-none">
              {Brand}
              {Tabs}
            </View>
          </SafeAreaView>

          {/* Sheet */}
          <BottomSheet
            renderHeader={() => (
              <View style={styles.sheetHead}>
                <View style={styles.seg}>
                  {[{ k: 'bike', label: 'Need a bike' }, { k: 'dock', label: 'Need a dock' }].map((o) => (
                    <TouchableOpacity
                      key={o.k}
                      style={[styles.segItem, mode === o.k && styles.segItemOn]}
                      onPress={() => setMode(o.k)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.segTxt, mode === o.k && styles.segTxtOn]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          >
            {!loading && stations.length === 0 ? (
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
        </>
      ) : (
        <SafeAreaView style={styles.tripWrap}>
          <View style={styles.tripHead}>
            {Brand}
            {Tabs}
          </View>
          <TripScreen stations={all} />
        </SafeAreaView>
      )}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000 },
    topInner: { padding: 12, gap: 10 },
    brandCard: {
      alignSelf: 'flex-start',
      backgroundColor: c.elevated,
      borderRadius: radius.lg,
      paddingVertical: 8, paddingHorizontal: 14,
      ...shadow(c).card,
    },
    brand: { fontFamily: font.display, fontSize: 20, color: c.text, letterSpacing: -0.4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    status: { fontSize: 12, color: c.textMute, fontFamily: font.medium },

    tabBar: { flexDirection: 'row', backgroundColor: c.elevated, borderRadius: radius.pill, padding: 3, ...shadow(c).card },
    tab: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
    tabOn: { backgroundColor: c.primary },
    tabTxt: { fontSize: 14, fontFamily: font.semibold, color: c.textMute },
    tabTxtOn: { color: c.onPrimary },

    sheetHead: { paddingBottom: 8 },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 14, color: c.textMute, fontFamily: font.semibold },
    segTxtOn: { color: c.text },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    centerTxt: { fontSize: 13, color: c.textMute, textAlign: 'center', fontFamily: font.regular },
    emptyTitle: { fontSize: 16, fontFamily: font.semibold, color: c.text },

    tripWrap: { flex: 1, backgroundColor: c.bg },
    tripHead: { padding: 12, gap: 10 },
  });
}
