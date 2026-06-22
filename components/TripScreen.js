import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Platform, Keyboard,
} from 'react-native';
import Icon from './Icon';
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
const CURRENT = () => ({ name: 'My Location', current: true });

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
  const [editing, setEditing] = useState('to'); // which endpoint the search sets
  const [query, setQuery] = useState('');
  const [sugs, setSugs] = useState([]);
  const [recents, setRecents] = useState([]);
  const [origin, setOrigin] = useState(null);   // resolved {name,lat,lon,current?}
  const [dest, setDest] = useState(null);
  const [prefer, setPrefer] = useState('any');
  const [plan, setPlan] = useState(null);        // { best, alternates }
  const [selIdx, setSelIdx] = useState(0);
  const [route, setRoute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    loadRecents().then(setRecents);
    getLocation().then((loc) => setOrigin({ ...CURRENT(), lat: loc.lat, lon: loc.lon })).catch(() => {});
  }, []);

  const onType = useCallback((t) => {
    setQuery(t);
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => {
      try { setSugs(await autocomplete(t)); } catch { setSugs([]); }
    }, 300);
  }, []);

  const allPlans = plan ? [plan.best, ...plan.alternates] : [];
  const current = allPlans[selIdx] || null;

  const runPlan = useCallback(async (org, d, pref) => {
    setBusy(true); setError(null); setPlan(null); setRoute(null); setSelIdx(0);
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

  const resolvePlace = async (place) => {
    if (place.current) { const loc = await getLocation(); return { ...CURRENT(), lat: loc.lat, lon: loc.lon }; }
    if (place.placeId) {
      const det = await placeDetails(place.placeId);
      return { name: place.primary || det.name, address: place.secondary || det.address, lat: det.lat, lon: det.lon };
    }
    return { name: place.name || place.label, address: place.address || '', lat: place.lat, lon: place.lon };
  };

  const choose = useCallback(async (place) => {
    buzz(); Keyboard.dismiss();
    setBusy(true); setError(null);
    try {
      const resolved = await resolvePlace(place);
      const newOrigin = editing === 'from' ? resolved : origin;
      const newDest = editing === 'to' ? resolved : dest;
      if (editing === 'from') setOrigin(resolved);
      else { setDest(resolved); if (!resolved.current) addRecent(resolved).then(setRecents); }
      if (newOrigin && newDest) {
        setPhase('results');
        setQuery(''); setSugs([]);
        await runPlan(newOrigin, newDest, prefer);
      } else {
        setEditing(newOrigin ? 'to' : 'from');
        setQuery(''); setSugs([]);
      }
    } catch (e) { setError(e.message || 'Could not plan trip'); }
    finally { setBusy(false); }
  }, [editing, origin, dest, prefer, runPlan]);

  const editField = useCallback((field) => {
    setEditing(field); setQuery(''); setSugs([]); setPhase('search');
  }, []);

  const changePrefer = useCallback((p) => {
    setPrefer(p);
    if (origin && dest) runPlan(origin, dest, p);
  }, [origin, dest, runPlan]);

  const selectPlan = useCallback(async (idx) => {
    if (idx === selIdx) return;
    buzz();
    setSelIdx(idx);
    const p = allPlans[idx];
    if (!p || !origin || !dest) return;
    setBusy(true);
    try { setRoute(await buildRoute(origin, p.originStation, p.destStation, dest)); }
    catch { setRoute(null); }
    finally { setBusy(false); }
  }, [selIdx, allPlans, origin, dest]);

  const go = useCallback(async () => {
    if (!current || !origin || !dest) return;
    buzz(Haptics?.ImpactFeedbackStyle?.Medium);
    let r = route;
    if (!r) {
      setBusy(true);
      try { r = await buildRoute(origin, current.originStation, current.destStation, dest); }
      catch (e) { setError(e.message || 'Could not start'); setBusy(false); return; }
      setBusy(false);
    }
    onStartNav && onStartNav({ plan: current, route: r, dest });
  }, [current, origin, dest, route, onStartNav]);

  const onRemoveRecent = useCallback(async (r) => { setRecents(await removeRecent(r)); }, []);
  const onClearRecents = useCallback(async () => { setRecents(await clearRecents()); }, []);

  const markers = current
    ? [
        { lat: current.originStation.lat, lon: current.originStation.lon, title: 'Pick up', color: c.good },
        { lat: current.destStation.lat, lon: current.destStation.lon, title: 'Dock', color: c.danger },
        ...(dest ? [{ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.primary }] : []),
      ]
    : [];

  // ---- SEARCH ----
  if (phase === 'search') {
    const showRecents = query.trim().length < 3;
    const originName = origin?.current ? 'My Location' : origin?.name;
    return (
      <View style={styles.flex}>
        {/* From / To editor */}
        <View style={styles.odCard}>
          <TouchableOpacity style={[styles.odRow, editing === 'from' && styles.odRowActive]} onPress={() => setEditing('from')} activeOpacity={0.7}>
            <Icon name="start" size={20} color={c.primary} />
            <Text style={styles.odTxt} numberOfLines={1}>{originName || 'Choose start'}</Text>
          </TouchableOpacity>
          <View style={styles.odDivider} />
          <TouchableOpacity style={[styles.odRow, editing === 'to' && styles.odRowActive]} onPress={() => setEditing('to')} activeOpacity={0.7}>
            <Icon name="pin" size={20} color={c.danger} />
            <Text style={styles.odTxt} numberOfLines={1}>{dest?.name || 'Choose destination'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Icon name="search" size={18} color={c.textMute} />
          <TextInput
            style={styles.searchInput}
            placeholder={editing === 'from' ? 'Choose start' : 'Search for a place'}
            placeholderTextColor={c.textFaint}
            value={query}
            onChangeText={onType}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setSugs([]); }} hitSlop={8}>
              <Icon name="clear" size={18} color={c.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {error && <View style={styles.errRow}><Icon name="warning" size={14} color={c.danger} /><Text style={styles.err}>{error}</Text></View>}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {showRecents ? (
            <>
              {editing === 'from' && (
                <Row icon="navigate" title="My Location" styles={styles} c={c} onPress={() => choose(CURRENT())} />
              )}
              {recents.length > 0 && (
                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Recents</Text>
                  <TouchableOpacity onPress={onClearRecents} hitSlop={8}><Text style={styles.clear}>Clear</Text></TouchableOpacity>
                </View>
              )}
              {recents.map((r, i) => (
                <Row key={i} icon="time" title={r.name || r.label} sub={r.address} styles={styles} c={c}
                  onPress={() => choose(r)} onRemove={() => onRemoveRecent(r)} />
              ))}
            </>
          ) : (
            sugs.map((s) => (
              <Row key={s.placeId} icon="pin" title={s.primary} sub={s.secondary} styles={styles} c={c} onPress={() => choose(s)} />
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ---- RESULTS ----
  const arrivalFor = (p) => formatClock(new Date(Date.now() + p.totalSec * 1000));
  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      {/* From / To (tap to edit) */}
      <View style={styles.odCard}>
        <TouchableOpacity style={styles.odRow} onPress={() => editField('from')} activeOpacity={0.7}>
          <Icon name="start" size={20} color={c.primary} />
          <Text style={styles.odTxt} numberOfLines={1}>{origin?.current ? 'My Location' : origin?.name}</Text>
          <Icon name="forward" size={16} color={c.textFaint} />
        </TouchableOpacity>
        <View style={styles.odDivider} />
        <TouchableOpacity style={styles.odRow} onPress={() => editField('to')} activeOpacity={0.7}>
          <Icon name="pin" size={20} color={c.danger} />
          <Text style={styles.odTxt} numberOfLines={1}>{dest?.name}</Text>
          <Icon name="forward" size={16} color={c.textFaint} />
        </TouchableOpacity>
      </View>

      <View style={styles.prefRow}>
        {[{ k: 'any', label: 'Any bike' }, { k: 'classic', label: 'Classic' }, { k: 'ebike', label: 'E-bike' }].map((o) => (
          <TouchableOpacity key={o.k} style={[styles.pref, prefer === o.k && styles.prefOn]} onPress={() => changePrefer(o.k)} activeOpacity={0.85}>
            <Text style={[styles.prefTxt, prefer === o.k && styles.prefTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {busy && <ActivityIndicator color={c.primary} style={{ marginTop: 20 }} />}
      {error && <View style={styles.errRow}><Icon name="warning" size={14} color={c.danger} /><Text style={styles.err}>{error}</Text></View>}

      {route && <View style={{ marginTop: 14 }}><RouteMap coords={route.coords} markers={markers} /></View>}

      {current && (
        <>
          {/* Selected route card with GO */}
          <View style={styles.bestCard}>
            <View style={styles.bestTop}>
              <View style={styles.flex}>
                <Text style={styles.bestMin}>{fmtMin(current.totalSec)}</Text>
                <Text style={styles.bestSub}>{arrivalFor(current)} arrival · {fmtMiles(current.distanceM || 0)}</Text>
                <Text style={styles.bestType}>on {current.bikeType === 'ebike' ? 'an e-bike' : 'a classic bike'}</Text>
              </View>
              <TouchableOpacity style={styles.goBtn} onPress={go} activeOpacity={0.9}>
                <Text style={styles.goTxt}>GO</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <Step icon="walk" time={fmtMin(current.walkToBikeSec)} title={`Walk to ${current.originStation.name}`} sub={`${current.originStation.classic} regular · ${current.originStation.ebikes} electric`} styles={styles} c={c} />
            <Step icon="bike" time={fmtMin(current.rideSec)} title="Ride" sub={current.bikeType === 'ebike' ? 'on an e-bike' : 'on a classic bike'} styles={styles} c={c} />
            <Step icon="dock" title={`Dock at ${current.destStation.name}`} sub={`${current.destStation.docks} open docks`} styles={styles} c={c} />
            <Step icon="walk" time={fmtMin(current.walkToDestSec)} title={`Walk to ${dest?.name || 'your destination'}`} last styles={styles} c={c} />
          </View>

          {/* Other routes — tap to select */}
          {allPlans.map((p, i) => i === selIdx ? null : (
            <TouchableOpacity key={i} style={styles.altCard} onPress={() => selectPlan(i)} activeOpacity={0.7}>
              <Text style={styles.altMin}>{fmtMin(p.totalSec)}</Text>
              <Text style={styles.altTxt} numberOfLines={1}>via {p.originStation.name} → {p.destStation.name}</Text>
              <Icon name="forward" size={16} color={c.textFaint} />
            </TouchableOpacity>
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
        <View style={styles.rowIcon}><Icon name={icon} size={18} color={c.textMute} /></View>
        <View style={styles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.rowRemove}>
          <Icon name="close" size={16} color={c.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Step({ icon, time, title, sub, last, styles, c }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRail}>
        <Icon name={icon} size={17} color={c.text} />
        {!last && <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepBody}>
        <View style={styles.stepTop}>
          <Text style={styles.stepTitle} numberOfLines={1}>{title}</Text>
          {!!time && <Text style={styles.stepTime}>{time}</Text>}
        </View>
        {!!sub && <Text style={styles.stepSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    odCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: c.surface, borderRadius: radius.md, overflow: 'hidden' },
    odRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
    odRowActive: { backgroundColor: c.surfaceAlt },
    odTxt: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
    odDivider: { height: 1, backgroundColor: c.hairline, marginLeft: 44 },

    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 11 : 6, marginHorizontal: 16, marginBottom: 8 },
    searchInput: { flex: 1, fontSize: 16, color: c.text, fontWeight: '400' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    section: { fontSize: 12, fontWeight: '800', color: c.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
    clear: { fontSize: 13, fontWeight: '600', color: c.primary },

    row: { flexDirection: 'row', alignItems: 'center' },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingLeft: 16 },
    rowRemove: { padding: 14 },
    rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    rowTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    rowSub: { fontSize: 12, color: c.textMute, fontWeight: '400', marginTop: 1 },

    prefRow: { flexDirection: 'row', gap: 6, marginTop: 4, marginHorizontal: 16, backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    pref: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    prefOn: { backgroundColor: c.elevated, ...shadow(c).card },
    prefTxt: { fontSize: 13, fontWeight: '600', color: c.textMute },
    prefTxtOn: { color: c.text },
    errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginHorizontal: 16 },
    err: { color: c.danger, fontSize: 13, fontWeight: '600', flex: 1 },

    bestCard: { borderRadius: radius.lg, padding: 16, marginTop: 14, marginHorizontal: 16, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border, ...shadow(c).card },
    bestTop: { flexDirection: 'row', alignItems: 'center' },
    bestMin: { fontSize: 28, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    bestSub: { fontSize: 13, color: c.textMute, fontWeight: '500', marginTop: 2, fontVariant: ['tabular-nums'] },
    bestType: { fontSize: 12, color: c.textFaint, fontWeight: '400', marginTop: 1 },
    goBtn: { backgroundColor: c.good, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadow(c).card },
    goTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
    divider: { height: 1, backgroundColor: c.hairline, marginVertical: 12 },

    altCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, padding: 14, marginTop: 10, marginHorizontal: 16, backgroundColor: c.surface },
    altMin: { fontSize: 17, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    altTxt: { flex: 1, fontSize: 13, color: c.textMute, fontWeight: '400' },

    step: { flexDirection: 'row' },
    stepRail: { width: 28, alignItems: 'center' },
    stepIcon: { fontSize: 16 },
    stepLine: { flex: 1, width: 2, backgroundColor: c.border, marginVertical: 2 },
    stepBody: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
    stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    stepTitle: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1, paddingRight: 8 },
    stepTime: { fontSize: 13, fontWeight: '600', color: c.textMute, fontVariant: ['tabular-nums'] },
    stepSub: { fontSize: 12, color: c.textMute, marginTop: 1, fontWeight: '400' },
  });
}
