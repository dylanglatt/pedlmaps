import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Icon from './Icon';
import { availabilityLevel, countFor } from '../lib/gbfs';
import { walkMinutes } from '../lib/geo';
import { useTheme, levelColor, radius, font } from '../lib/theme';

let Haptics = null;
try { Haptics = require('expo-haptics'); } catch {}
const tap = () => { if (Haptics && Platform.OS !== 'web') Haptics.selectionAsync(); };

const BADGE_LABEL = { dock: 'docks', electric: 'e-bikes', classic: 'manual', both: 'bikes' };

export default function StationList({ stations, mode, bikeType = 'both', units = 'imperial', onSelect, onOpenChart, scroll = true, header = null }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const renderItem = ({ item: s }) => {
    const level = availabilityLevel(s, mode, bikeType);
    const lc = levelColor(c, level);
    const count = countFor(s, mode, bikeType);
    const badgeLabel = mode === 'dock' ? 'docks' : BADGE_LABEL[bikeType];
    // Secondary breakdown only adds information in "Any" mode (it splits the badge's
    // total into e-bikes vs classic). With a single bike filter — or in the Docks
    // tab — the badge already shows the one relevant number, so we don't repeat it,
    // and we never cross-show docks in the Bikes tab or bikes in the Docks tab.
    const inv = (mode === 'bike' && bikeType === 'both')
      ? [
          { key: 'electric', label: 'e-bikes', n: s.ebikes, color: c.ebike },
          { key: 'classic', label: 'classic', n: s.classic, color: c.classic },
        ]
      : [];
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onSelect && onSelect(s)}>
        <View style={[styles.badge, { backgroundColor: lc.bg }]}>
          <Text style={[styles.badgeNum, { color: lc.fg }]}>{count}</Text>
          <Text style={[styles.badgeLabel, { color: lc.fg }]}>{badgeLabel}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.walk} numberOfLines={1}> · {walkMinutes(s.distance)} min walk</Text>
          </View>
          {inv.length > 0 && (
            <View style={styles.inv}>
              {inv.map((it) => (
                <View key={it.key} style={styles.invItem}>
                  <Text style={[styles.invNum, { color: it.color }]}>{it.n}</Text>
                  <Text style={styles.invLabel}>{it.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {onOpenChart && (
          <TouchableOpacity onPress={() => { tap(); onOpenChart(s); }} style={styles.chartBtn} activeOpacity={0.7} hitSlop={6}>
            <Icon name="chart" size={18} color={c.textMute} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={stations}
      keyExtractor={(s) => s.id}
      renderItem={renderItem}
      scrollEnabled={scroll}
      bounces={false}
      overScrollMode="never"
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      ListFooterComponent={<View style={styles.listEnd} />}
      contentContainerStyle={{ paddingTop: 4 }}
    />
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16 },
    badge: { width: 50, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    badgeNum: { fontSize: 19, fontWeight: '800', lineHeight: 22, fontVariant: ['tabular-nums'] },
    badgeLabel: { fontSize: 10, fontWeight: '600', marginTop: -1 },
    body: { flex: 1, paddingRight: 10, gap: 5 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    nameIcon: { marginLeft: 6 },
    name: { fontSize: 15, fontWeight: '600', color: c.text, flexShrink: 1 },
    walk: { fontSize: 12, color: c.textMute, fontWeight: '500', flexShrink: 0 },
    inv: { flexDirection: 'row', gap: 14, marginTop: 1 },
    invItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    invNum: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    invLabel: { fontSize: 11.5, color: c.textFaint, fontWeight: '500' },
    chartBtn: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    sep: { height: 1, backgroundColor: c.hairline, marginLeft: 78 },
    listEnd: { height: 16 },
  });
}
