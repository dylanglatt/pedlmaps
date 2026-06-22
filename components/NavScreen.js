import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Switch,
  PanResponder, LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Icon from './Icon';
import RouteMap from './RouteMap';
import { nav } from '../lib/voiceNav';
import { fmtMiles } from '../lib/tripPlanner';
import { formatClock } from '../lib/geo';
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
function fmtDist(m) {
  if (m == null || !isFinite(m)) return null;
  if (m < 400) return `${Math.max(10, Math.round((m * 3.281) / 10) * 10)} ft`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

export default function NavScreen({ trip, onEnd }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { plan, route, dest } = trip;

  const [cur, setCur] = useState(route.maneuvers?.[0] || null);
  const [next, setNext] = useState(route.maneuvers?.[1] || null);
  const [dist, setDist] = useState(null);
  const [here, setHere] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [overview, setOverview] = useState(false);
  const [voiceOn, setVoiceOn] = useState(!nav.muted);
  const arrival = useRef(new Date(Date.now() + plan.totalSec * 1000)).current;
  const [minLeft, setMinLeft] = useState(Math.max(1, Math.round(plan.totalSec / 60)));
  const tick = useRef(null);

  useEffect(() => {
    nav.start({
      maneuvers: route.maneuvers,
      routeCoords: route.coords,
      intro: `Starting route to ${dest?.name || dest?.label || 'your destination'}.`,
      onProgress: ({ maneuver, next: nx, distance }) => { setCur(maneuver); setNext(nx); setDist(distance); },
      onLocationUpdate: (h) => setHere(h),
      onArrive: () => { setCur({ instruction: 'You have arrived.' }); setNext(null); setDist(null); },
    });
    tick.current = setInterval(() => {
      setMinLeft(Math.max(0, Math.round((arrival.getTime() - Date.now()) / 60000)));
    }, 15000);
    return () => { clearInterval(tick.current); nav.stop(); };
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

  const markers = [
    { lat: plan.originStation.lat, lon: plan.originStation.lon, title: 'Pick up', color: c.good },
    { lat: plan.destStation.lat, lon: plan.destStation.lon, title: 'Dock', color: c.danger },
    ...(dest ? [{ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.primary }] : []),
  ];
  const distLabel = fmtDist(dist);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { nav.stop(); onEnd && onEnd(); }}>
      <View style={styles.root}>
        <RouteMap coords={route.coords} markers={markers} fill follow={overview ? null : here} overview={overview} showUser />

        {/* Top maneuver banner */}
        <View style={[styles.banner, { top: insets.top + 8 }]}>
          <View style={styles.bannerMain}>
            <Icon name={manIcon(cur)} size={30} color="#fff" weight="semibold" />
            <View style={styles.flex}>
              {distLabel && <Text style={styles.bannerDist}>{distLabel}</Text>}
              <Text style={styles.bannerTxt} numberOfLines={2}>{cur?.instruction || 'Starting…'}</Text>
            </View>
          </View>
          {next && (
            <View style={styles.bannerNext}>
              <Icon name={manIcon(next)} size={15} color="rgba(255,255,255,0.7)" />
              <Text style={styles.bannerNextTxt} numberOfLines={1}>Then {next.instruction}</Text>
            </View>
          )}
        </View>

        {/* Floating map controls */}
        <View style={styles.fab}>
          <TouchableOpacity style={styles.fabBtn} onPress={() => setOverview((o) => !o)} activeOpacity={0.7}>
            <RouteIcon color={overview ? c.primary : c.text} size={22} />
          </TouchableOpacity>
          <View style={styles.fabSep} />
          <TouchableOpacity style={styles.fabBtn} onPress={() => setVoice(!voiceOn)} activeOpacity={0.7}>
            <Icon name={voiceOn ? 'volumeOn' : 'volumeOff'} size={20} color={voiceOn ? c.primary : c.textMute} />
          </TouchableOpacity>
        </View>

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
              <View style={styles.optRow}>
                <Icon name="star" size={18} color={c.primary} />
                <Text style={styles.optTxt} numberOfLines={1}>{dest?.name || dest?.label || 'Destination'}</Text>
              </View>
              <View style={styles.optRow}>
                <Icon name={voiceOn ? 'volumeOn' : 'volumeOff'} size={18} color={c.textMute} />
                <Text style={styles.optTxt}>Voice guidance</Text>
                <Switch value={voiceOn} onValueChange={setVoice} trackColor={{ true: c.primary }} />
              </View>
              <TouchableOpacity style={styles.end} onPress={() => { nav.stop(); onEnd && onEnd(); }} activeOpacity={0.9}>
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
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
    optTxt: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
    end: { backgroundColor: c.danger, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    endTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  });
}
