import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Icon from './Icon';
import { availabilityLevel, countFor } from '../lib/gbfs';
import { formatDistance, formatAge, walkMinutes } from '../lib/geo';
import { useTheme, levelColor, radius, font } from '../lib/theme';
import OccupancyBar from './OccupancyBar';

let Haptics = null;
try { Haptics = require('expo-haptics'); } catch {}
const tap = () => { if (Haptics && Platform.OS !== 'web') Haptics.selectionAsync(); };

const BADGE_LABEL = { dock: 'docks', electric: 'e-bikes', classic: 'manual', both: 'bikes' };

export default function StationList({ stations, mode, bikeType = 'both', units = 'imperial', onSelect, saved, onToggleSave, scroll = true, header = null }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const renderItem = ({ item: s }) => {
    const level = availabilityLevel(s, mode, bikeType);
    const lc = levelColor(c, level);
    const count = countFor(s, mode, bikeType);
    const badgeLabel = mode === 'dock' ? 'docks' : BADGE_LABEL[bikeType];
    const places = Array.isArray(saved) ? saved : [];
    const isHome = places.some((p) => p.type === 'home' && p.stationId === s.id);
    const isWork = places.some((p) => p.type === 'work' && p.stationId === s.id);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onSelect && onSelect(s)}>
        <View style={[styles.badge, { backgroundColor: lc.bg }]}>
          <Text style={[styles.badgeNum, { color: lc.fg }]}>{count}</Text>
          <Text style={[styles.badgeLabel, { color: lc.fg }]}>{badgeLabel}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            {isHome && <Icon name="home" size={12} color={c.primary} style={styles.nameIcon} />}
            {isWork && <Icon name="work" size={12} color={c.primary} style={styles.nameIcon} />}
          </View>
          <OccupancyBar classic={s.classic} ebikes={s.ebikes} docks={s.docks} c={c} />
          <Text style={styles.meta} numberOfLines={1}>
            {s.distance >= 30 ? `${formatDistance(s.distance, units)} · ` : ''}{walkMinutes(s.distance)} min walk · {formatAge(s.lastReported)}
          </Text>
          <View style={styles.inv}>
            {[
              { label: 'e-bikes', n: s.ebikes, color: c.ebike },
              { label: 'classic', n: s.classic, color: c.classic },
              { label: 'docks', n: s.docks, color: c.textMute },
            ].map((it) => (
              <View key={it.label} style={styles.invItem}>
                <Text style={[styles.invNum, { color: it.color }]}>{it.n}</Text>
                <Text style={styles.invLabel}>{it.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {onToggleSave && (
          <View style={styles.saveCol}>
            <TouchableOpacity onPress={() => { tap(); onToggleSave('home', s); }} style={[styles.saveBtn, isHome && styles.saveBtnOn]} activeOpacity={0.7}>
              <Icon name="home" size={16} color={isHome ? c.onPrimary : c.textMute} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { tap(); onToggleSave('work', s); }} style={[styles.saveBtn, isWork && styles.saveBtnOn]} activeOpacity={0.7}>
              <Icon name="work" size={16} color={isWork ? c.onPrimary : c.textMute} />
            </TouchableOpacity>
          </View>
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
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={{ paddingVertical: 4, paddingBottom: 28 }}
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
    meta: { fontSize: 11.5, color: c.textMute, fontWeight: '500' },
    inv: { flexDirection: 'row', gap: 14, marginTop: 1 },
    invItem: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
    invNum: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
    invLabel: { fontSize: 11.5, color: c.textFaint, fontWeight: '500' },
    saveCol: { flexDirection: 'row', gap: 4 },
    saveBtn: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    saveBtnOn: { backgroundColor: c.primary, borderColor: c.primary },
    sep: { height: 1, backgroundColor: c.hairline, marginLeft: 78 },
  });
}
