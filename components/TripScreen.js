import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Platform, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { directions, WALK, BIKE } from '../lib/routing';
import { autocomplete, placeDetails } from '../lib/places';
import { planTrip, fmtMin, fmtMiles } from '../lib/tripPlanner';
import { getLocation } from '../lib/location';
import { loadRecents, addRecent, removeRecent, clearRecents } from '../lib/storage';
import { formatClock } from '../lib/geo';
import RouteMap from './RouteMap';
import { useTheme, radius, font, shadow } from '../lib/theme';

let Haptics = null;
try { Haptics = require('expo-haptics'); } catch {}
const buzz = (s) => { if (Haptics && Platform.OS !== 'web') Haptics.impactAsync(s || Haptics.ImpactFeedbackStyle.Light); };

const lonlat = (p) => [p.lon, p.lat];

async function buildRoute(origin, oStation, dStation, dest) {
  const legs = await Promise.all([
    directions(WALK, [lonlat(origin), lonlat(oStation)]),
    directions(BIKE, [lonlat(oStation), lonlat(dStation)]),
    directions(WALK, [lonlat(dStation), lonlat(dest)]),
  ]);
  const maneuvers = [];
  const coords = [];
  legs.forEach((leg, i) => {
    if (i === 1) maneuvers.push({ instruction: 'Undock your bike and start riding.', location: leg.maneuvers[0]?.location || coords[coords.length - 1], distance: 0 });
    if (i === 2) maneuvers.push({ instruction: 'Dock your bike, then walk to your destination.', location: leg.maneuvers[0]?.location || coords[coords.length - 1], distance: 0 });
    maneuvers.push(...leg.maneuvers);
    coords.push(...leg.coords);
  });
  return { maneuvers, coords };
}

export default function TripScreen({ stations, onStartNav }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [phase, setPhase] = useState('search');
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState([]);
  const [recents, setRecents] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [dest, setDest] = useState(null);
  const [prefer, setPrefer] = useState('any');
  const [plan, setPlan] = useState(null);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => { loadRecents().then(setRecents); }, []);

  const onType = useCallback((t) => {
    setQuery(t);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => {
      try { setSugs(await autocomplete(t)); } catch { setSugs([]); }
    }, 300);
  }, []);

  const runPlan = useCallback(async (org, d, pref) => {
    setBusy(true); setError(null); setPlan(null); setRoute(null);
    try {
      const result = await planTrip({ origin: org, dest: d, stations, prefer: pref });
      setPlan(result);
      try {
        const r = await buildRoute(org, result.best.originStation, result.best.destStation, d);
        setRoute(r);
      } catch { setRoute(null); }
    } catch (e) { setError(e.message || 'Planning failed'); }
    finally { setBusy(false); }
  }, [stations]);

  const choose = useCallback(async (place) => {
    buzz(); Keyboard.dismiss();
    setBusy(true); setError(null);
    try {
      let d;
      if (place.placeId) {
        const det = await placeDetails(place.placeId);
        d = { name: place.primary || det.name, address: place.secondary || det.address, lat: det.lat, lon: det.lon };
      } else {
        d = { name: place.name || place.label, address: place.address || '', lat: place.lat, lon: place.lon };
      }
      setDest(d);
      addRecent(d).then(setRecents);
      const org = await getLocation();
      setOrigin(org);
      setPhase('results');
      await runPlan(org, d, prefer);
    } catch (e) { setError(e.message || 'Could not plan trip'); }
    finally { setBusy(false); }
  }, [prefer, runPlan]);

  const changePrefer = useCallback((p) => {
    setPrefer(p);
    if (origin && dest) runPlan(origin, dest, p);
  }, [origin, dest, runPlan]);

  const backToSearch = useCallback(() => {
    setPhase('search'); setPlan(null); setRoute(null); setSugs([]); setError(null);
  }, []);

  const go = useCallback(async () => {
    if (!plan || !origin || !dest) return;
    buzz(Haptics?.ImpactFeedbackStyle?.Medium);
    let r = route;
    if (!r) {
      setBusy(true);
      try { r = await buildRoute(origin, plan.best.originStation, plan.best.destStation, dest); }
      catch (e) { setError(e.message || 'Could not start'); setBusy(false); return; }
      setBusy(false);
    }
    onStartNav && onStartNav({ plan: plan.best, route: r, dest });
  }, [plan, origin, dest, route, onStartNav]);

  const onRemoveRecent = useCallback(async (r) => { setRecents(await removeRecent(r)); }, []);
  const onClearRecents = useCallback(async () => { setRecents(await clearRecents()); }, []);

  const markers = plan
    ? [
        { lat: plan.best.originStation.lat, lon: plan.best.originStation.lon, title: 'Pick up', color: c.good },
        { lat: plan.best.destStation.lat, lon: plan.best.destStation.lon, title: 'Dock', color: c.danger },
        ...(dest ? [{ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.primary }] : []),
      ]
    : [];

  // ---- SEARCH ----
  if (phase === 'search') {
    const showRecents = query.trim().length < 3;
    return (
      <View style={styles.flex}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={c.textMute} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a place"
            placeholderTextColor={c.textFaint}
            value={query}
            onChangeText={onType}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSugs([]); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={c.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {error && <Text style={styles.err}>⚠ {error}</Text>}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {showRecents ? (
            <>
              {recents.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Recents</Text>
                  <TouchableOpacity onPress={onClearRecents} hitSlop={8}><Text style={styles.clear}>Clear</Text></TouchableOpacity>
                </View>
              )}
              {recents.map((r, i) => (
                <Row key={i} icon="time-outline" title={r.name || r.label} sub={r.address} styles={styles} c={c}
                  onPress={() => choose(r)} onRemove={() => onRemoveRecent(r)} />
              ))}
              {recents.length === 0 && (
                <Text style={styles.hint}>Search a destination — DockHop routes you from your current location.</Text>
              )}
            </>
          ) : (
            sugs.map((s) => (
              <Row key={s.placeId} icon="location-outline" title={s.primary} sub={s.secondary} styles={styles} c={c} onPress={() => choose(s)} />
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ---- RESULTS (Apple-style preview) ----
  const arrival = plan ? new Date(Date.now() + plan.best.totalSec * 1000) : null;
  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.destRow} onPress={backToSearch} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={c.primary} />
        <View style={styles.destText}>
          <Text style={styles.fromLine}>From Current Location</Text>
          <Text style={styles.destLine} numberOfLines={1}>{dest?.name || dest?.label}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.prefRow}>
        {[{ k: 'any', label: 'Any bike' }, { k: 'classic', label: 'Classic' }, { k: 'ebike', label: 'E-bike' }].map((o) => (
          <TouchableOpacity key={o.k} style={[styles.pref, prefer === o.k && styles.prefOn]} onPress={() => changePrefer(o.k)} activeOpacity={0.85}>
            <Text style={[styles.prefTxt, prefer === o.k && styles.prefTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {busy && <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />}
      {error && <Text style={styles.err}>⚠ {error}</Text>}

      {route && <View style={{ marginTop: 14 }}><RouteMap coords={route.coords} markers={markers} /></View>}

      {plan && (
        <>
          {/* Apple-style primary route card with GO */}
          <View style={styles.bestCard}>
            <View style={styles.bestTop}>
              <View style={styles.flex}>
                <Text style={styles.bestMin}>{fmtMin(plan.best.totalSec)}</Text>
                <Text style={styles.bestSub}>{formatClock(arrival)} arrival · {fmtMiles(plan.best.distanceM || 0)}</Text>
                <Text style={styles.bestType}>on {plan.best.bikeType === 'ebike' ? 'an e-bike' : 'a classic bike'}</Text>
              </View>
              <TouchableOpacity style={styles.goBtn} onPress={go} activeOpacity={0.9}>
                <Text style={styles.goTxt}>GO</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Step icon="🚶" time={fmtMin(plan.best.walkToBikeSec)} title={`Walk to ${plan.best.originStation.name}`} sub={`${plan.best.originStation.classic} regular · ${plan.best.originStation.ebikes} electric`} styles={styles} />
            <Step icon="🚲" time={fmtMin(plan.best.rideSec)} title="Ride" sub={plan.best.bikeType === 'ebike' ? 'on an e-bike' : 'on a classic bike'} styles={styles} />
            <Step icon="🅿️" time={fmtMin(plan.best.walkToDestSec)} title={`Dock at ${plan.best.destStation.name}`} sub={`${plan.best.destStation.docks} open docks`} last styles={styles} />
          </View>

          {plan.alternates.map((p, i) => (
            <View key={i} style={styles.altCard}>
              <Text style={styles.altMin}>{fmtMin(p.totalSec)}</Text>
              <Text style={styles.altTxt} numberOfLines={1}>via {p.originStation.name} → {p.destStation.name}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Row({ icon, title, sub, onPress, onRemove, styles, c }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowMain} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={c.textMute} /></View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.rowRemove}>
          <Ionicons name="close" size={16} color={c.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Step({ icon, time, title, sub, last, styles }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <Text style={styles.stepIcon}>{icon}</Text>
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepTop}>
          <Text style={styles.stepTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.stepTime}>{time}</Text>
        </View>
        {!!sub && <Text style={styles.stepSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 6, marginHorizontal: 16, marginBottom: 8 },
    searchInput: { flex: 1, fontSize: 16, color: c.text, fontFamily: font.regular },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    section: { fontSize: 12, fontFamily: font.bold, color: c.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
    clear: { fontSize: 13, fontFamily: font.semibold, color: c.primary },
    hint: { fontSize: 13, color: c.textMute, fontFamily: font.regular, paddingHorizontal: 16, paddingTop: 12, lineHeight: 19 },

    row: { flexDirection: 'row', alignItems: 'center' },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 16 },
    rowRemove: { padding: 14 },
    rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    rowTitle: { fontSize: 15, fontFamily: font.semibold, color: c.text },
    rowSub: { fontSize: 12, color: c.textMute, fontFamily: font.regular, marginTop: 1 },

    destRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
    destText: { flex: 1 },
    fromLine: { fontSize: 12, color: c.textMute, fontFamily: font.medium },
    destLine: { fontSize: 17, color: c.text, fontFamily: font.semibold },

    prefRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginHorizontal: 16, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    pref: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    prefOn: { backgroundColor: c.elevated, ...shadow(c).card },
    prefTxt: { fontSize: 13, fontFamily: font.semibold, color: c.textMute },
    prefTxtOn: { color: c.text },
    err: { color: c.danger, marginTop: 10, marginHorizontal: 16, fontSize: 13, fontFamily: font.semibold },

    bestCard: { borderRadius: radius.lg, padding: 16, marginTop: 14, marginHorizontal: 16, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border, ...shadow(c).card },
    bestTop: { flexDirection: 'row', alignItems: 'center' },
    bestMin: { fontSize: 28, fontFamily: font.display, color: c.text },
    bestSub: { fontSize: 13, color: c.textMute, fontFamily: font.medium, marginTop: 2 },
    bestType: { fontSize: 12, color: c.textFaint, fontFamily: font.regular, marginTop: 1 },
    goBtn: { backgroundColor: c.good, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadow(c).card },
    goTxt: { color: '#fff', fontSize: 18, fontFamily: font.bold },
    divider: { height: 1, backgroundColor: c.hairline, marginVertical: 12 },

    altCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 14, marginTop: 10, marginHorizontal: 16, backgroundColor: c.surface },
    altMin: { fontSize: 17, fontFamily: font.bold, color: c.text },
    altTxt: { flex: 1, fontSize: 13, color: c.textMute, fontFamily: font.regular },

    step: { flexDirection: 'row' },
    stepRail: { width: 28, alignItems: 'center' },
    stepIcon: { fontSize: 16 },
    stepLine: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
    stepBody: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
    stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stepTitle: { fontSize: 15, fontFamily: font.semibold, color: c.text, flex: 1, paddingRight: 8 },
    stepTime: { fontSize: 13, fontFamily: font.semibold, color: c.textMute },
    stepSub: { fontSize: 12, color: c.textMute, marginTop: 1, fontFamily: font.regular },
  });
}
