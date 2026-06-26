import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Alert, Platform, Linking,
  Animated, Easing, Keyboard,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';

import StationMap from './components/StationMap';
import StationList from './components/StationList';
import StationSheet from './components/StationSheet';
import SavedPlaceCard from './components/SavedPlaceCard';
import TripScreen from './components/TripScreen';
import BottomSheet from './components/BottomSheet';
import NavScreen from './components/NavScreen';
import Feedback from './components/Feedback';
import Icon from './components/Icon';
import { fetchStations, nearest, countFor } from './lib/gbfs';
import { getLocation, watchLocation, DEFAULT_CENTER } from './lib/location';
import { loadPlaces, addPlace, removePlace, setFlipMode, makePlace, migrateLegacy } from './lib/savedPlaces';
import { loadFavStations, saveFavStations, isFavStation } from './lib/savedStations';
import { loadUnits, saveUnits, loadOnboarded, saveOnboarded } from './lib/storage';
import FirstRun from './components/FirstRun';
import { formatAge, distanceMeters } from './lib/geo';
import { useTheme, radius, shadow } from './lib/theme';
import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from './lib/config';

// Crash + error reporting. No-op when SENTRY_DSN is empty (web preview, or before
// the project exists) and disabled in dev so local work never pollutes the dashboard
// — TestFlight/production builds aren't __DEV__, so they report normally. To smoke-test
// that events arrive, temporarily set `enabled: true` and trigger an error.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    tracesSampleRate: 0.2, // light performance sampling for a beta; raise later if useful
  });
}

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

// Live-status dot with a gentle expanding halo (a "breathing" pulse) when data
// is fresh. Native-driver scale+opacity, so it's smooth and OTA-safe. When
// offline/loading we pass pulse=false and it sits as a static dot.
function PulseDot({ color, pulse }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return undefined;
    a.setValue(0);
    const loop = Animated.loop(
      Animated.timing(a, { toValue: 1, duration: 1900, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, a]);
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 2.8] });
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
      {pulse && (
        <Animated.View style={{ position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: color, transform: [{ scale }], opacity }} />
      )}
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

SplashScreen.preventAutoHideAsync().catch(() => {});
const REFRESH_MS = 45000;

// Dev-only: force the first-run primer to show on every launch while you iterate
// on its design (so you don't have to reinstall to clear the onboarded flag).
// __DEV__-gated, so production builds are NEVER affected. Flip to `&& false` when done.
const FORCE_PRIMER = __DEV__ && false;

// Last-resort fallback if a render error escapes everything else: show a calm
// message instead of a blank white screen. Sentry has already captured the error
// by the time this renders. Colors are hardcoded (matches the splash) because the
// theme provider may itself be the thing that failed.
function CrashFallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F18', padding: 24 }}>
      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 6 }}>Something went wrong</Text>
      <Text style={{ color: '#9AA3B2', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
        Pedl hit an unexpected error and the team has been notified. Please close and reopen the app.
      </Text>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <Sentry.ErrorBoundary fallback={<CrashFallback />}>
        <AppInner />
      </Sentry.ErrorBoundary>
    </SafeAreaProvider>
  );
}

// Sentry.wrap enables native crash + performance instrumentation around the root.
export default Sentry.wrap(App);

function AppInner() {
  const c = useTheme();
  const insets = useSafeAreaInsets();

  const [all, setAll] = useState([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [mode, setMode] = useState('bike');
  const [bikeType, setBikeType] = useState('electric'); // default: electric only (less map clutter)
  const [sort, setSort] = useState('near'); // 'near' (proximity) | 'avail' (most bikes/docks)
  const [units, setUnits] = useState('imperial');
  const [selectedId, setSelectedId] = useState(null);
  const [chartId, setChartId] = useState(null);
  const [favIds, setFavIds] = useState([]);          // favorite station ids
  const [showAllNearby, setShowAllNearby] = useState(false);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [sheetIndex, setSheetIndex] = useState(1);
  const [searching, setSearching] = useState(false);
  const [navTrip, setNavTrip] = useState(null);
  const [locStatus, setLocStatus] = useState('granted'); // 'granted' | 'denied' | 'unavailable'
  const [recenterTick, setRecenterTick] = useState(0);
  const [userLoc, setUserLoc] = useState(null); // live device position for the map dot (null = unknown)
  const [showPrimer, setShowPrimer] = useState(false); // first-run welcome/permission primer
  const timer = useRef(null);
  const watchStop = useRef(null);
  const migrated = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchStations();
      setAll(s); setUpdatedAt(Date.now()); setError(null);
    } catch (e) { setError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  // Request location, drop the dot, recenter, and start the live watch. Called on
  // launch for returning users, or after the first-run primer for new ones — so
  // the OS prompt always has on-screen context.
  const initLocation = useCallback(async () => {
    const loc = await getLocation();
    setCenter({ lat: loc.lat, lon: loc.lon }); setLocStatus(loc.status);
    if (!loc.fallback) { setUserLoc({ lat: loc.lat, lon: loc.lon }); setRecenterTick((t) => t + 1); }
    watchStop.current = await watchLocation((p) => { setUserLoc(p); setLocStatus('granted'); });
  }, []);

  useEffect(() => {
    (async () => {
      const [pl, un, onboarded, fv] = await Promise.all([loadPlaces(), loadUnits(), loadOnboarded(), loadFavStations()]);
      setPlaces(pl); setUnits(un); setFavIds(fv); await refresh();
      SplashScreen.hideAsync().catch(() => {}); // reveal the app once data is in
      if (onboarded && !FORCE_PRIMER) initLocation();
      else setShowPrimer(true); // defer the OS location prompt until they tap "Get started"
    })();
    timer.current = setInterval(refresh, REFRESH_MS);
    return () => { clearInterval(timer.current); if (watchStop.current) watchStop.current(); };
  }, [refresh, initLocation]);

  const finishPrimer = useCallback(async () => {
    setShowPrimer(false);
    await saveOnboarded();
    initLocation();
  }, [initLocation]);

  // Locate button: re-fetch the user's position and recenter the map. If
  // permission is denied (iOS won't re-prompt once denied), send them to Settings.
  const recenter = useCallback(async () => {
    const loc = await getLocation();
    setLocStatus(loc.status);
    if (loc.fallback) {
      Linking.openSettings().catch(() => {});
      return;
    }
    setUserLoc({ lat: loc.lat, lon: loc.lon });
    setCenter({ lat: loc.lat, lon: loc.lon });
    setRecenterTick((t) => t + 1);
  }, []);

  const openLocationSettings = useCallback(() => { Linking.openSettings().catch(() => {}); }, []);

  // Once stations arrive, run the one-time migration from the old home/work model.
  useEffect(() => {
    if (migrated.current || !all.length) return;
    migrated.current = true;
    (async () => { const m = await migrateLegacy(all); if (m) setPlaces(m); })();
  }, [all]);

  const stations = useMemo(() => nearest(all, center.lat, center.lon, 75), [all, center]);
  const favIdSet = useMemo(() => new Set(favIds), [favIds]);
  // Favorite stations resolved to live data, with distance from the current center.
  const favStations = useMemo(() => {
    if (!favIds.length || !all.length) return [];
    return favIds
      .map((id) => {
        const s = all.find((x) => x.id === id);
        return s ? { ...s, distance: distanceMeters(center.lat, center.lon, s.lat, s.lon) } : null;
      })
      .filter(Boolean);
  }, [favIds, all, center]);
  // Nearby pool excludes favorites (no dupes); sort reorders within it. Collapsed
  // shows the nearest few; "Show all" expands to the full nearby set.
  const NEARBY_CAP = 6;
  const nearbyPool = useMemo(() => {
    const pool = stations.filter((s) => !favIdSet.has(s.id));
    return sort === 'avail' ? [...pool].sort((a, b) => countFor(b, mode, bikeType) - countFor(a, mode, bikeType)) : pool;
  }, [stations, favIdSet, sort, mode, bikeType]);
  const listStations = useMemo(() => (showAllNearby ? nearbyPool : nearbyPool.slice(0, NEARBY_CAP)), [nearbyPool, showAllNearby]);
  const canExpand = nearbyPool.length > NEARBY_CAP;
  const chartStation = useMemo(() => all.find((s) => s.id === chartId) || null, [all, chartId]);

  const toggleFav = useCallback((station) => {
    if (!station) return;
    setFavIds((cur) => {
      const next = cur.includes(station.id) ? cur.filter((id) => id !== station.id) : [...cur, station.id];
      saveFavStations(next);
      return next;
    });
  }, []);

  // Long-press a pinned favorite to remove it (confirmed). Same gesture/dialog as
  // long-pressing a saved place tile in the planner.
  const confirmRemoveFav = useCallback((station) => {
    if (!station) return;
    Alert.alert('Remove from Favorites?', station.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => toggleFav(station) },
    ]);
  }, [toggleFav]);

  const reloadPlaces = useCallback(async () => { setPlaces(await loadPlaces()); }, []);

  const changeUnits = useCallback((u) => { setUnits(u); saveUnits(u); }, []);

  const openSearch = useCallback(() => { setSearching(true); setSheetIndex(2); }, []);
  const closeSearch = useCallback(() => { Keyboard.dismiss(); setSearching(false); setSheetIndex(1); }, []);

  const [feedback, setFeedback] = useState(null); // screen name when the feedback sheet is open

  const styles = useMemo(() => makeStyles(c), [c]);

  const ageSec = updatedAt ? Math.floor((Date.now() - updatedAt) / 1000) : 0;
  const statusColor = error ? c.danger : loading ? c.textFaint : c.good;
  const statusText = error ? 'Offline' : loading ? 'Loading…'
    : ageSec < 90 ? 'Updated just now' : `Updated ${formatAge(Math.floor(updatedAt / 1000))}`;

  const Header = () =>
    searching ? (
      <View style={styles.planHead}>
        <View style={styles.titleRow}>
          <Text style={styles.planTitle}>Plan a trip</Text>
          <TouchableOpacity style={styles.betaPill} onPress={() => setFeedback('Plan a trip')} activeOpacity={0.8} hitSlop={6} accessibilityRole="button" accessibilityLabel="Send feedback">
            <Icon name="chat" size={11} color={c.onPrimary} />
            <Text style={styles.betaTxt}>BETA</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={closeSearch} hitSlop={10}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={styles.browseHead}>
        <View style={styles.headTop}>
          <TouchableOpacity style={styles.betaPill} onPress={() => setFeedback('Nearby')} activeOpacity={0.8} hitSlop={6} accessibilityRole="button" accessibilityLabel="Send feedback">
            <Icon name="chat" size={11} color={c.onPrimary} />
            <Text style={styles.betaTxt}>BETA</Text>
          </TouchableOpacity>
          <View style={styles.headRight}>
            {mode === 'bike' && (
              <View style={styles.filterToggle}>
                {[
                  { k: 'electric', icon: 'flash', label: 'Electric bikes' },
                  { k: 'classic', icon: 'bicycle', label: 'Classic bikes' },
                  { k: 'both', text: 'Any', label: 'Any bike' },
                ].map((o) => (
                  <TouchableOpacity
                    key={o.k}
                    style={[styles.filterItem, bikeType === o.k && styles.unitItemOn]}
                    onPress={() => setBikeType(o.k)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${o.label}`}
                    accessibilityState={{ selected: bikeType === o.k }}
                  >
                    {o.icon ? (
                      <Ionicons name={o.icon} size={13} color={bikeType === o.k ? c.text : c.textMute} />
                    ) : (
                      <Text style={[styles.unitTxt, bikeType === o.k && styles.unitTxtOn]}>{o.text}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.unitToggle}>
              {[{ k: 'imperial', label: 'mi' }, { k: 'metric', label: 'km' }].map((u) => (
                <TouchableOpacity key={u.k} style={[styles.unitItem, units === u.k && styles.unitItemOn]} onPress={() => changeUnits(u.k)} activeOpacity={0.8}>
                  <Text style={[styles.unitTxt, units === u.k && styles.unitTxtOn]}>{u.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        <View style={styles.statusLine}>
          <PulseDot color={statusColor} pulse={!error && !loading} />
          <Text style={styles.statusTxt} numberOfLines={1}>{statusText}</Text>
        </View>
        <TouchableOpacity style={styles.search} onPress={openSearch} activeOpacity={0.8}>
          <Icon name="search" size={18} color={c.textMute} />
          <Text style={styles.searchTxt}>Where to?</Text>
        </TouchableOpacity>
        <View style={styles.seg}>
          {[{ k: 'bike', label: 'Bikes' }, { k: 'dock', label: 'Stations' }].map((o) => (
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

      <StationMap stations={all} center={center} userLoc={userLoc} mode={mode} bikeType={bikeType} selectedId={selectedId} recenterTick={recenterTick} onSelect={(s) => { setSelectedId(s.id); setChartId(s.id); }} />

      {locStatus !== 'granted' && (
        <TouchableOpacity
          style={[styles.locBanner, { top: insets.top + 10 }]}
          onPress={openLocationSettings}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Location is off. Open Settings to enable."
        >
          <Ionicons name="location-outline" size={15} color={c.onPrimary} />
          <Text style={styles.locBannerTxt} numberOfLines={1}>
            Location off — showing Midtown. Tap to enable.
          </Text>
        </TouchableOpacity>
      )}

      {/* Recenter button — pinned top-right, above the sheet (zIndex). The sheet's
          largest detent stops below it (BottomSheet topReserve), so it's always
          visible and never collides with the in-sheet filter menu. */}
      <TouchableOpacity
        style={[styles.locBtn, { top: insets.top + 10 }]}
        onPress={recenter}
        activeOpacity={0.85}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={locStatus === 'granted' ? 'Recenter on my location' : 'Enable location access'}
      >
        <Ionicons
          name={locStatus === 'granted' ? 'locate' : 'locate-outline'}
          size={20}
          color={locStatus === 'granted' ? c.nav : c.textMute}
        />
      </TouchableOpacity>

      <BottomSheet index={sheetIndex} onIndexChange={setSheetIndex} renderHeader={Header} bottomInset={insets.bottom} topReserve={insets.top + 64}>
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
            favorites={favStations}
            mode={mode}
            bikeType={bikeType}
            units={units}
            expanded={showAllNearby}
            onToggleExpanded={canExpand ? () => setShowAllNearby((v) => !v) : null}
            canExpand={canExpand}
            header={
              <View style={styles.sortRow}>
                <Text style={styles.nearbyLbl}>NEARBY</Text>
                <View style={styles.sortToggle}>
                  {[
                    { k: 'near', label: 'Nearest' },
                    { k: 'avail', label: mode === 'dock' ? 'Most docks' : 'Most bikes' },
                  ].map((o) => (
                    <TouchableOpacity
                      key={o.k}
                      style={[styles.sortItem, sort === o.k && styles.unitItemOn]}
                      onPress={() => setSort(o.k)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sort === o.k }}
                    >
                      <Text style={[styles.sortTxt, sort === o.k && styles.unitTxtOn]}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
            onOpenChart={(s) => setChartId(s.id)}
            onRemoveFavorite={confirmRemoveFav}
            onSelect={(s) => { setSelectedId(s.id); setCenter({ lat: s.lat, lon: s.lon }); setChartId(s.id); }}
          />
        )}
      </BottomSheet>

      {chartStation && <StationSheet station={chartStation} initialMode={mode} isFav={isFavStation(favIds, chartStation.id)} onToggleFav={toggleFav} onClose={() => setChartId(null)} />}

      {navTrip && <NavScreen trip={navTrip} onEnd={() => setNavTrip(null)} />}

      <Feedback visible={!!feedback} screen={feedback} onClose={() => setFeedback(null)} />

      <FirstRun visible={showPrimer} onDone={finishPrimer} />
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    dot: { width: 7, height: 7, borderRadius: 4 },

    // Floating "recenter on me" button, top-right over the map.
    locBtn: {
      position: 'absolute', right: 12, width: 42, height: 42, borderRadius: 21, zIndex: 1001,
      backgroundColor: c.elevated, alignItems: 'center', justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, ...shadow(c).card,
    },
    // "Location off" banner, top-left, leaving room for the locate button.
    locBanner: {
      position: 'absolute', left: 12, right: 64, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12,
      ...shadow(c).card,
    },
    locBannerTxt: { color: c.onPrimary, fontSize: 12, fontWeight: '600', flexShrink: 1 },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    betaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 },
    betaTxt: { color: c.onPrimary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2, flexShrink: 1 },
    statusTxt: { fontSize: 12, color: c.textMute, fontWeight: '500' },
    unitToggle: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 2, marginLeft: 8 },
    unitItem: { paddingVertical: 3, paddingHorizontal: 11, borderRadius: radius.pill },
    unitItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    unitTxt: { fontSize: 12, color: c.textMute, fontWeight: '600' },
    unitTxtOn: { color: c.text },
    // Bike-type filter (electric / classic / any) — compact pill beside the units.
    headRight: { flexDirection: 'row', alignItems: 'center' },
    filterToggle: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 2 },
    filterItem: { minWidth: 30, paddingVertical: 3, paddingHorizontal: 9, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    // Sort control above the station list.
    sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
    nearbyLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: c.textFaint },
    sortToggle: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.pill, padding: 2 },
    sortItem: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill },
    sortTxt: { fontSize: 12.5, color: c.textMute, fontWeight: '600' },

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
