import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { autocomplete, placeDetails } from '../lib/places';
import { useTheme, radius, font, shadow } from '../lib/theme';

// Text field with Google Places (New) type-ahead. Degrades gracefully: if
// autocomplete fails (e.g. web/CORS), the user can still type and we geocode on submit.
export default function AutocompleteInput({ value, onChangeText, onSelectPlace, placeholder }) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const handleChange = useCallback((t) => {
    onChangeText(t);
    onSelectPlace(null);
    if (timer.current) clearTimeout(timer.current);
    if (!t || t.trim().length < 3) { setSuggestions([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await autocomplete(t);
        setSuggestions(r);
        setOpen(r.length > 0);
      } catch {
        setSuggestions([]); setOpen(false);
      }
    }, 300);
  }, [onChangeText, onSelectPlace]);

  const pick = useCallback(async (s) => {
    setOpen(false);
    setSuggestions([]);
    const label = s.secondary ? `${s.primary}, ${s.secondary}` : s.primary;
    onChangeText(label);
    try {
      const d = await placeDetails(s.placeId);
      onSelectPlace(d);
    } catch {
      onSelectPlace(null);
    }
  }, [onChangeText, onSelectPlace]);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        value={value}
        onChangeText={handleChange}
        autoCorrect={false}
      />
      {open && (
        <View style={styles.drop}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.placeId} style={styles.item} onPress={() => pick(s)} activeOpacity={0.7}>
              <Text style={styles.primary} numberOfLines={1}>{s.primary}</Text>
              {!!s.secondary && <Text style={styles.secondary} numberOfLines={1}>{s.secondary}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    wrap: { position: 'relative', zIndex: 20 },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 13, fontSize: 15, color: c.text, backgroundColor: c.elevated, fontWeight: '400' },
    drop: { position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: c.elevated, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: 'hidden', zIndex: 30, ...shadow(c).pop },
    item: { paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.hairline },
    primary: { fontSize: 15, color: c.text, fontWeight: '600' },
    secondary: { fontSize: 12, color: c.textMute, marginTop: 1, fontWeight: '400' },
  });
}
