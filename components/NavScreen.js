import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Switch, ScrollView, Dimensions,
  PanResponder, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Icon from './Icon';
import RouteMap from './RouteMap';
import { nav } from '../lib/voiceNav';
import { startSim, stopSim } from '../lib/navSim';
import { directions, WALK, BIKE } from '../lib/routing';
import { arrivalLine, continuation, shortInstruction } from '../lib/navPhrasing';
import { collapseManeuvers } from '../lib/maneuvers';
import { openCitiBike } from '../lib/citibike';
import { fmtMiles } from '../lib/tripPlanner';
import { formatClock, distanceMeters } from '../lib/geo';
import { NAV } from '../lib/config';
import { useTheme, radius, shadow } from '../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Route-overview glyph (Apple-style): hollow start, curve, filled end.
function RouteIcon({ color, size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 6.5 C 12 7, 11 15, 16.5 16.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx="7" cy="6.5" r="2.7" stroke={color} strokeWidth={2} fill="none" />
      <Circle cx="16.7" cy="16.8" r="3" fill={color} />
    </Svg>
  );
}

const MAN = {
  'turn-left': 'turnLeft', 'turn-right': 'turnRight',
  'turn-slight-left': 'slightLeft', 'turn-slight-right': 'slightRight',
  'turn-sharp-left': 'turnLeft', 'turn-sharp-right': 'turnRight',
  'uturn-left': 'uturn', 'uturn-right': 'uturn',
  'roundabout-left': 'turnLeft', 'roundabout-right': 'turnRight',
  straight: 'straight', merge: 'straight',
  'ramp-left': 'slightLeft', 'ramp-right': 'slightRight',
  'fork-left': 'slightLeft', 'fork-right': 'slightRight',
  'keep-left': 'slightLeft', 'keep-right': 'slightRight',
};
function manIcon(step) {
  if (!step) return 'straight';
  if (step.maneuver && MAN[step.maneuver]) return MAN[step.maneuver];
  const t = (step.instruction || '').toLowerCase();
  if (t.includes('arriv') || t.includes('dock')) return 'arrive';
  if (t.includes('undock') || t.includes('riding')) return 'bike';
  if (t.includes('left')) return 'turnLeft';
  if (t.includes('right')) return 'turnRight';
  return 'straight';
}
// The "grab your bike" moment — when the current/next cue is to undock and ride.
// That's where we offer the sanctioned handoff to the official Citi Bike app.
function isUnlockStep(step) {
  return /undock|start riding/i.test(step?.instruction || '');
}
function fmtDist(m) {
  if (m == null || !isFinite(m)) return null;
  if (m < 400) return `${Math.max(10, Math.round((m * 3.281) / 10) * 10)} ft`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

const WIN_H = Dimensions.get('window').height;

function destName(dest) {
  return dest && !dest.current ? (dest.name || dest.label || 'your destination') : 'your destination';
}

// Icon + color per segment row, reusing the map's marker vocabulary.
const ROW = {
  walk: { icon: 'walk', color: '#fff' },
  ride: { icon: 'bike', color: 'good' },
  dock: { icon: 'dock', color: 'dock' },
  stop: { icon: 'pin', color: 'primary' },
  dest: { icon: 'pin', color: 'danger' },
};

// Condense the flat maneuver list into a high-level itinerary: one row per leg —
// Walk to your pickup station / Bike ride / Dock your bike / Walk to <dest> /
// Arrive. Each row carries the maneuver index range it spans so the live current
// step still highlights the right row. Turn-by-turn lives in the banner.
function buildSteps(maneuvers, dest, stations = {}) {
  const ms = maneuvers || [];
  const pickups = stations.pickups || []; // station names in order of use
  const docks = stations.docks || [];
  let pIdx = 0, dIdx = 0;
  const out = [];
  let mode = 'walk';
  let walk = null; // { fromIdx, toIdx, distance }
  let bike = null; // { fromIdx, toIdx, distance }
  const flushWalk = (label) => {
    if (walk) { out.push({ kind: 'walk', label, distance: walk.distance, fromIdx: walk.fromIdx, toIdx: walk.toIdx }); walk = null; }
  };
  const flushBike = () => {
    if (bike) { out.push({ kind: 'ride', label: 'Bike ride', distance: bike.distance, fromIdx: bike.fromIdx, toIdx: bike.toIdx }); bike = null; }
  };
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m.kind === 'pickup') {
      const pn = pickups[pIdx++];
      flushWalk(pn ? `Walk to ${pn}` : 'Walk to your pickup station');
      bike = { fromIdx: i, toIdx: i, distance: 0 }; // ride starts at the undock
      mode = 'bike';
    } else if (m.kind === 'dock') {
      const dn = docks[dIdx++];
      flushBike();
      out.push({ kind: 'dock', label: dn ? `Dock at ${dn}` : 'Dock your bike', fromIdx: i, toIdx: i });
      mode = 'walk';
    } else if (m.kind === 'stop') {
      flushWalk('Walk to your stop'); flushBike();
      out.push({ kind: 'stop', label: 'Stop', fromIdx: i, toIdx: i });
      mode = 'walk';
    } else if (m.kind === 'dest') {
      flushWalk(`Walk to ${destName(dest)}`); flushBike();
      out.push({ kind: 'dest', label: `Arrive at ${destName(dest)}`, fromIdx: i, toIdx: i });
    } else if (mode === 'bike') {
      if (!bike) bike = { fromIdx: i, toIdx: i, distance: 0 };
      bike.toIdx = i; bike.distance += (m.distance || 0);
    } else {
      if (!walk) walk = { fromIdx: i, toIdx: i, distance: 0 };
      walk.toIdx = i; walk.distance += (m.distance || 0);
    }
  }
  flushWalk(`Walk to ${destName(dest)}`); flushBike();
  return out;
}

// Rebuild the route for everything still ahead, starting from the rider's current
// position. We chain through the remaining leg boundaries (pickup/dock/stop/dest)
// the planner already chose, so the SAME stations are kept — only the path to them
// is recomputed. Profile per leg: heading to a dock = biking, everything else =
// walking. The waypoint boundary cues are re-emitted verbatim so arrival detection
// and the "undock/dock/arrived" lines stay intact.
async function rebuildFrom(here, waypoints) {
  const maneuvers = [];
  const coords = [];
  let anchor = [here.lon, here.lat]; // [lon, lat] for the routing API
  for (const wp of waypoints) {
    const profile = wp.kind === 'dock' ? BIKE : WALK;
    const target = [wp.location[1], wp.location[0]]; // location is [lat, lon]
    let leg = null;
    try { leg = await directions(profile, [anchor, target]); } catch {}
    if (leg) { maneuvers.push(...leg.maneuvers); coords.push(...leg.coords); }
    maneuvers.push({ instruction: wp.instruction, location: wp.location, distance: 0, kind: wp.kind });
    anchor = target;
  }
  // Same decision-point collapse as the initial route, so a reroute down a long
  // street doesn't re-announce "continue on X" at every step.
  return { maneuvers: collapseManeuvers(maneuvers), coords };
}

export default function NavScreen({ trip, onEnd }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { plan, route, dest } = trip;

  // The live route geometry can change mid-trip on a reroute, so hold it in state.
  const [coords, setCoords] = useState(route.coords);
  const [maneuvers, setManeuvers] = useState(route.maneuvers);
  const [cur, setCur] = useState(route.maneuvers?.[0] || null);
  const [next, setNext] = useState(route.maneuvers?.[1] || null);
  const [dist, setDist] = useState(null);
  const [here, setHere] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false); // banner expanded into full step list
  const [curIndex, setCurIndex] = useState(0);
  const [voiceOn, setVoiceOn] = useState(!nav.muted);
  // Undock CTA persistence: a sticky "at the pickup rack" flag so the unlock button
  // stays up while you're standing there undocking, and only clears once you've
  // ridden away — instead of vanishing the moment the pickup geofence trips.
  const [atRack, setAtRack] = useState(false);
  const pickupLocRef = useRef(null); // [lat,lon] of the pickup we're currently at
  const arrival = useRef(new Date(Date.now() + plan.totalSec * 1000)).current;
  const [minLeft, setMinLeft] = useState(Math.max(1, Math.round(plan.totalSec / 60)));
  const tick = useRef(null);

  useEffect(() => {
    nav.start({
      maneuvers: route.maneuvers,
      routeCoords: route.coords,
      intro: `Starting route to ${dest?.name || dest?.label || 'your destination'}.`,
      onProgress: ({ maneuver, next: nx, distance, index }) => {
        setCur(maneuver); setNext(nx); setDist(distance); if (typeof index === 'number') setCurIndex(index);
        // Remember which pickup we're heading to so the undock CTA can stick to it.
        const up = isUnlockStep(maneuver) ? maneuver : isUnlockStep(nx) ? nx : null;
        if (up && up.location) pickupLocRef.current = up.location;
      },
      onLocationUpdate: (h) => {
        setHere(h);
        const pl = pickupLocRef.current;
        if (pl) {
          const d = distanceMeters(h.lat, h.lon, pl[0], pl[1]);
          if (d <= NAV.arriveZoneM) setAtRack(true);            // at the rack — arm
          else if (d > NAV.undockClearM) { setAtRack(false); pickupLocRef.current = null; } // rode off — clear
        }
      },
      onReroute: async (h) => {
        try {
          const wps = nav.remainingWaypoints();
          if (!wps.length) { nav.cancelReroute(); return; }
          const r = await rebuildFrom(h, wps);
          if (!r.maneuvers.length || !r.coords.length) { nav.cancelReroute(); return; }
          setCoords(r.coords);
          setManeuvers(r.maneuvers);
          nav.replaceRoute(r.maneuvers, r.coords); // resumes guidance on the new path
        } catch { nav.cancelReroute(); }
      },
      onArrive: () => {
        setCur({ instruction: arrivalLine(dest && !dest.current ? (dest.name || dest.label) : null) }); setNext(null); setDist(null);
        // Let the spoken "You have arrived" land, then close the route itself.
        setTimeout(() => { onEnd && onEnd(); }, 4000);
      },
    });
    tick.current = setInterval(() => {
      setMinLeft(Math.max(0, Math.round((arrival.getTime() - Date.now()) / 60000)));
    }, 15000);
    return () => { clearInterval(tick.current); stopSim(); nav.stop(); };
  }, []);

  const toggle = (to) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setExpanded(to); };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -12) toggle(true);
        else if (g.dy > 12) toggle(false);
        else toggle((e) => !e);
      },
    })
  ).current;

  const setVoice = (v) => { setVoiceOn(v); nav.setMuted(!v); };

  // Navigation shows full detail: green bike pickups + red "P" docks (the
  // operational "how"), plus the numbered place stops and the destination pin.
  const markers = [];
  if (plan.segments) {
    plan.segments.forEach((seg) => {
      markers.push({ lat: seg.originStation.lat, lon: seg.originStation.lon, title: 'Pick up', color: c.good, kind: 'pickup' });
      markers.push({ lat: seg.destStation.lat, lon: seg.destStation.lon, title: 'Dock', color: c.dock, kind: 'dock' });
    });
    (plan.points || []).slice(1, -1).forEach((pt, i) => markers.push({ lat: pt.lat, lon: pt.lon, title: pt.name || 'Stop', color: c.primary, kind: 'stop', num: i + 1 }));
    if (dest) markers.push({ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.danger, kind: 'dest' });
  } else {
    markers.push(
      { lat: plan.originStation.lat, lon: plan.originStation.lon, title: 'Pick up', color: c.good, kind: 'pickup' },
      { lat: plan.destStation.lat, lon: plan.destStation.lon, title: 'Dock', color: c.dock, kind: 'dock' },
    );
    if (dest) markers.push({ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.danger, kind: 'dest' });
  }
  const distLabel = fmtDist(dist);
  const stationNames = useMemo(() => {
    const segs = plan.segments || [{ originStation: plan.originStation, destStation: plan.destStation }];
    return {
      pickups: segs.map((s) => s.originStation && s.originStation.name),
      docks: segs.map((s) => s.destStation && s.destStation.name),
    };
  }, [plan]);
  const steps = useMemo(() => buildSteps(maneuvers, dest, stationNames), [maneuvers, dest, stationNames]);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { nav.stop(); onEnd && onEnd(); }}>
      <View style={styles.root}>
        <RouteMap coords={coords} markers={markers} fill follow={overview ? null : here} overview={overview} showUser ink={c.nav} paper="#fff" />

        {/* Top maneuver banner — tap to expand into the full step list */}
        <View style={[styles.banner, { top: insets.top + 8 }]}>
          {stepsOpen ? (
            <>
              <TouchableOpacity onPress={() => setStepsOpen(false)} activeOpacity={0.8} style={styles.stepsGrip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Hide all steps">
                <View style={styles.stepsHandle} />
              </TouchableOpacity>
              <ScrollView style={{ maxHeight: Math.round(WIN_H * 0.6) }} showsVerticalScrollIndicator={false}>
                {steps.map((it, k) => {
                  const r = ROW[it.kind] || ROW.walk;
                  const color = r.color === '#fff' ? '#fff' : c[r.color];
                  const isCur = curIndex >= it.fromIdx && curIndex <= it.toIdx;
                  const isPast = curIndex > it.toIdx;
                  const dl = (it.kind === 'walk' || it.kind === 'ride') ? fmtDist(it.distance) : null;
                  return (
                    <View key={k} style={[styles.stepRow, isCur && styles.stepRowCur]}>
                      <Icon name={r.icon} size={20} color={color} />
                      <Text style={[styles.stepInstr, isPast && styles.stepPast]} numberOfLines={1}>{it.label}</Text>
                      {!!dl && <Text style={styles.stepDist}>{dl}</Text>}
                    </View>
                  );
                })}
              </ScrollView>
            </>
          ) : (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setStepsOpen(true)} accessibilityRole="button" accessibilityLabel="Show all steps">
              <View style={styles.bannerMain}>
                <Icon name={manIcon(cur)} size={30} color="#fff" weight="semibold" />
                <View style={styles.flex}>
                  {distLabel && <Text style={styles.bannerDist}>{distLabel}</Text>}
                  <Text style={styles.bannerTxt} numberOfLines={2}>{shortInstruction(cur?.instruction) || 'Starting…'}</Text>
                </View>
                <Icon name="forward" size={16} color="rgba(255,255,255,0.45)" />
              </View>
              {(isUnlockStep(cur) || isUnlockStep(next) || atRack) ? (
                <TouchableOpacity style={styles.unlockCue} onPress={openCitiBike} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open Citi Bike to unlock">
                  <Icon name="unlock" size={17} color="#fff" />
                  <Text style={styles.unlockCueTxt} numberOfLines={1}>Undock your bike — tap to open Citi Bike</Text>
                  <Icon name="forward" size={14} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              ) : next ? (
                <View style={styles.bannerNext}>
                  <Icon name={manIcon(next)} size={15} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.bannerNextTxt} numberOfLines={1}>Then {continuation(next.instruction)}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        </View>

        {/* Floating map controls */}
        {!stepsOpen && (
        <View style={styles.fab}>
          <TouchableOpacity style={styles.fabBtn} onPress={() => setOverview((o) => !o)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={overview ? 'Follow my location' : 'Show route overview'}>
            <RouteIcon color={overview ? c.primary : c.text} size={22} />
          </TouchableOpacity>
          <View style={styles.fabSep} />
          <TouchableOpacity style={styles.fabBtn} onPress={() => setVoice(!voiceOn)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={voiceOn ? 'Mute voice guidance' : 'Unmute voice guidance'}>
            <Icon name={voiceOn ? 'volumeOn' : 'volumeOff'} size={20} color={voiceOn ? c.primary : c.textMute} />
          </TouchableOpacity>
        </View>
        )}

        {/* Bottom swipe-up panel */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          <View {...pan.panHandlers} style={styles.grip}>
            <View style={styles.handle} />
            <View style={styles.stats}>
              <Stat big={formatClock(arrival)} label="arrival" styles={styles} />
              <Stat big={`${minLeft}`} label="min" styles={styles} />
              <Stat big={fmtMiles(plan.distanceM || 0)} label="" styles={styles} />
            </View>
          </View>

          {expanded && (
            <View style={styles.expand}>
              {(plan.points ? plan.points.slice(1) : [dest]).filter(Boolean).map((pt, i, arr) => {
                const isFinal = i === arr.length - 1;
                return (
                  <View key={i} style={styles.optRow}>
                    {isFinal
                      ? <Icon name="pin" size={18} color={c.danger} />
                      : <View style={styles.numSq}><Text style={styles.numTxt}>{i + 1}</Text></View>}
                    <View style={styles.flex}>
                      <Text style={styles.optName} numberOfLines={1}>{pt?.name || (isFinal ? 'Destination' : 'Stop')}</Text>
                      {!!pt?.address && <Text style={styles.optSub} numberOfLines={1}>{pt.address}</Text>}
                    </View>
                    <Text style={styles.optTag}>{isFinal ? 'Destination' : 'Stop'}</Text>
                  </View>
                );
              })}
              <View style={styles.optRow}>
                <Icon name={voiceOn ? 'volumeOn' : 'volumeOff'} size={18} color={c.textMute} />
                <Text style={styles.optTxt}>Voice guidance</Text>
                <Switch value={voiceOn} onValueChange={setVoice} trackColor={{ true: c.primary }} />
              </View>
              {__DEV__ && (
                <View style={styles.simRow}>
                  <TouchableOpacity style={styles.simBtn} onPress={() => startSim(coords, { scenario: 'clean' })} activeOpacity={0.85}>
                    <Text style={styles.simTxt}>▶ Sim ride</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.simBtn} onPress={() => startSim(coords, { scenario: 'detour' })} activeOpacity={0.85}>
                    <Text style={styles.simTxt}>↪ Sim detour</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.simBtn} onPress={() => stopSim()} activeOpacity={0.85}>
                    <Text style={styles.simTxt}>■ Stop</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={styles.end} onPress={() => { stopSim(); nav.stop(); onEnd && onEnd(); }} activeOpacity={0.9}>
                <Text style={styles.endTxt}>End Route</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Stat({ big, label, styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statBig}>{big}</Text>
      {!!label && <Text style={styles.statLabel}>{label}</Text>}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    banner: {
      position: 'absolute', left: 12, right: 12,
      backgroundColor: '#1B2230', borderRadius: radius.lg, padding: 14, ...shadow(c).pop,
    },
    bannerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bannerDist: { color: '#fff', fontSize: 13, fontWeight: '700', opacity: 0.7, marginBottom: 1, fontVariant: ['tabular-nums'] },
    bannerTxt: { color: '#fff', fontSize: 20, fontWeight: '800' },
    bannerNext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
    bannerNextTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500', flex: 1 },
    unlockCue: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, padding: 10, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.12)' },
    unlockCueTxt: { color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 },

    // Expanded step list (banner tapped open)
    stepsGrip: { alignItems: 'center', paddingBottom: 8 },
    stepsHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
    stepRowCur: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, borderTopWidth: 0 },
    stepInstr: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '500' },
    stepPast: { color: 'rgba(255,255,255,0.45)' },
    stepDist: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },

    fab: { position: 'absolute', right: 14, top: '42%', backgroundColor: c.elevated, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden', ...shadow(c).card },
    fabBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
    fabSep: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },

    bottom: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow(c).pop,
    },
    grip: { paddingTop: 8, paddingHorizontal: 20 },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 12 },
    stats: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
    stat: { alignItems: 'center' },
    statBig: { fontSize: 22, fontWeight: '800', color: c.text, fontVariant: ['tabular-nums'] },
    statLabel: { fontSize: 12, color: c.textMute, fontWeight: '500', marginTop: 1 },

    expand: { paddingHorizontal: 20, paddingTop: 6, gap: 4 },
    numSq: { minWidth: 22, height: 22, paddingHorizontal: 4, borderRadius: 6, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    numTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
    optTxt: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
    optName: { fontSize: 15, color: c.text, fontWeight: '600' },
    optSub: { fontSize: 12.5, color: c.textMute, fontWeight: '400', marginTop: 2 },
    optTag: { fontSize: 11, color: c.textMute, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
    simRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    simBtn: { flex: 1, backgroundColor: c.surface, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    simTxt: { color: c.text, fontSize: 13, fontWeight: '700' },
    end: { backgroundColor: c.danger, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    endTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  });
}
