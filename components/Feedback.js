import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import Icon from './Icon';
import Logo from './Logo';
import { useTheme, radius, shadow } from '../lib/theme';
import { FEEDBACK_WEBHOOK, PRIVACY_URL, DEBUG_TEST_CRASH } from '../lib/config';
import app from '../app.json';

const VERSION = app?.expo?.version || '?';
const RUNTIME = String(app?.expo?.runtimeVersion ?? '?');
const NAME_KEY = 'citibike.feedback.name';
const EMAIL_KEY = 'citibike.feedback.email';

// Categories: [label, icon, UI hex, Discord embed color]. No default selection.
const CATEGORIES = [
  ['Bug', 'bug', '#DC2626', 0xDC2626],
  ['Idea', 'idea', '#007AFF', 0x007AFF],
  ['Other', 'chat', '#15803D', 0x15803D],
];
const NEUTRAL = 0x5B53E6;

// One-line diagnostics stamped on every report so a bug is tied to an exact build.
function diagnostics(screen) {
  const update = (Updates.updateId || '').slice(0, 8) || 'dev';
  return `v${VERSION} · rt${RUNTIME} · update ${update} · ${Platform.OS} ${Platform.Version} · screen: ${screen || '—'}`;
}

// Beta feedback sheet. Posts a color-coded embed (by category) to a Discord
// webhook — no email backend. Name/email are optional and remembered locally.
export default function Feedback({ visible, screen, onClose }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);
  const [category, setCategory] = useState(null); // 'Bug' | 'Idea' | 'Other' | null
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const diag = diagnostics(screen);
  // Which JS bundle is live: the OTA update id (short) or 'base' for the embedded
  // bundle — shown in the footer so a pushed update is verifiable at a glance, and
  // long-pressable for the full detail (publish time, channel).
  const build = Updates.isEmbeddedLaunch ? 'base' : ((Updates.updateId || '').slice(0, 7) || 'dev');
  const buildInfo = () => {
    const when = Updates.createdAt ? new Date(Updates.createdAt).toLocaleString() : '—';
    const src = Updates.isEmbeddedLaunch ? 'Embedded (no OTA yet)' : 'OTA update';
    Alert.alert('Build info', `Source:    ${src}\nUpdate:    ${(Updates.updateId || '').slice(0, 8) || '—'}\nPublished: ${when}\nChannel:   ${Updates.channel || '—'}\nRuntime:   rt${RUNTIME}\nApp:       v${VERSION}`);
  };

  // Remember name/email across reports.
  useEffect(() => {
    (async () => {
      try {
        const [n, e] = await Promise.all([AsyncStorage.getItem(NAME_KEY), AsyncStorage.getItem(EMAIL_KEY)]);
        if (n) setName(n);
        if (e) setEmail(e);
      } catch {}
    })();
  }, []);

  // Reset the per-report fields on close; keep the remembered name/email.
  const close = () => { setMsg(''); setCategory(null); setStatus('idle'); onClose && onClose(); };

  const send = async () => {
    if (!msg.trim() || status === 'sending') return;
    if (!FEEDBACK_WEBHOOK) { setStatus('error'); return; }
    setStatus('sending');
    const meta = CATEGORIES.find((x) => x[0] === category);
    const from = [name.trim(), email.trim()].filter(Boolean).join(' · ');
    const fields = [{ name: 'Message', value: msg.trim() }];
    if (from) fields.push({ name: 'From', value: from });
    const embed = {
      title: `${category ? category + ' · ' : ''}${screen || 'Feedback'}`,
      color: meta ? meta[3] : NEUTRAL,
      fields,
      footer: { text: diag },
    };
    try {
      const res = await fetch(FEEDBACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      try {
        await AsyncStorage.setItem(NAME_KEY, name.trim());
        await AsyncStorage.setItem(EMAIL_KEY, email.trim());
      } catch {}
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.flexTap} activeOpacity={1} onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            {status === 'sent' ? (
              <View style={styles.done}>
                <Logo size={40} />
                <Text style={styles.doneTitle}>Thanks!</Text>
                <TouchableOpacity style={[styles.send, styles.doneBtn]} onPress={close} activeOpacity={0.9}>
                  <Text style={styles.sendTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  <Text style={styles.title}>Send feedback</Text>
                  <TouchableOpacity onPress={close} hitSlop={10}><Icon name="close" size={20} color={c.textMute} /></TouchableOpacity>
                </View>

                <View style={styles.cats}>
                  {CATEGORIES.map(([label, icon, hex]) => {
                    const sel = category === label;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[styles.cat, sel && { backgroundColor: hex + '1A', borderColor: hex }]}
                        onPress={() => setCategory(sel ? null : label)}
                        activeOpacity={0.8}
                      >
                        <Icon name={icon} size={14} color={sel ? hex : c.textMute} />
                        <Text style={[styles.catTxt, sel && { color: hex }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="What happened, or what would make it better?"
                  placeholderTextColor={c.textFaint}
                  value={msg}
                  onChangeText={(t) => { setMsg(t); if (status === 'error') setStatus('idle'); }}
                  multiline
                  textAlignVertical="top"
                />

                <View style={styles.row}>
                  <TextInput style={[styles.field, styles.flex]} placeholder="Name (optional)" placeholderTextColor={c.textFaint} value={name} onChangeText={setName} />
                  <TextInput style={[styles.field, styles.flexWide]} placeholder="Email (optional)" placeholderTextColor={c.textFaint} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                </View>
                {status === 'error' && (
                  <Text style={styles.err}>
                    {FEEDBACK_WEBHOOK ? "Couldn't send — check your connection and try again." : 'Feedback channel not configured yet.'}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.send, (!msg.trim() || status === 'sending') && styles.sendOff]}
                  onPress={send}
                  activeOpacity={0.9}
                  disabled={!msg.trim() || status === 'sending'}
                >
                  {status === 'sending'
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.sendTxt}>Send</Text>}
                </TouchableOpacity>
                <Text style={styles.foot}>
                  <Text
                    style={styles.footLink}
                    onPress={() => { if (PRIVACY_URL) Linking.openURL(PRIVACY_URL).catch(() => {}); }}
                    accessibilityRole="link"
                  >
                    Privacy Policy
                  </Text>
                  {'   ·   '}
                  <Text onLongPress={buildInfo} accessibilityRole="button" accessibilityLabel="Build info">
                    {`Pedl v${VERSION} · ${build}`}
                  </Text>
                </Text>
                {DEBUG_TEST_CRASH && (
                  <TouchableOpacity
                    style={styles.testCrash}
                    onPress={() => {
                      Sentry.captureException(new Error('Pedl test crash (debug button)'));
                      Alert.alert(
                        'Test event sent to Sentry',
                        'If reporting is working, it should appear in your #crashes channel within a minute. Remember to turn this button off (DEBUG_TEST_CRASH) before the public release.'
                      );
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={styles.testCrashTxt}>Send test crash (debug)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    flexTap: { flex: 1 },
    flex: { flex: 1 },
    flexWide: { flex: 1.3 },
    sheet: { backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 20, paddingTop: 8, ...shadow(c).pop },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 14 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    cats: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    cat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: 1, borderColor: 'transparent' },
    catTxt: { fontSize: 13, fontWeight: '600', color: c.textMute },
    input: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, minHeight: 96, padding: 12, fontSize: 15, color: c.text, marginBottom: 10 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    field: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14, color: c.text },
    err: { fontSize: 13, color: c.danger, fontWeight: '600', marginBottom: 12 },
    send: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
    sendOff: { opacity: 0.45 },
    sendTxt: { color: c.onPrimary, fontSize: 16, fontWeight: '800' },
    foot: { textAlign: 'center', fontSize: 11.5, color: c.textFaint, marginTop: 10 },
    footLink: { color: c.primary, fontWeight: '700', textDecorationLine: 'underline' },
    done: { alignItems: 'center', paddingVertical: 16, gap: 8 },
    doneTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    doneSub: { fontSize: 14, color: c.textMute, marginBottom: 12, textAlign: 'center', lineHeight: 20 },
    doneBtn: { alignSelf: 'stretch', marginTop: 2 },
    testCrash: { alignSelf: 'center', marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 },
    testCrashTxt: { fontSize: 12, color: c.textFaint, fontWeight: '600', textDecorationLine: 'underline' },
  });
}
