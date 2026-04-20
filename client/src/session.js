// session.js — управление сессией через localStorage
//
// Хранит: username, приватный ключ (JWK), публичный ключ (hex)
// + состояние ratchet для каждого контакта (sendCount/recvCount/chains)
// → при перезаходе сообщения продолжают работать

const SESS_KEY     = 'am_session';      // am = AndruhaMessenger
const RATCHET_KEY  = 'am_ratchets';
const MESSAGES_KEY = 'am_messages';

export const Session = {
  // ── Сохранить сессию ─────────────────────────────────────
  async save(username, privKey, pubKeyHex) {
    const privJwk = await crypto.subtle.exportKey('jwk', privKey);
    const data = { username, privJwk, pubKeyHex, savedAt: Date.now() };
    localStorage.setItem(SESS_KEY, JSON.stringify(data));
    return data;
  },

  // ── Загрузить сессию ─────────────────────────────────────
  load() {
    try {
      const raw = localStorage.getItem(SESS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  // ── Восстановить CryptoKey из JWK ─────────────────────────
  async restoreKeys(sess) {
    const priv = await crypto.subtle.importKey(
      'jwk', sess.privJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );
    const pubRaw = await crypto.subtle.importKey(
      'raw', h2b(sess.pubKeyHex),
      { name: 'ECDH', namedCurve: 'P-256' },
      true, []
    );
    return { pub: pubRaw, priv, pubHex: sess.pubKeyHex };
  },

  // ── Получить приватный ключ как hex (для показа в профиле) ─
  async getPrivHex() {
    const sess = this.load();
    if (!sess) return null;
    const jwk = sess.privJwk;
    // d — секретная компонента ECDH ключа (base64url)
    return jwk.d ? btoa_url_to_hex(jwk.d) : null;
  },

  clear() {
    localStorage.removeItem(SESS_KEY);
    localStorage.removeItem(RATCHET_KEY);
    // Не удаляем сообщения — пользователь может войти заново
  },

  // ── Ratchet persistence ───────────────────────────────────
  saveRatchet(myUsername, contactID, ratchet) {
    const all = this._loadRatchets();
    if (!all[myUsername]) all[myUsername] = {};
    all[myUsername][contactID] = {
      sendChain:  ab2hex(ratchet.sendChain),
      recvChain:  ab2hex(ratchet.recvChain),
      sendCount:  ratchet.sendCount,
      recvCount:  ratchet.recvCount,
    };
    localStorage.setItem(RATCHET_KEY, JSON.stringify(all));
  },

  loadRatchet(myUsername, contactID) {
    const all = this._loadRatchets();
    return all[myUsername]?.[contactID] || null;
  },

  clearRatchet(myUsername, contactID) {
    const all = this._loadRatchets();
    if (all[myUsername]) delete all[myUsername][contactID];
    localStorage.setItem(RATCHET_KEY, JSON.stringify(all));
  },

  _loadRatchets() {
    try { return JSON.parse(localStorage.getItem(RATCHET_KEY) || '{}'); }
    catch { return {}; }
  },

  // ── Message persistence ───────────────────────────────────
  saveMessages(myUsername, messages) {
    // Сохраняем только текст/метаданные, не enc (экономим место)
    const lite = {};
    for (const [cid, msgs] of Object.entries(messages)) {
      lite[cid] = msgs.map(m => ({
        id:     m.id,
        from:   m.from,
        text:   m.text,
        via:    m.via,
        status: m.status,
        time:   m.time ? new Date(m.time).toISOString() : null,
      }));
    }
    const all = this._loadAllMessages();
    all[myUsername] = lite;
    try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(all)); }
    catch { /* quota exceeded — ignore */ }
  },

  loadMessages(myUsername) {
    const all = this._loadAllMessages();
    const raw = all[myUsername] || {};
    // Восстанавливаем Date объекты
    const out = {};
    for (const [cid, msgs] of Object.entries(raw)) {
      out[cid] = msgs.map(m => ({ ...m, time: m.time ? new Date(m.time) : new Date() }));
    }
    return out;
  },

  deleteContact(myUsername, contactID) {
    // Удаляем сообщения
    const all = this._loadAllMessages();
    if (all[myUsername]) delete all[myUsername][contactID];
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(all));
    // Удаляем ratchet
    this.clearRatchet(myUsername, contactID);
  },

  _loadAllMessages() {
    try { return JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}'); }
    catch { return {}; }
  },
};

// ── Утилиты ───────────────────────────────────────────────────
function ab2hex(ab) {
  return [...new Uint8Array(ab)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function h2b(hex) {
  const b = new Uint8Array(hex.length/2);
  for (let i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.substr(i,2),16);
  return b;
}
function btoa_url_to_hex(b64url) {
  const b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
  const bin = atob(b64);
  return [...bin].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
}
