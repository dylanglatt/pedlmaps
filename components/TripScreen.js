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
        <Text style={styles.total}>{fmtMin(plan.totalSec)} total</Text>
      </View>
      <Text style={styles.leg}>🚶 {fmtMin(plan.walkToBikeSec)} to <Text style={styles.b}>{o.name}</Text></Text>
      <Text style={styles.sub}>   {o.classic} regular · {o.ebikes} electric</Text>
      <Text style={styles.leg}>🚲 {fmtMin(plan.rideSec)} ride</Text>
      <Text style={styles.leg}>🚶 {fmtMin(plan.walkToDestSec)} from <Text style={styles.b}>{d.name}</Text></Text>
      <Text style={styles.sub}>   {d.docks} open docks</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#777', marginBottom: 4, marginTop: 10, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 },
  prefRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  pref: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  prefOn: { backgroundColor: '#1a73e8' },
  prefTxt: { fontSize: 13, fontWeight: '600', color: '#666' },
  prefTxtOn: { color: '#fff' },
  cta: { backgroundColor: '#1a73e8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  go: { backgroundColor: '#1a9850' },
  stop: { backgroundColor: '#c0392b', marginTop: 10 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  err: { color: '#c0392b', marginTop: 12 },
  plan: { marginTop: 8 },
  card: { borderWidth: 1, borderColor: '#e3e3e3', borderRadius: 12, padding: 14, marginTop: 12 },
  cardDim: { opacity: 0.7 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase' },
  total: { fontSize: 16, fontWeight: '800', color: '#111' },
  leg: { fontSize: 15, color: '#222', marginTop: 4 },
  sub: { fontSize: 12, color: '#777' },
  b: { fontWeight: '700' },
  navBox: { marginTop: 16, padding: 16, backgroundColor: '#f1f8f3', borderRadius: 12 },
  navInstr: { fontSize: 20, fontWeight: '700', color: '#1a7a3a', textAlign: 'center' },
});
