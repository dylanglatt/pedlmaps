import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from 'react-native';
import Icon from './Icon';
import { useTheme, radius, shadow } from '../lib/theme';
import {
  splitPattern, docksPattern, patternCaption, isLowConfidence,
} from '../lib/predictions';
import { openCitiBike } from '../lib/citibike';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOUR_TICKS = [6, 9, 12, 15, 18, 21]; // labeled hours
const tickLabel = (h) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`);
const hourLabel = (h) => (h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

const STAR = '#E5A100'; // gold for a favorited station (distinct from the brand)

// Typical-availability popup for one station (Google "popular times" style).
export default function StationSheet({ station, initialMode = 'bike', isFav = false, onToggleFav, onClose }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const now = new Date();
  const today = now.getDay();
  const hourNow = now.getHours();

  const [mode, setMode] = useState(initialMode);
  const [day, setDay] = useState(today);
  const [hour, setHour] = useState(hourNow);

  if (!station) return null;
  const sn = station.shortName;
  const split = splitPattern(sn, day);                       // { e, c } electric/manual fullness, or null
  const docks = mode === 'dock' ? docksPattern(sn, day) : null;
  const hasData = !!split;
  const isToday = day === today;
  const valueAt = (h) => (mode === 'dock' ? (docks ? docks[h] : 0) : split ? split.e[h] + split.c[h] : 0);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={2}>{station.name}</Text>
              <View style={styles.nowRow}>
                <View style={[styles.dot, { backgroundColor: c.good }]} />
                <Text style={styles.nowTxt}>Now: {station.bikes} bikes · {station.docks} open docks</Text>
              </View>
            </View>
            <View style={styles.headBtns}>
              {onToggleFav && (
                <TouchableOpacity onPress={() => onToggleFav(station)} hitSlop={8} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={isFav ? 'Remove from favorites' : 'Add to favorites'}>
                  <Icon name="star" size={16} color={isFav ? STAR : c.textMute} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <Icon name="close" size={18} color={c.textMute} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Controls: bikes/docks + day */}
          <View style={styles.controls}>
            <View style={styles.seg}>
              {[{ k: 'bike', label: 'Bikes' }, { k: 'dock', label: 'Docks' }].map((o) => (
                <TouchableOpacity key={o.k} style={[styles.segItem, mode === o.k && styles.segItemOn]} onPress={() => setMode(o.k)} activeOpacity={0.85}>
                  <Text style={[styles.segTxt, mode === o.k && styles.segTxtOn]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.dayRow}>
            {DAY_LETTERS.map((d, i) => (
              <TouchableOpacity key={i} style={[styles.dayPill, day === i && styles.dayPillOn]} onPress={() => { setDay(i); if (i !== today) setHour(12); else setHour(hourNow); }} activeOpacity={0.8}>
                <Text style={[styles.dayTxt, day === i && styles.dayTxtOn]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {hasData ? (
            <>
              <Text style={styles.caption}>
                <Text style={styles.captionHour}>{hourLabel(hour)}</Text>
                <Text style={styles.captionRest}>  ·  {patternCaption(valueAt(hour), mode)}</Text>
              </Text>

              {/* Bars: bikes mode stacks electric + manual; docks mode is a single series */}
              <View style={styles.chart}>
                {Array.from({ length: 24 }).map((_, h) => {
                  const total = mode === 'dock' ? docks[h] : split.e[h] + split.c[h];
                  const isNow = isToday && h === hourNow;
                  const isSel = h === hour;
                  return (
                    <TouchableOpacity key={h} style={styles.barCol} activeOpacity={0.6} onPress={() => setHour(h)}>
                      <View style={[styles.barInner, { height: `${Math.max(3, total)}%`, opacity: isSel ? 1 : 0.5 }, isNow && styles.nowBar]}>
                        {mode === 'dock' ? (
                          <View style={{ flex: 1, backgroundColor: c.primary }} />
                        ) : (
                          <>
                            <View style={{ flex: Math.max(0.0001, split.c[h]), backgroundColor: c.classic }} />
                            <View style={{ flex: Math.max(0.0001, split.e[h]), backgroundColor: c.ebike }} />
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.ticks}>
                {HOUR_TICKS.map((h) => (
                  <Text key={h} style={[styles.tick, { left: `${(h / 24) * 100}%` }]}>{tickLabel(h)}</Text>
                ))}
              </View>

              {mode === 'bike' && (
                <View style={styles.legend}>
                  <Legend c={c} color={c.ebike} label="electric" />
                  <Legend c={c} color={c.classic} label="manual" />
                </View>
              )}

              {isLowConfidence(sn) && (
                <Text style={styles.note}>Based on limited history — treat as a rough guide.</Text>
              )}
            </>
          ) : (
            <View style={styles.empty}>
              <Icon name="time" size={22} color={c.textFaint} />
              <Text style={styles.emptyTxt}>Not enough history yet for this station.</Text>
            </View>
          )}

          {/* Sanctioned handoff: unlock / live battery live in the official app. */}
          <TouchableOpacity style={styles.unlockRow} onPress={openCitiBike} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Unlock in the Citi Bike app">
            <Icon name="unlock" size={16} color={c.textMute} />
            <Text style={styles.unlockTxt}>Unlock in Citi Bike</Text>
            <Icon name="external" size={12} color={c.textFaint} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Legend({ c, color, label }) {
  return (
    <View style={legendStyles.item}>
      <View style={[legendStyles.swatch, { backgroundColor: color }]} />
      <Text style={[legendStyles.txt, { color: c.textMute }]}>{label}</Text>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  txt: { fontSize: 11.5, fontWeight: '500' },
});

function makeStyles(c) {
  return StyleSheet.create({
    flex: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
    card: { backgroundColor: c.elevated, borderRadius: radius.xl, padding: 18, ...shadow(c).pop },

    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
    name: { fontSize: 17, fontWeight: '700', color: c.text },
    nowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    nowTxt: { fontSize: 12.5, color: c.textMute, fontWeight: '500' },
    headBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },

    controls: { flexDirection: 'row', marginBottom: 10 },
    seg: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3, flex: 1 },
    segItem: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
    segItemOn: { backgroundColor: c.elevated, ...shadow(c).card },
    segTxt: { fontSize: 13.5, color: c.textMute, fontWeight: '600' },
    segTxtOn: { color: c.text },

    dayRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    dayPill: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center', backgroundColor: c.surface },
    dayPillOn: { backgroundColor: c.primary },
    dayTxt: { fontSize: 12.5, fontWeight: '700', color: c.textMute },
    dayTxtOn: { color: c.onPrimary },

    caption: { textAlign: 'center', marginBottom: 10 },
    captionHour: { fontSize: 14, fontWeight: '700', color: c.primary },
    captionRest: { fontSize: 14, color: c.textMute, fontWeight: '500' },

    chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 },
    barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    barInner: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, overflow: 'hidden', minHeight: 4 },
    nowBar: { borderWidth: 1.5, borderColor: c.text },
    ticks: { height: 16, marginTop: 4, position: 'relative' },
    tick: { position: 'absolute', fontSize: 10.5, color: c.textFaint, fontWeight: '500' },

    legend: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.hairline },
    note: { fontSize: 11.5, color: c.textFaint, marginTop: 10, fontWeight: '400' },

    empty: { alignItems: 'center', gap: 10, paddingVertical: 28 },
    emptyTxt: { fontSize: 13.5, color: c.textMute, fontWeight: '500', textAlign: 'center' },

    unlockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.hairline },
    unlockTxt: { fontSize: 14, color: c.textMute, fontWeight: '500' },
  });
}
