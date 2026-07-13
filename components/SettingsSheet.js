import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useTheme, radius, shadow } from '../lib/theme';

// Minimal settings sheet — the permanent home for rider preferences that don't
// belong in the busy Nearby header. Today it's just the unlock choice; add future
// rows here. Bottom-sheet Modal styled to match the feedback sheet.
//
// The "Unlock with" row is only meaningful on a Lyft-run network (one with a
// `lyftLink`), where both the operator app AND Lyft unlock the same bikes — it maps
// the choice to the `preferLyft` boolean. On any other system there's no second app
// to offer, so we hide the toggle. See docs/unlock-plan.md.
export default function SettingsSheet({ visible, system, preferLyft, onChangePreferLyft, onClose }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);
  const operatorName = system?.name || 'Operator app';
  const hasLyft = !!system?.lyftLink;
  // Options render operator-first; each maps to a preferLyft value.
  const options = [
    { key: 'operator', label: operatorName, prefer: false },
    { key: 'lyft', label: 'Lyft', prefer: true },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.flexTap} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={c.textMute} /></TouchableOpacity>
          </View>

          <Text style={styles.rowLabel}>Unlock with</Text>
          {hasLyft ? (
            <>
              <Text style={styles.rowHint}>{`Both ${operatorName} and Lyft unlock these bikes — pick whichever you have signed in.`}</Text>
              <View style={styles.seg}>
                {options.map((opt) => {
                  const on = !!preferLyft === opt.prefer;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.segItem, on && styles.segItemOn]}
                      onPress={() => onChangePreferLyft(opt.prefer)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Unlock with ${opt.label}`}
                    >
                      <Text style={[styles.segTxt, on && styles.segTxtOn]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.rowHint}>{`Opens ${operatorName} to unlock a bike.`}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    flexTap: { flex: 1 },
    sheet: { backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 20, paddingTop: 8, ...shadow(c).pop },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 14 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    rowLabel: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 4 },
    rowHint: { fontSize: 13, color: c.textMute, marginBottom: 12, lineHeight: 18 },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 },
    segItem: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 14, color: c.textMute, fontWeight: '600' },
    segTxtOn: { color: c.text },
  });
}
