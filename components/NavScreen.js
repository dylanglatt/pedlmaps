import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RouteMap from './RouteMap';
import { nav } from '../lib/voiceNav';
import { fmtMiles } from '../lib/tripPlanner';
import { formatClock } from '../lib/geo';
import { useTheme, radius, font, shadow } from '../lib/theme';

function arrowFor(text = '') {
  const t = text.toLowerCase();
  if (t.includes('left')) return 'arrow-back';
  if (t.includes('right')) return 'arrow-forward';
  if (t.includes('arriv')) return 'flag';
  if (t.includes('dock')) return 'flag';
  if (t.includes('undock') || t.includes('riding')) return 'bicycle';
  return 'arrow-up';
}

// Full-screen turn-by-turn, Apple Maps-style.
export default function NavScreen({ trip, onEnd }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { plan, route, dest } = trip;

  const [cur, setCur] = useState(route.maneuvers?.[0] || null);
  const [next, setNext] = useState(route.maneuvers?.[1] || null);
  const [here, setHere] = useState(null);
  const arrival = useRef(new Date(Date.now() + plan.totalSec * 1000)).current;
  const [minLeft, setMinLeft] = useState(Math.max(1, Math.round(plan.totalSec / 60)));
  const tick = useRef(null);

  useEffect(() => {
    nav.start({
      maneuvers: route.maneuvers,
      routeCoords: route.coords,
      onProgress: ({ maneuver, next: nx }) => { setCur(maneuver); setNext(nx); },
      onLocationUpdate: (h) => setHere(h),
      onArrive: () => { setCur({ instruction: 'You have arrived.' }); setNext(null); },
    });
    tick.current = setInterval(() => {
      setMinLeft(Math.max(0, Math.round((arrival.getTime() - Date.now()) / 60000)));
    }, 15000);
    return () => { clearInterval(tick.current); nav.stop(); };
  }, []);

  const markers = [
    { lat: plan.originStation.lat, lon: plan.originStation.lon, title: 'Pick up', color: c.good },
    { lat: plan.destStation.lat, lon: plan.destStation.lon, title: 'Dock', color: c.danger },
    ...(dest ? [{ lat: dest.lat, lon: dest.lon, title: 'Destination', color: c.primary }] : []),
  ];

  return (
    <View style={styles.root}>
      <RouteMap coords={route.coords} markers={markers} fill follow={here} showUser />

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

      {/* Bottom ETA bar */}
      <View style={styles.bottom}>
        <View style={styles.stats}>
          <Stat big={formatClock(arrival)} label="arrival" styles={styles} />
          <Stat big={`${minLeft}`} label="min" styles={styles} />
          <Stat big={fmtMiles(plan.distanceM || 0)} label="" styles={styles} />
        </View>
        <TouchableOpacity style={styles.end} onPress={() => { nav.stop(); onEnd && onEnd(); }} activeOpacity={0.9}>
          <Text style={styles.endTxt}>End Route</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    root: { ...StyleSheet.absoluteFillObject, backgroundColor: c.bg, zIndex: 2000 },
    banner: {
      position: 'absolute', top: Platform.OS === 'ios' ? 56 : 20, left: 12, right: 12,
      backgroundColor: '#1B2230', borderRadius: radius.lg, padding: 14, ...shadow(c).pop,
    },
    bannerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    bannerTxt: { flex: 1, color: '#fff', fontSize: 20, fontFamily: font.bold },
    bannerNext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
    bannerNextTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontFamily: font.medium, flex: 1 },

    bottom: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      paddingTop: 16, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 18, ...shadow(c).pop,
    },
    stats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
    stat: { alignItems: 'center' },
    statBig: { fontSize: 22, fontFamily: font.display, color: c.text },
    statLabel: { fontSize: 12, color: c.textMute, fontFamily: font.medium, marginTop: 1 },
    end: { backgroundColor: c.danger, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
    endTxt: { color: '#fff', fontSize: 17, fontFamily: font.bold },
  });
}
