// screens/Chat.jsx — главный экран чата
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ratchet } from '../crypto.js';
import { Session }  from '../session.js';
import { ContactStore } from '../lib/store.js';
import { MessageQueue } from '../lib/queue.js';
import { Bubble }   from '../components/Bubble.jsx';
import { Sidebar }  from '../components/Sidebar.jsx';
import { RouteBadge, Banner, Btn } from '../components/ui.jsx';
import {
  P2PInviteDialog, DeleteConfirmDialog,
  ProfileModal, AddContactDialog,
} from '../components/Dialogs.jsx';

export function ChatScreen({ user, userKeys, ws, rtc, onLogout }) {
  // ── State ────────────────────────────────────────────────────
  const [messages,    setMessages]    = useState(() => Session.loadMessages(user));
  // contacts: { [id]: { pubKey|null, ratchet|null, online, source } }
  const [contacts,    setContacts]    = useState(() => {
    // Загружаем контакты из стора при старте
    const stored = ContactStore.load(user);
    const result = {};
    for (const [id, data] of Object.entries(stored)) {
      const saved = Session.loadRatchet(user, id);
      result[id] = {
        pubKey:  data.pubKey || null,
        ratchet: saved ? Ratchet.fromSaved(saved) : null,
        online:  false,
        source:  data.source || 'unknown',
      };
    }
    return result;
  });
  const [activeChat,  setActiveChat]  = useState(null);
  const [input,       setInput]       = useState('');
  const [showEnc,     setShowEnc]     = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [wsStatus,    setWsStatus]    = useState('connecting');
  const [p2pStatus,   setP2pStatus]   = useState({});
  const [p2pInvite,   setP2pInvite]   = useState(null);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [queueCount,  setQueueCount]  = useState(0);
  const [secWarning,  setSecWarning]  = useState('');

  // ── Refs (для async хендлеров — всегда свежие данные) ────────
  const contactsRef   = useRef({});
  const activeChatRef = useRef(null);
  const queueRef      = useRef(null);
  contactsRef.current   = contacts;
  activeChatRef.current = activeChat;

  const bottomRef    = useRef(null);
  const pendingKeys  = useRef({});

  // ── Сохранение сообщений ──────────────────────────────────
  useEffect(() => { Session.saveMessages(user, messages); }, [messages]);

  // ── Скролл вниз ───────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeChat]);

  // ── Offline queue — инициализация ────────────────────────
  useEffect(() => {
    queueRef.current = new MessageQueue(user, async (item) => {
      if (!ws.isReady) return false;
      ws.sendMessage(item.to, item.enc);
      return true; // предполагаем доставку; onDelivered придёт отдельно
    });

    // Сразу попробуем flush (вдруг WS уже готов)
    queueRef.current.flush();
    setQueueCount(queueRef.current.count());

    return () => queueRef.current?.destroy();
  }, [user]);

  // ── Helpers ───────────────────────────────────────────────
  const pushMsg = useCallback((chatID, msg) => {
    setMessages(prev => ({
      ...prev,
      [chatID]: [...(prev[chatID] || []), { id: `${Date.now()}_${Math.random()}`, ...msg }],
    }));
  }, []);

  const updateMsgStatus = useCallback((chatID, predicate, newStatus) => {
    setMessages(prev => {
      const msgs = [...(prev[chatID] || [])];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (predicate(msgs[i])) {
          msgs[i] = { ...msgs[i], status: newStatus };
          break;
        }
      }
      return { ...prev, [chatID]: msgs };
    });
  }, []);

  // Запросить pubKey через сервер (Promise с таймаутом)
  const getPubKeyFromServer = useCallback((targetID) => new Promise(resolve => {
    pendingKeys.current[targetID] = resolve;
    ws.getKey(targetID);
    setTimeout(() => { delete pendingKeys.current[targetID]; resolve(null); }, 7000);
  }), [ws]);

  // Инициализировать / восстановить Ratchet для контакта
  const ensureRatchet = useRef(null);
  ensureRatchet.current = async (contactID) => {
    let contact = contactsRef.current[contactID];
    if (contact?.ratchet) return contact;

    let pubKeyHex = contact?.pubKey || ContactStore.getPubKey(user, contactID);

    if (!pubKeyHex && ws.isReady) {
      pubKeyHex = await getPubKeyFromServer(contactID);
    }
    if (!pubKeyHex) return null;

    // Сохраняем ключ локально на будущее (работает без сервера)
    ContactStore.savePubKey(user, contactID, pubKeyHex);

    // Восстанавливаем Ratchet из сессии или создаём новый
    const saved = Session.loadRatchet(user, contactID);
    const ratchet = saved
      ? Ratchet.fromSaved(saved)
      : await Ratchet.fromSharedSecret(userKeys.priv, pubKeyHex, userKeys.pubHex);

    const updated = { ...(contact || {}), pubKey: pubKeyHex, ratchet, online: true };
    setContacts(prev => ({ ...prev, [contactID]: updated }));
    contactsRef.current = { ...contactsRef.current, [contactID]: updated };
    return updated;
  };

  const saveRatchet = (contactID, ratchet) => {
    Session.saveRatchet(user, contactID, ratchet.export());
  };

  // ── P2P message handler (всегда свежий через ref) ─────────
  const p2pMsgHandlerRef = useRef(null);
  p2pMsgHandlerRef.current = async (fromID, encPayload) => {
    // Убеждаемся что контакт существует
    if (!contactsRef.current[fromID]) {
      setContacts(prev => ({ ...prev, [fromID]: { pubKey: null, ratchet: null, online: true, source: 'p2p' } }));
    }

    const contact = await ensureRatchet.current(fromID);
    if (!contact?.ratchet) { console.warn('[P2P] no ratchet for', fromID); return; }

    try {
      const idx  = encPayload.idx ?? contact.ratchet.recvCount;
      const text = await contact.ratchet.decrypt(encPayload.iv, encPayload.ct, idx);
      saveRatchet(fromID, contact.ratchet);
      pushMsg(fromID, { from: fromID, text, enc: encPayload, via: 'p2p', status: 'received', time: new Date() });
      // Открываем чат если не смотрим
      if (!activeChatRef.current) setActiveChat(fromID);
    } catch(e) { console.error('[P2P decrypt]', e); }
  };

  // ── WebRTC handlers ───────────────────────────────────────
  useEffect(() => {
    rtc.onMessage      = (f, p) => p2pMsgHandlerRef.current?.(f, p);
    rtc.onStatusChange = (id, s) => setP2pStatus(prev => ({ ...prev, [id]: s }));
    rtc.sendSignal     = (t, to, p) => ws.sendSignal(t, to, p);
    rtc.onIPWarning    = (msg) => setSecWarning(msg);
  }, [rtc, ws]);

  // ── WS handlers ───────────────────────────────────────────
  useEffect(() => {
    ws.handlers = {
      onConnect: () => {
        setWsStatus('connected');
        // При восстановлении соединения — flush queue
        setTimeout(() => {
          queueRef.current?.flush();
          setQueueCount(queueRef.current?.count() || 0);
        }, 500);
      },
      onDisconnect: () => setWsStatus('offline'),

      onRegistered: (msg) => {
        setWsStatus('connected');
        // НЕ добавляем всех онлайн-пользователей автоматически!
        // Только обновляем online-статус для уже известных контактов
        if (msg.users?.length) {
          setContacts(prev => {
            const next = { ...prev };
            for (const u of msg.users) {
              if (next[u.user_id]) {
                next[u.user_id] = { ...next[u.user_id], online: true };
                // Кешируем pubKey если ещё не знаем
                if (!next[u.user_id].pubKey && u.pub_key) {
                  next[u.user_id].pubKey = u.pub_key;
                  ContactStore.savePubKey(user, u.user_id, u.pub_key);
                }
              }
            }
            return next;
          });
        }
      },

      onMessage: async (msg) => {
        const from    = msg.from;
        // Автоматически создаём контакт для входящего сообщения
        if (!contactsRef.current[from]) {
          setContacts(prev => ({ ...prev, [from]: { pubKey: null, ratchet: null, online: true, source: 'incoming' } }));
          ContactStore.upsert(user, from, { source: 'incoming' });
        }

        const contact = await ensureRatchet.current(from);
        if (!contact?.ratchet) return;

        try {
          const idx  = msg.payload.idx ?? contact.ratchet.recvCount;
          const text = await contact.ratchet.decrypt(msg.payload.iv, msg.payload.ct, idx);
          saveRatchet(from, contact.ratchet);
          pushMsg(from, { from, text, enc: msg.payload, via: 'relay', status: 'received', time: new Date() });
          if (!activeChatRef.current) setActiveChat(from);
          // Отправляем read receipt если чат открыт
          if (activeChatRef.current === from) ws.sendRead(from);
        } catch(e) { console.error('[Relay decrypt]', e); }
      },

      onPubKey: (msg) => {
        pendingKeys.current[msg.user_id]?.(msg.pub_key);
        delete pendingKeys.current[msg.user_id];
        ContactStore.savePubKey(user, msg.user_id, msg.pub_key);
        setContacts(prev => ({
          ...prev,
          [msg.user_id]: { ...(prev[msg.user_id] || {}), pubKey: msg.pub_key },
        }));
      },

      onDelivered: () => {
        const chat = activeChatRef.current;
        if (!chat) return;
        updateMsgStatus(chat, m => m.from === 'me' && m.status === 'sending', 'delivered');
        // Flush queue — возможно есть ещё ожидающие
        queueRef.current?.flush();
        setQueueCount(queueRef.current?.count() || 0);
      },

      onRead: (msg) => {
        // Сервер прислал что получатель прочёл
        const chat = msg.from;
        if (!chat) return;
        updateMsgStatus(chat, m => m.from === 'me' && m.status === 'delivered', 'read');
      },

      onOnline:  (msg) => setContacts(prev => ({
        ...prev,
        [msg.user_id]: { ...(prev[msg.user_id] || {}), online: true },
      })),
      onOffline: (msg) => setContacts(prev => ({
        ...prev,
        [msg.user_id]: { ...(prev[msg.user_id] || {}), online: false },
      })),

      onError: (msg) => {
        if (msg.message === 'user_id already taken') onLogout();
      },

      onWebRTCOffer:  (msg) => setP2pInvite({ from: msg.from, payload: msg.payload }),
      onWebRTCAnswer: (msg) => rtc.handleAnswer(msg.from, msg.payload),
      onWebRTCIce:    (msg) => rtc.handleICE(msg.from, msg.payload),
    };

    ws.connect();
    ws.register(user, userKeys.pubHex);

    const t = setInterval(() => setWsStatus(ws.isReady ? 'connected' : 'offline'), 2000);
    return () => clearInterval(t);
  }, [user, userKeys, ws, rtc]);

  // ── Mark as read when chat is open ────────────────────────
  useEffect(() => {
    if (!activeChat) return;
    // Помечаем входящие как прочитанные
    setMessages(prev => {
      const msgs = (prev[activeChat] || []).map(m =>
        m.from !== 'me' && m.status === 'received' ? { ...m, status: 'read' } : m
      );
      return { ...prev, [activeChat]: msgs };
    });
    if (ws.isReady) ws.sendRead(activeChat);
  }, [activeChat]);

  // ── Add contact handler ────────────────────────────────────
  const handleAddContact = async ({ id, pubKey, source }) => {
    if (id === user) return;

    if (source === 'pubkey' && pubKey) {
      // Добавляем по публичному ключу — работает offline
      const ratchet = await Ratchet.fromSharedSecret(userKeys.priv, pubKey, userKeys.pubHex);
      Session.saveRatchet(user, id, ratchet.export());
      ContactStore.upsert(user, id, { pubKey, source: 'pubkey', addedAt: Date.now() });
      setContacts(prev => ({ ...prev, [id]: { pubKey, ratchet, online: false, source: 'pubkey' } }));
      setShowAdd(false);
      setActiveChat(id);
      return;
    }

    if (source === 'username') {
      // Ищем через сервер
      ContactStore.upsert(user, id, { source: 'username', addedAt: Date.now() });
      setContacts(prev => ({ ...prev, [id]: { pubKey: null, ratchet: null, online: false, source: 'username' } }));
      setShowAdd(false);
      setActiveChat(id);

      // Пробуем получить ключ в фоне
      const pubKeyHex = await getPubKeyFromServer(id);
      if (pubKeyHex) {
        const ratchet = await Ratchet.fromSharedSecret(userKeys.priv, pubKeyHex, userKeys.pubHex);
        Session.saveRatchet(user, id, ratchet.export());
        ContactStore.savePubKey(user, id, pubKeyHex);
        setContacts(prev => ({ ...prev, [id]: { ...prev[id], pubKey: pubKeyHex, ratchet, online: true } }));
      }
    }
  };

  const handleDeleteChat = (chatID) => {
    Session.deleteContact(user, chatID);
    ContactStore.remove(user, chatID);
    setMessages(prev => { const n = { ...prev }; delete n[chatID]; return n; });
    setContacts(prev => { const n = { ...prev }; delete n[chatID]; return n; });
    rtc.close(chatID);
    if (activeChat === chatID) setActiveChat(null);
    setDeleteTarget(null);
  };

  // ── P2P ───────────────────────────────────────────────────
  const startP2P = () => {
    if (!activeChat) return;
    setP2pStatus(prev => ({ ...prev, [activeChat]: 'connecting' }));
    rtc.createOffer(activeChat);
  };
  const stopP2P = () => {
    if (!activeChat) return;
    rtc.close(activeChat);
  };
  const acceptP2P = async () => {
    if (!p2pInvite) return;
    const { from, payload } = p2pInvite;
    setP2pInvite(null);
    if (!contacts[from]) {
      ContactStore.upsert(user, from, { source: 'p2p' });
      setContacts(prev => ({ ...prev, [from]: { pubKey: null, ratchet: null, online: true, source: 'p2p' } }));
    }
    setActiveChat(from);
    await rtc.handleOffer(from, payload);
  };

  // ── Send message ──────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || !activeChat) return;
    const text = input.trim();
    setInput('');

    const contact = await ensureRatchet.current(activeChat);
    if (!contact?.ratchet) {
      pushMsg(activeChat, { from: 'system', text: '⚠️ Нет ключа контакта. Добавь по публичному ключу если сервер недоступен.', time: new Date() });
      return;
    }

    const enc = await contact.ratchet.encrypt(text);
    saveRatchet(activeChat, contact.ratchet);

    // Пробуем P2P → Relay → Queue
    const sentP2P = await rtc.send(activeChat, enc);
    if (sentP2P) {
      pushMsg(activeChat, { from: 'me', text, enc, via: 'p2p', status: 'delivered', time: new Date() });
      return;
    }

    if (ws.isReady) {
      ws.sendMessage(activeChat, enc);
      pushMsg(activeChat, { from: 'me', text, enc, via: 'relay', status: 'sending', time: new Date() });
    } else {
      // Кладём в очередь
      queueRef.current?.enqueue(activeChat, enc, 'relay');
      setQueueCount(queueRef.current?.count() || 0);
      pushMsg(activeChat, { from: 'me', text, enc, via: 'relay', status: 'queued', time: new Date() });
    }
  };

  // ── Render ────────────────────────────────────────────────
  const chatMsgs = activeChat ? (messages[activeChat] || []) : [];
  const p2pSt    = activeChat ? (p2pStatus[activeChat] || 'none') : 'none';
  const isP2P    = p2pSt === 'connected';
  const isOffline= wsStatus === 'offline';

  const unreadForChat = (id) => {
    return (messages[id] || []).filter(m => m.from !== 'me' && m.status === 'received').length;
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Modals */}
      {p2pInvite    && <P2PInviteDialog fromID={p2pInvite.from} onAccept={acceptP2P} onReject={() => setP2pInvite(null)}/>}
      {showProfile  && <ProfileModal user={user} userKeys={userKeys} onClose={() => setShowProfile(false)} onLogout={onLogout}/>}
      {deleteTarget && <DeleteConfirmDialog contactID={deleteTarget} onConfirm={() => handleDeleteChat(deleteTarget)} onCancel={() => setDeleteTarget(null)}/>}
      {showAdd      && <AddContactDialog onAdd={handleAddContact} onClose={() => setShowAdd(false)} wsReady={ws.isReady}/>}

      {/* Status bar */}
      {isOffline && <Banner type="warning">📶 Сервер недоступен. Используй P2P или добавляй по публичному ключу.</Banner>}
      {secWarning && (
        <Banner type="warning">
          🛡 {secWarning}
          <button onClick={() => setSecWarning('')} style={{ marginLeft: 'auto', fontSize: 12, color: 'inherit' }}>✕</button>
        </Banner>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar
          user={user}
          wsStatus={wsStatus}
          contacts={contacts}
          messages={messages}
          p2pStatus={p2pStatus}
          activeChat={activeChat}
          onSelect={(id) => setActiveChat(id)}
          onAddContact={() => setShowAdd(true)}
          onDeleteChat={(id) => setDeleteTarget(id)}
          onOpenProfile={() => setShowProfile(true)}
          queueCount={queueCount}
        />

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Topbar */}
          <div style={{
            height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            background: 'var(--s1)', borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0,
          }}>
            {activeChat ? (
              <>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#6d28d9,#00d4be)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13, color: '#fff',
                }}>{activeChat[0]?.toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>@{activeChat}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', display: 'flex', gap: 4, alignItems: 'center', marginTop: 1 }}>
                    <RouteBadge mode={isP2P ? 'p2p' : 'relay'}/>
                    <span>Ratchet · ECDH P-256</span>
                  </div>
                </div>

                {/* P2P controls */}
                {!isP2P && p2pSt !== 'connecting' && (
                  <button onClick={startP2P} style={{
                    padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                    background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)', color: '#a78bfa',
                  }}>🔗 P2P</button>
                )}
                {p2pSt === 'connecting' && (
                  <span style={{ fontSize: 11, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="spin" style={{ width: 10, height: 10, borderRadius: '50%', display: 'inline-block', border: '1.5px solid rgba(167,139,250,.2)', borderTopColor: '#a78bfa' }}/>
                    Handshake…
                  </span>
                )}
                {isP2P && (
                  <button onClick={stopP2P} style={{
                    padding: '4px 9px', borderRadius: 7, fontSize: 11, color: '#4a6275', border: '1px solid rgba(255,255,255,.07)',
                  }}>✕ P2P</button>
                )}

                <button onClick={() => setShowEnc(!showEnc)} style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: showEnc ? 'rgba(0,212,190,.1)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${showEnc ? 'rgba(0,212,190,.25)' : 'rgba(255,255,255,.07)'}`,
                  color: showEnc ? '#00d4be' : 'var(--muted)',
                }}>
                  {showEnc ? '🔓' : '🔐'}
                </button>
                <button onClick={() => setDeleteTarget(activeChat)} style={{
                  padding: '4px 8px', borderRadius: 7, fontSize: 13,
                  background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.15)', color: '#f87171',
                }}>🗑️</button>
              </>
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                ← Выбери или добавь контакт
              </span>
            )}
          </div>

          {/* Info banners */}
          {isP2P && activeChat && (
            <Banner type="p2p">
              🔗 <strong>P2P активен</strong> — сообщения идут напрямую, сервер не участвует в передаче.
            </Banner>
          )}
          {showEnc && activeChat && (
            <Banner type="info">
              💡 Режим отладки: показан ciphertext — то что видит relay-сервер. Ratchet idx монотонно растёт.
            </Banner>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 6px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {!activeChat ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--dim)', marginTop: '18vh', textAlign: 'center' }}>
                <span style={{ fontSize: 46 }}>🔐</span>
                <p style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Нажми <strong style={{ color: 'var(--muted)' }}>+</strong> чтобы добавить контакт.<br/>
                  <span style={{ fontSize: 11, color: '#1a2535' }}>
                    По username (нужен сервер) или по публичному ключу (offline).
                  </span>
                </p>
              </div>
            ) : (
              chatMsgs.map(m => <Bubble key={m.id} msg={m} showEnc={showEnc}/>)
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          {activeChat && (
            <div style={{
              padding: '9px 12px', background: 'var(--s1)',
              borderTop: '1px solid rgba(255,255,255,.04)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <div style={{
                flex: 1, background: 'var(--s2)', border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 11, display: 'flex', alignItems: 'center', padding: '0 13px',
              }}>
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder={
                    isP2P ? `P2P · @${activeChat}…`
                    : isOffline ? `Offline — будет отправлено при подключении…`
                    : `Relay · @${activeChat}…`
                  }
                  style={{ flex: 1, fontSize: 14, padding: '10px 0' }}
                />
              </div>
              <button onClick={send} disabled={!input.trim()} style={{
                width: 42, height: 42, borderRadius: 9, flexShrink: 0,
                fontWeight: 800, fontSize: 17,
                background: input.trim()
                  ? isP2P ? 'linear-gradient(135deg,#a78bfa,#7c3aed)' : 'linear-gradient(135deg,#00d4be,#009e8e)'
                  : 'rgba(255,255,255,.04)',
                color: input.trim() ? '#fff' : 'var(--muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s',
              }}>→</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
