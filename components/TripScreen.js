import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { geocode, directions, WALK, BIKE } from '../lib/routing';
import { planTrip, fmtMin } from '../lib/tripPlanner';
import { getLocation } from '../lib/location';
import { nav } from '../lib/voiceNav';
import AutocompleteInput from './AutocompleteInput';
import RouteMap from './RouteMap';
import { colors, radius, shadow } from '../lib/theme';

const lonlat = (p) => [p.lon, p.lat];

// Build maneuvers + polyline for the three legs (walk, bike, walk).
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

export default function TripScreen({ stations }) {
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [destPlace, setDestPlace] = useState(null); // resolved {lat,lon,label} from autocomplete
  const [prefer, setPrefer] = useState('any');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [ctx, setCtx] = useState(null);   // {origin, dest}
  const [route, setRoute] = useState(null); // {coords, maneuvers}
  const [navving, setNavving] = useState(false);
  const [instr, setInstr] = useState('');

  const handlePlan = useCallback(async () => {
    setBusy(true); setError(null); setPlan(null); setRoute(null);
    try {
      const origin = originText.trim() ? await geocode(originText.trim()) : await getLocation();
      if (!origin) throw new Error('Could not find your starting point.');
      const dest = destPlace || (destText.trim() ? await geocode(destText.trim()) : null);
      if (!dest) throw new Error('Could not find that destination.');
      const result = await planTrip({ origin, dest, stations, prefer });
      setCtx({ origin, dest });
      setPlan(result);
      // Fetch route geometry for the best plan (best-effort; won't block the plan).
      try {
        const r = await buildRoute(origin, result.best.originStation, result.best.destStation, dest);
        setRoute(r);
      } catch { setRoute(null); }
    } catch (e) {
      setError(e.message || 'Planning failed');
    } finally {
      setBusy(false);
    }
  }, [originText, destText, destPlace, prefer, stations]);

  const startNav = useCallback(async () => {
    if (!plan || !ctx) return;
    setBusy(true); setError(null);
    try {
      const { origin, dest } = ctx;
      const { best } = plan;
      const r = route || (await buildRoute(origin, best.originStation, best.destStation, dest));
      setNavving(true);
      await nav.start({
        maneuvers: r.maneuvers,
        routeCoords: r.coords,
        onProgress: ({ maneuver }) => setInstr(maneuver.instruction),
        onArrive: () => { setNavving(false); setInstr('Arrived.'); },
        onReroute: async (here) => {
          try {
            const bike = await directions(BIKE, [lonlat(here), lonlat(best.destStation)]);
            const walk = await directions(WALK, [lonlat(best.destStation), lonlat(dest)]);
            nav.maneuvers = [...bike.maneuvers, ...walk.maneuvers];
            nav.routeCoords = [...bike.coords, ...walk.coords];
            nav.idx = 0; nav.preAnnounced = false;
          } catch {}
        },
      });
    } catch (e) {
      setError(e.message || 'Could not start navigation');
      setNavving(false);
    } finally {
      setBusy(false);
    }
  }, [plan, ctx, route]);

  const stopNav = useCallback(() => { nav.stop(); setNavving(false); setInstr(''); }, []);

  const markers = plan
    ? [
        { lat: plan.best.originStation.lat, lon: plan.best.originStation.lon, title: `Pick up: ${plan.best.originStation.name}`, color: 'green' },
        { lat: plan.best.destStation.lat, lon: plan.best.destStation.lon, title: `Dock: ${plan.best.destStation.name}`, color: 'red' },
        ...(ctx?.dest ? [{ lat: ctx.dest.lat, lon: ctx.dest.lon, title: 'Destination', color: 'blue' }] : []),
      ]
    : [];

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>From</Text>
      <TextInput
        style={styles.input}
        placeholder="Your address (blank = current location)"
        value={originText}
        onChangeText={setOriginText}
        autoCorrect={false}
      />
      <Text style={styles.label}>To</Text>
      <AutocompleteInput
        value={destText}
        onChangeText={setDestText}
        onSelectPlace={setDestPlace}
        placeholder="e.g. Grand Central Terminal"
      />

      <View style={styles.prefRow}>
        {[
          { k: 'any', label: 'Any bike' },
          { k: 'classic', label: 'Classic' },
          { k: 'ebike', label: 'E-bike' },
        ].map((o) => (
          <TouchableOpacity
            key={o.k}
            style={[styles.pref, prefer === o.k && styles.prefOn]}
            onPress={() => setPrefer(o.k)}
          >
            <Text style={[styles.prefTxt, prefer === o.k && styles.prefTxtOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.cta} onPress={handlePlan} disabled={busy || !destText.trim()}>
        <Text style={styles.ctaTxt}>{busy ? 'Working…' : 'Plan trip'}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.err}>⚠ {error}</Text>}
      {busy && <ActivityIndicator style={{ marginTop: 16 }} />}

      {route && (
        <View style={{ marginTop: 16 }}>
          <RouteMap coords={route.coords} markers={markers} />
        </View>
      )}

      {plan && (
        <View style={styles.plan}>
          <PlanCard plan={plan.best} title="Best route" />
          {plan.alternates.map((p, i) => (
            <PlanCard key={i} plan={p} title={`Alternate ${i + 1}`} dim />
          ))}

          {!navving ? (
            <TouchableOpacity style={[styles.cta, styles.go]} onPress={startNav}>
              <Text style={styles.ctaTxt}>🔊 Start voice navigation</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.navBox}>
              <Text style={styles.navInstr}>{instr || 'Navigating…'}</Text>
              <TouchableOpacity style={[styles.cta, styles.stop]} onPress={stopNav}>
                <Text style={styles.ctaTxt}>End navigation</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PlanCard({ plan, title, dim }) {
  const o = plan.originStation;
  const d = plan.destStation;
  return (
    <View style={[styles.card, dim && styles.cardDim]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.total}>{fmtMin(plan.totalSec)}</Text>
      </View>
      <Step icon="🚶" time={fmtMin(plan.walkToBikeSec)} title={`Walk to ${o.name}`}
        sub={`${o.classic} regular · ${o.ebikes} electric`} />
      <Step icon="🚲" time={fmtMin(plan.rideSec)} title="Ride" sub={null} />
      <Step icon="🅿️" time={fmtMin(plan.walkToDestSec)} title={`Dock at ${d.name}`}
        sub={`${d.docks} open docks`} last />
    </View>
  );
}

function Step({ icon, time, title, sub, last }) {
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

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 12, color: colors.textMute, marginBottom: 5, marginTop: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  prefRow: { flexDirection: 'row', gap: 8, marginTop: 14, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  pref: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  prefOn: { backgroundColor: colors.bg, ...shadow.card },
  prefTxt: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  prefTxtOn: { color: colors.text },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 16, ...shadow.card },
  go: { backgroundColor: colors.good },
  stop: { backgroundColor: colors.danger, marginTop: 10 },
  ctaTxt: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
  err: { color: colors.danger, marginTop: 12, fontSize: 13, fontWeight: '600' },
  plan: { marginTop: 8 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, marginTop: 12, backgroundColor: colors.bg, ...shadow.card },
  cardDim: { opacity: 0.65 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 12, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
  total: { fontSize: 18, fontWeight: '800', color: colors.primary },

  step: { flexDirection: 'row' },
  stepRail: { width: 28, alignItems: 'center' },
  stepIcon: { fontSize: 16 },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: 12, paddingLeft: 4 },
  stepTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, paddingRight: 8 },
  stepTime: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  stepSub: { fontSize: 12, color: colors.textMute, marginTop: 1 },

  navBox: { marginTop: 16, padding: 18, backgroundColor: colors.goodBg, borderRadius: radius.lg },
  navInstr: { fontSize: 20, fontWeight: '800', color: colors.good, textAlign: 'center' },
});
