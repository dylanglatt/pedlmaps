import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, Switch,
  PanResponder, LayoutAnimation, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import RouteMap from './RouteMap';
import { nav } from '../lib/voiceNav';
import { fmtMiles } from '../lib/tripPlanner';
import { formatClock } from '../lib/geo';
import { useTheme, radius, font, shadow } from '../lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Apple-style route-overview glyph: hollow start, curve, filled end.
function RouteIcon({ color, size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 6.5 C 12 7, 11 15, 16.5 16.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx="7" cy="6.5" r="2.7" stroke={color} strokeWidth={2} fill="none" />
      <Circle cx="16.7" cy="16.8" r="3" fill={color} />
    </Svg>
  );
}

function arrowFor(text = '') {
  const t = text.toLowerCase();
  if (t.includes('left')) return 'arrow-back';
  if (t.includes('right')) return 'arrow-forward';
  if (t.includes('arriv') || t.includes('dock')) return 'flag';
  if (t.includes('undock') || t.includes('riding')) return 'bicycle';
  return 'arrow-up';
}

export default function NavScreen({ trip, onEnd }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { plan, route, dest } = trip;

  const [cur, setCur] = useState(route.maneuvers?.[0] || null);
  const [next, setNext] = useState(route.maneuvers?.[1] || null);
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
      onProgress: ({ maneuver, next: nx }) => { setCur(maneuver); setNext(nx); },
      onLocationUpdate: (h) => setHere(h),
      onArrive: () => { setCur({ instruction: 'You have arrived.' }); setNext(null); },
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

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { nav.stop(); onEnd && onEnd(); }}>
      <View style={styles.root}>
        <RouteMap coords={route.coords} markers={markers} fill follow={overview ? null : here} overview={overview} showUser />

        {/* Top maneuver banner */}
        <View style={styles.banner}>
          <View style={styles.bannerMain}>
            <Ionicons name={arrowFor(cur?.instruction)} size={30} color="#fff" />
            <Text style={styles.bannerTxt} numberOfLines={2}>{cur?.instruction || 'Starting…'}</Text>
          </View>
          {next && (
            <View style={styles.bannerNext}>
              <Ionicons name={arrowFor(next.instruction)} size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.bannerNextTxt} numberOfLines={1}>Then {next.instruction}</Text>
            </View>
          )}
        </View>

        {/* Floating map controls (grouped, Apple-style) */}
        <View style={styles.fab}>
          <TouchableOpacity style={styles.fabBtn} onPress={() => setOverview((o) => !o)} activeOpacity={0.7}>
            <RouteIcon color={overview ? c.primary : c.text} size={22} />
          </TouchableOpacity>
          <View style={styles.fabSep} />
          <TouchableOpacity style={styles.fabBtn} onPress={() => setVoice(!voiceOn)} activeOpacity={0.7}>
            <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={20} color={voiceOn ? c.primary : c.textMute} />
          </TouchableOpacity>
        </View>

        {/* Bottom swipe-up panel */}
        <View style={styles.bottom}>
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
                <Ionicons name="star" size={18} color={c.primary} />
                <Text style={styles.optTxt} numberOfLines={1}>{dest?.name || dest?.label || 'Destination'}</Text>
              </View>
              <View style={styles.optRow}>
                <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={18} color={c.textMute} />
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
    banner: {
      position: 'absolute', top: Platform.OS === 'ios' ? 56 : 20, left: 12, right: 12,
      backgroundColor: '#1B2230', borderRadius: radius.lg, padding: 14, ...shadow(c).pop,
    },
    bannerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bannerTxt: { flex: 1, color: '#fff', fontSize: 20, fontFamily: font.bold },
    bannerNext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
    bannerNextTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: font.medium, flex: 1 },

    fab: { position: 'absolute', right: 14, top: '42%', backgroundColor: c.elevated, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: 'hidden', ...shadow(c).card },
    fabBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
    fabSep: { height: StyleSheet.hairlineWidth, backgroundColor: c.border },

    bottom: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      paddingBottom: Platform.OS === 'ios' ? 34 : 18, ...shadow(c).pop,
    },
    grip: { paddingTop: 8, paddingHorizontal: 20 },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 12 },
    stats: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8 },
    stat: { alignItems: 'center' },
    statBig: { fontSize: 22, fontFamily: font.display, color: c.text },
    statLabel: { fontSize: 12, color: c.textMute, fontFamily: font.medium, marginTop: 1 },

    expand: { paddingHorizontal: 20, paddingTop: 6, gap: 4 },
    optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8 },
    optTxt: { flex: 1, fontSize: 15, color: c.text, fontFamily: font.semibold },
    end: { backgroundColor: c.danger, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
    endTxt: { color: '#fff', fontSize: 17, fontFamily: font.bold },
  });
}
