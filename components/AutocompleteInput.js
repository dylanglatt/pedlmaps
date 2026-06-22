import React, { useState, useRef, useCallback } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { autocomplete, placeDetails } from '../lib/places';

// Text field with Google Places (New) type-ahead. Falls back gracefully: if
// autocomplete fails (e.g. web/CORS), the user can still type and we geocode on submit.
export default function AutocompleteInput({ value, onChangeText, onSelectPlace, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const handleChange = useCallback(
    (t) => {
      onChangeText(t);
      onSelectPlace(null); // editing clears any resolved selection
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
    },
    [onChangeText, onSelectPlace]
  );

  const pick = useCallback(
    async (s) => {
      setOpen(false);
      setSuggestions([]);
      const label = s.secondary ? `${s.primary}, ${s.secondary}` : s.primary;
      onChangeText(label);
      try {
        const d = await placeDetails(s.placeId);
        onSelectPlace(d);
      } catch {
        onSelectPlace(null); // fall back to geocode-on-submit
      }
    },
    [onChangeText, onSelectPlace]
  );

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={handleChange}
        autoCorrect={false}
      />
      {open && (
        <View style={styles.drop}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.placeId} style={styles.item} onPress={() => pick(s)}>
              <Text style={styles.primary} numberOfLines={1}>{s.primary}</Text>
              {!!s.secondary && <Text style={styles.secondary} numberOfLines={1}>{s.secondary}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 20 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 },
  drop: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 30,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  item: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  primary: { fontSize: 15, color: '#111', fontWeight: '600' },
  secondary: { fontSize: 12, color: '#777', marginTop: 1 },
});
