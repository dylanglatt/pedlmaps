import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { availabilityLevel, COLORS, COLOR_BG } from '../lib/gbfs';
import { formatDistance, formatAge } from '../lib/geo';
import { colors, radius } from '../lib/theme';

export default function StationList({ stations, mode, onSelect, saved, onToggleSave }) {
  const renderItem = ({ item: s }) => {
    const level = availabilityLevel(s, mode);
    const count = mode === 'dock' ? s.docks : s.bikes;
    const isHome = saved?.homeId === s.id;
    const isWork = saved?.workId === s.id;
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onSelect && onSelect(s)}>
        {/* Availability badge */}
        <View style={[styles.badge, { backgroundColor: COLOR_BG[level] }]}>
          <Text style={[styles.badgeNum, { color: COLORS[level] }]}>{count}</Text>
          <Text style={[styles.badgeLabel, { color: COLORS[level] }]}>{mode === 'dock' ? 'docks' : 'bikes'}</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            {isHome && <Ionicons name="home" size={13} color={colors.primary} style={styles.nameIcon} />}
            {isWork && <Ionicons name="briefcase" size={13} color={colors.primary} style={styles.nameIcon} />}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {formatDistance(s.distance)} · {s.classic} reg · {s.ebikes} elec · {s.docks} docks
            {s.disabledBikes ? ` · ${s.disabledBikes} down` : ''}
          </Text>
          <Text style={styles.age}>updated {formatAge(s.lastReported)}</Text>
        </View>

        {/* Save toggles */}
        {onToggleSave && (
          <View style={styles.saveCol}>
            <TouchableOpacity
              onPress={() => onToggleSave('home', s.id)}
              style={[styles.saveBtn, isHome && styles.saveBtnOn]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isHome ? 'home' : 'home-outline'}
                size={17}
                color={isHome ? colors.onPrimary : colors.textMute}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onToggleSave('work', s.id)}
              style={[styles.saveBtn, isWork && styles.saveBtnOn]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isWork ? 'briefcase' : 'briefcase-outline'}
                size={17}
                color={isWork ? colors.onPrimary : colors.textMute}
              />
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
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      contentContainerStyle={{ paddingVertical: 6, paddingBottom: 28 }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  badge: {
    width: 52, height: 52, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  badgeNum: { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  badgeLabel: { fontSize: 10, fontWeight: '600', marginTop: -1 },
  body: { flex: 1, paddingRight: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameIcon: { marginLeft: 6 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  meta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  age: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
  saveCol: { flexDirection: 'row', gap: 4 },
  saveBtn: {
    width: 34, height: 34, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  saveBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  saveTxt: { fontSize: 15, opacity: 0.5 },
  saveTxtOn: { opacity: 1 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 78 },
});
