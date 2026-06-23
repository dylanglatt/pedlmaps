import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import Icon from './Icon';
import { useTheme, radius, shadow } from '../lib/theme';
import { FEEDBACK_WEBHOOK } from '../lib/config';
import app from '../app.json';

const VERSION = app?.expo?.version || '?';
const RUNTIME = String(app?.expo?.runtimeVersion ?? '?');

// One-line diagnostics stamped on every report so a bug is tied to an exact build.
function diagnostics(screen) {
  const update = (Updates.updateId || '').slice(0, 8) || 'dev';
  return `v${VERSION} · rt${RUNTIME} · update ${update} · ${Platform.OS} ${Platform.Version} · screen: ${screen || '—'}`;
}

// Beta feedback sheet. Posts the message + diagnostics to a Discord webhook —
// no email, no backend. Opened by tapping the BETA pill.
export default function Feedback({ visible, screen, onClose }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(c);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const diag = diagnostics(screen);

  const close = () => { setMsg(''); setStatus('idle'); onClose && onClose(); };

  const send = async () => {
    if (!msg.trim() || status === 'sending') return;
    if (!FEEDBACK_WEBHOOK) { setStatus('error'); return; }
    setStatus('sending');
    try {
      const res = await fetch(FEEDBACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `**Feedback** · ${screen || '—'}\n${msg.trim()}\n\`${diag}\`` }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
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
                <Icon name="star" size={28} color={c.good} />
                <Text style={styles.doneTitle}>Thanks!</Text>
                <Text style={styles.doneSub}>Your note is on its way to the team.</Text>
                <TouchableOpacity style={styles.send} onPress={close} activeOpacity={0.9}>
                  <Text style={styles.sendTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  <Text style={styles.title}>Send feedback</Text>
                  <TouchableOpacity onPress={close} hitSlop={10}><Icon name="close" size={20} color={c.textMute} /></TouchableOpacity>
                </View>
                <Text style={styles.sub}>Found a bug or have an idea? It goes straight to the DockHop team.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="What happened, or what would make it better?"
                  placeholderTextColor={c.textFaint}
                  value={msg}
                  onChangeText={(t) => { setMsg(t); if (status === 'error') setStatus('idle'); }}
                  multiline
                  autoFocus
                  textAlignVertical="top"
                />
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
                <Text style={styles.foot}>DockHop v{VERSION}</Text>
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
    sheet: { backgroundColor: c.elevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 20, paddingTop: 8, ...shadow(c).pop },
    handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginBottom: 14 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    sub: { fontSize: 13, color: c.textMute, fontWeight: '400', marginBottom: 14, lineHeight: 18 },
    input: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, minHeight: 110, padding: 12, fontSize: 15, color: c.text, marginBottom: 12 },
    diagBox: { backgroundColor: c.surface, borderRadius: radius.sm, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 14 },
    diagLabel: { fontSize: 10.5, fontWeight: '700', color: c.textFaint, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
    diagTxt: { fontSize: 11.5, color: c.textMute, fontWeight: '500', fontVariant: ['tabular-nums'] },
    err: { fontSize: 13, color: c.danger, fontWeight: '600', marginBottom: 12 },
    send: { backgroundColor: c.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
    sendOff: { opacity: 0.45 },
    sendTxt: { color: c.onPrimary, fontSize: 16, fontWeight: '800' },
    foot: { textAlign: 'center', fontSize: 11.5, color: c.textFaint, marginTop: 10 },
    done: { alignItems: 'center', paddingVertical: 12, gap: 6 },
    doneTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    doneSub: { fontSize: 14, color: c.textMute, marginBottom: 12, textAlign: 'center' },
  });
}
