import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from './Logo';
import Icon from './Icon';
import { useTheme, radius, shadow } from '../lib/theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/config';

// One-screen welcome + permission primer. Shown once on first launch (gated by
// the onboarded flag). It explains the value and what the map colors mean BEFORE
// the OS location prompt fires, so the system dialog has context — which lifts
// grant rates. "Get started" is what actually triggers the location request.
export default function FirstRun({ visible, onDone }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);

  const features = [
    { icon: 'navigate', title: 'Live bikes & docks', sub: 'Real-time availability near you.' },
    { icon: 'bike', title: 'Plan a trip', sub: 'Door-to-door routing with voice navigation.' },
  ];
  const legend = [
    { color: c.good, label: 'Available' },
    { color: c.low, label: 'Limited' },
    { color: c.none, label: 'Empty' },
  ];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Logo size={56} />
            <View style={styles.titleRow}>
              <Text style={styles.title}>Welcome to Pedl</Text>
              <View style={styles.betaTag}><Text style={styles.betaTxt}>BETA</Text></View>
            </View>
            <Text style={styles.tagline}>Smarter city bike share</Text>
          </View>

          {features.map((f) => (
            <View key={f.title} style={styles.row}>
              <View style={styles.iconWrap}><Icon name={f.icon} size={20} color={c.primary} /></View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{f.title}</Text>
                <Text style={styles.rowSub}>{f.sub}</Text>
              </View>
            </View>
          ))}

          <View style={styles.legendCard}>
            <Text style={styles.legendHead}>Station status</Text>
            <View style={styles.legendRow}>
              {legend.map((l) => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={styles.legendTxt}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.rationale}>
            Pedl uses your location to show nearby stations and guide you while riding.
          </Text>
          <View style={styles.legalRow}>
            <Text
              style={styles.legalLink}
              onPress={() => { if (PRIVACY_URL) Linking.openURL(PRIVACY_URL).catch(() => {}); }}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            {!!TERMS_URL && <Text style={styles.legalDot}>·</Text>}
            {!!TERMS_URL && (
              <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} accessibilityRole="link">
                Terms
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.cta}
            onPress={onDone}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Get started and enable location"
          >
            <Text style={styles.ctaTxt}>Get started</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 24 },
    scroll: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingVertical: 12 },
    flex: { flex: 1 },
    header: { alignItems: 'center', gap: 8, marginBottom: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    title: { fontSize: 26, fontWeight: '800', color: c.text },
    betaTag: { backgroundColor: c.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    betaTxt: { color: c.onPrimary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    tagline: { fontSize: 15, color: c.textMute, fontWeight: '500', textAlign: 'center' },

    row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14 },
    iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    rowSub: { fontSize: 13.5, color: c.textMute, fontWeight: '400', marginTop: 2, lineHeight: 19 },

    legendCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 10 },
    legendHead: { fontSize: 13, fontWeight: '700', color: c.textMute, textTransform: 'uppercase', letterSpacing: 0.5 },
    legendRow: { flexDirection: 'row', justifyContent: 'space-between' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    legendDot: { width: 13, height: 13, borderRadius: 7 },
    legendTxt: { fontSize: 13.5, color: c.text, fontWeight: '500' },

    footer: { gap: 10 },
    rationale: { fontSize: 12.5, color: c.textFaint, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
    legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    legalLink: { fontSize: 12.5, color: c.textMute, fontWeight: '600', textDecorationLine: 'underline' },
    legalDot: { fontSize: 12.5, color: c.textFaint },
    cta: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', ...shadow(c).card },
    ctaTxt: { color: c.onPrimary, fontSize: 17, fontWeight: '800' },
  });
}
