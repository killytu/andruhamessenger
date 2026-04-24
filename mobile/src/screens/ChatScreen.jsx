import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { WSClient } from '../lib/ws';
import { CE, Ratchet } from '../lib/crypto';
import { Secure, Store } from '../lib/storage';

const C = {
  bg:'#050810', s1:'#090d16', s2:'#0f1520',
  accent:'#00d4be', purple:'#a78bfa',
  text:'#e2eaf4', muted:'#4a6275', dim:'#1e2d3d',
};

function Bubble({ msg }) {
  const isMe = msg.from === 'me';
  const time  = new Date(msg.time).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
  return (
    <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', marginBottom: 8, paddingHorizontal: 12 }}>
      {!isMe && (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.purple,
          alignItems: 'center', justifyContent: 'center', marginRight: 6, marginTop: 2 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{(msg.fromName||msg.from)[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={{ maxWidth: '72%' }}>
        {!isMe && <Text style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{msg.fromName||msg.from}</Text>}
        <View style={{
          backgroundColor: isMe ? 'rgba(0,212,190,0.15)' : C.s2,
          borderRadius: 13, padding: '10 13',
          borderWidth: 1,
          borderColor: isMe ? 'rgba(0,212,190,0.25)' : 'rgba(255,255,255,0.06)',
        }}>
          <Text style={{ fontSize: 15, color: C.text, lineHeight: 22 }}>{msg.text}</Text>
        </View>
        <View style={{ flexDirection: isMe ? 'row-reverse' : 'row', marginTop: 3, gap: 4, alignItems: 'center' }}>
          {msg.via === 'p2p' && <Text style={{ fontSize: 9, color: C.purple }}>🔗 P2P</Text>}
          {msg.via === 'relay' && <Text style={{ fontSize: 9, color: C.accent }}>🌐 Relay</Text>}
          {isMe && { sending: <Text style={{ color: C.muted, fontSize: 11 }}>⏳</Text>, delivered: <Text style={{ color: C.muted, fontSize: 11 }}>✓</Text>, read: <Text style={{ color: C.accent, fontSize: 11 }}>✓✓</Text> }[msg.status]}
          <Text style={{ fontSize: 10, color: C.dim }}>{time}</Text>
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen({ route, navigation }) {
  const { user, userKeys, serverUrl } = route.params;
  const [messages,   setMessages]   = useState({});
  const [contacts,   setContacts]   = useState({});
  const [activeChat, setActiveChat] = useState(null);
  const [input,      setInput]      = useState('');
  const [wsStatus,   setWsStatus]   = useState('connecting');
  const [addVal,     setAddVal]     = useState('');
  const flatRef  = useRef(null);
  const wsRef    = useRef(new WSClient({}));
  const contRef  = useRef({});
  contRef.current = contacts;

  const pushMsg = useCallback((cid, msg) => {
    setMessages(p => ({ ...p, [cid]: [...(p[cid]||[]), { id: Date.now()+Math.random(), ...msg }] }));
  }, []);

  const ensureRatchet = async (id) => {
    const c = contRef.current[id];
    if (c?.ratchet) return c;
    const saved = await Store.get(`ratchet_${user}_${id}`);
    const pubKey = c?.pubKey;
    if (!pubKey) return null;
    const ratchet = saved ? Ratchet.fromSaved(saved) : await Ratchet.fromSharedSecret(userKeys.priv, pubKey, userKeys.pubHex);
    if (!saved) await Store.set(`ratchet_${user}_${id}`, ratchet.export());
    const up = { ...(c||{}), ratchet, pubKey };
    contRef.current = { ...contRef.current, [id]: up };
    setContacts(p => ({ ...p, [id]: up }));
    return up;
  };

  useEffect(() => {
    const ws = wsRef.current;
    ws.handlers = {
      onStatusChange: ({ status }) => setWsStatus(status),
      onRegistered:   () => setWsStatus('connected'),
      onDisconnect:   () => setWsStatus('offline'),
      onMessage: async (msg) => {
        const c = await ensureRatchet(msg.from);
        if (!c?.ratchet) return;
        try {
          const text = await c.ratchet.decrypt(msg.payload.iv, msg.payload.ct, msg.payload.idx ?? c.ratchet.recvCount);
          await Store.set(`ratchet_${user}_${msg.from}`, c.ratchet.export());
          pushMsg(msg.from, { from: msg.from, fromName: c.displayName, text, via: 'relay', status: 'received', time: Date.now() });
        } catch {}
      },
      onPubKey: (msg) => {
        setContacts(p => ({ ...p, [msg.user_id]: { ...(p[msg.user_id]||{}), pubKey: msg.pub_key, displayName: msg.display_name||msg.user_id } }));
      },
      onOnline:  (msg) => setContacts(p => ({ ...p, [msg.user_id]: { ...(p[msg.user_id]||{}), online: true } })),
      onOffline: (msg) => setContacts(p => ({ ...p, [msg.user_id]: { ...(p[msg.user_id]||{}), online: false } })),
    };
    ws.connect(serverUrl || 'ws://localhost:8080/ws');
    ws.register(user, userKeys.pubHex, user);
    return () => ws.destroy();
  }, []);

  const addContact = async () => {
    const t = addVal.trim();
    if (!t || t === user) return;
    wsRef.current.getKey(t);
    setAddVal('');
    setActiveChat(t);
  };

  const send = async () => {
    if (!input.trim() || !activeChat) return;
    const text = input.trim(); setInput('');
    // Добавляем контакт если нет pubKey
    let c = await ensureRatchet(activeChat);
    if (!c) { Alert.alert('Нет ключа', 'Подождите пока контакт появится онлайн'); return; }
    const enc = await c.ratchet.encrypt(text);
    await Store.set(`ratchet_${user}_${activeChat}`, c.ratchet.export());
    wsRef.current.sendMessage(activeChat, enc);
    pushMsg(activeChat, { from: 'me', text, enc, via: 'relay', status: 'sending', time: Date.now() });
  };

  const chatMsgs = activeChat ? (messages[activeChat]||[]) : [];
  const statusColor = { connected: C.accent, connecting: '#fbbf24', offline: '#f87171' }[wsStatus] || C.muted;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Status bar */}
      <View style={{ backgroundColor: C.s1, paddingTop: 48, paddingBottom: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }}/>
        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
          {wsStatus === 'connected' ? 'Онлайн · E2EE' : wsStatus === 'connecting' ? 'Подключение…' : 'Офлайн'}
        </Text>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Sidebar (contacts) */}
        {!activeChat && (
          <View style={{ flex: 1, backgroundColor: C.s1, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,.05)' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' }}>
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 18, marginBottom: 12 }}>🔐 @{user}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={addVal} onChangeText={setAddVal}
                  placeholder="Добавить контакт…" placeholderTextColor={C.muted}
                  style={{ flex: 1, backgroundColor: C.s2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.07)' }}
                  autoCapitalize="none" returnKeyType="done" onSubmitEditing={addContact}
                />
                <TouchableOpacity onPress={addContact} style={{ backgroundColor: 'rgba(0,212,190,.1)', borderWidth: 1, borderColor: 'rgba(0,212,190,.2)', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' }}>
                  <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {Object.entries(contacts).map(([id, info]) => (
              <TouchableOpacity key={id} onPress={() => setActiveChat(id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.04)' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{id[0].toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{info.displayName||id}</Text>
                  <Text style={{ color: info.online ? C.accent : C.muted, fontSize: 11 }}>{info.online ? '● Онлайн' : '○ Офлайн'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Chat */}
        {activeChat && (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            {/* Chat header */}
            <View style={{ backgroundColor: C.s1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' }}>
              <TouchableOpacity onPress={() => setActiveChat(null)}>
                <Text style={{ color: C.accent, fontSize: 20 }}>←</Text>
              </TouchableOpacity>
              <Text style={{ color: C.text, fontWeight: '800', fontSize: 15 }}>
                {contacts[activeChat]?.displayName||activeChat}
              </Text>
              <Text style={{ color: C.muted, fontSize: 10, marginLeft: 'auto' }}>🔑 Ratchet · E2EE</Text>
            </View>

            <FlatList
              ref={flatRef}
              data={chatMsgs}
              keyExtractor={m => String(m.id)}
              renderItem={({ item }) => <Bubble msg={item}/>}
              onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingVertical: 8 }}
            />

            <View style={{ flexDirection: 'row', padding: 10, gap: 8, backgroundColor: C.s1, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.05)' }}>
              <TextInput
                value={input} onChangeText={setInput}
                placeholder={`Сообщение · @${activeChat}…`} placeholderTextColor={C.muted}
                style={{ flex: 1, backgroundColor: C.s2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,.07)' }}
                multiline returnKeyType="send" onSubmitEditing={send}
              />
              <TouchableOpacity onPress={send} disabled={!input.trim()} style={{
                width: 42, height: 42, borderRadius: 10,
                backgroundColor: input.trim() ? C.accent : 'rgba(255,255,255,.05)',
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: input.trim() ? '#021a17' : C.muted, fontSize: 18, fontWeight: '800' }}>→</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
