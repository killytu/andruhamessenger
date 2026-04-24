// session.js

const SESS_KEY  = 'am_session_v2';
const RATCH_KEY = 'am_ratchets_v2';
const MSG_KEY   = 'am_messages_v2';
const CFG_KEY   = 'am_config_v3';

export const DEFAULT_SERVER = {
  id: 'default', name: 'Localhost (default)',
  url: 'ws://localhost:8080/ws', builtin: true,
};

export const Config = {
  load()    { try { return JSON.parse(localStorage.getItem(CFG_KEY)||'{}'); } catch { return {}; } },
  save(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); },

  getServers() {
    return [DEFAULT_SERVER, ...(this.load().servers||[])];
  },
  addServer(name, url) {
    const cfg=this.load(), id='srv_'+Date.now();
    const servers=[...(cfg.servers||[]),{id,name:name.trim(),url:url.trim(),builtin:false}];
    this.save({...cfg,servers,activeServerId:id});
    return id;
  },
  removeServer(id) {
    if(id==='default')return;
    const cfg=this.load();
    const servers=(cfg.servers||[]).filter(s=>s.id!==id);
    this.save({...cfg,servers,activeServerId:cfg.activeServerId===id?'default':cfg.activeServerId});
  },
  getActiveServer() {
    const cfg=this.load(), id=cfg.activeServerId||'default';
    return this.getServers().find(s=>s.id===id)||DEFAULT_SERVER;
  },
  setActiveServer(id) { this.save({...this.load(),activeServerId:id}); },
  getActiveUrl()      { return this.getActiveServer().url; },
  getHttpBase()       { return this.getActiveUrl().replace(/^ws/,'http').replace('/ws',''); },

  // Настройки UI
  getSettings() {
    const d={ theme:'dark', scale:100, fontSize:14, compactMode:false, showEncByDefault:false };
    return {...d,...(this.load().settings||{})};
  },
  saveSettings(s) { this.save({...this.load(),settings:s}); },
};

export const Session = {
  async save(username, privKey, pubKeyHex, displayName) {
    const privJwk = await crypto.subtle.exportKey('jwk', privKey);
    localStorage.setItem(SESS_KEY, JSON.stringify({username,privJwk,pubKeyHex,displayName:displayName||username,savedAt:Date.now()}));
  },
  load() { try { return JSON.parse(localStorage.getItem(SESS_KEY)||'null'); } catch { return null; } },
  async restoreKeys(sess) {
    const priv = await crypto.subtle.importKey('jwk',sess.privJwk,{name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    const pub  = await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:sess.privJwk.x,y:sess.privJwk.y,ext:true},{name:'ECDH',namedCurve:'P-256'},true,[]);
    return { pub, priv, pubHex: sess.pubKeyHex };
  },
  updateDisplayName(dn) {
    const s=this.load(); if(!s)return;
    localStorage.setItem(SESS_KEY, JSON.stringify({...s,displayName:dn}));
  },
  async getPrivHex(privKey) {
    try { const j=await crypto.subtle.exportKey('jwk',privKey); return jwkDtoHex(j.d); }
    catch { return null; }
  },
  clear() { localStorage.removeItem(SESS_KEY); localStorage.removeItem(RATCH_KEY); },

  saveRatchet(u,cid,s) {
    const a=this._r(); if(!a[u])a[u]={};
    a[u][cid]=s; try{localStorage.setItem(RATCH_KEY,JSON.stringify(a));}catch{}
  },
  loadRatchet(u,cid)  { return this._r()[u]?.[cid]||null; },
  clearRatchet(u,cid) { const a=this._r(); if(a[u]){delete a[u][cid];localStorage.setItem(RATCH_KEY,JSON.stringify(a));} },
  _r() { try{return JSON.parse(localStorage.getItem(RATCH_KEY)||'{}');}catch{return{};} },

  saveMessages(u,msgs) {
    const lite={};
    for(const[cid,ms]of Object.entries(msgs))
      lite[cid]=ms.slice(-200).map(m=>({id:m.id,from:m.from,fromName:m.fromName,text:m.text,via:m.via,status:m.status,time:m.time?new Date(m.time).toISOString():null}));
    const a=this._m(); a[u]=lite; try{localStorage.setItem(MSG_KEY,JSON.stringify(a));}catch{}
  },
  loadMessages(u) {
    const raw=this._m()[u]||{}; const out={};
    for(const[cid,ms]of Object.entries(raw))
      out[cid]=ms.map(m=>({...m,time:m.time?new Date(m.time):new Date()}));
    return out;
  },
  deleteContact(u,cid) {
    const a=this._m(); if(a[u]){delete a[u][cid];localStorage.setItem(MSG_KEY,JSON.stringify(a));}
    this.clearRatchet(u,cid);
  },
  _m() { try{return JSON.parse(localStorage.getItem(MSG_KEY)||'{}');}catch{return{};} },
};

export function jwkDtoHex(d) {
  if(!d)return'';
  return[...atob(d.replace(/-/g,'+').replace(/_/g,'/'))].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
}
export function hexToPrivJwk(hex) {
  const h=hex.replace(/\s/g,'');
  if(h.length!==64)throw new Error('Приватный ключ: нужно 64 hex символа');
  const bin=h.match(/.{2}/g).map(b=>String.fromCharCode(parseInt(b,16))).join('');
  const b64u=btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return{kty:'EC',crv:'P-256',key_ops:['deriveKey'],ext:true,d:b64u,
    x:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    y:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};
}
// Автодетект: строка выглядит как pubkey если 128-132 hex символов
export function looksLikePubKey(s) { return /^[0-9a-fA-F]{128,132}$/.test(s.trim()); }

// ── ReadCounts persistence ───────────────────────────────────────
const READ_KEY = 'am_readcounts_v1';
Session.saveReadCounts = function(myUser, counts) {
  try {
    const all = JSON.parse(localStorage.getItem(READ_KEY)||'{}');
    all[myUser] = counts;
    localStorage.setItem(READ_KEY, JSON.stringify(all));
  } catch {}
};
Session.loadReadCounts = function(myUser) {
  try { return JSON.parse(localStorage.getItem(READ_KEY)||'{}')[myUser] || {}; }
  catch { return {}; }
};

// ── Contacts persistence ─────────────────────────────────────────
const CONTACTS_KEY = 'am_contacts_v1';
Session.saveContacts = function(myUser, contacts) {
  // Сохраняем только pubKey и displayName (ratchet хранится отдельно)
  const lite = {};
  for (const [id, info] of Object.entries(contacts)) {
    if (id && info) {
      lite[id] = { pubKey: info.pubKey||null, displayName: info.displayName||id, online: false };
    }
  }
  try {
    const all = JSON.parse(localStorage.getItem(CONTACTS_KEY)||'{}');
    all[myUser] = lite;
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(all));
  } catch {}
};
Session.loadContacts = function(myUser) {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY)||'{}')[myUser] || {};
  } catch { return {}; }
};
Session.deleteContactMeta = function(myUser, contactID) {
  try {
    const all = JSON.parse(localStorage.getItem(CONTACTS_KEY)||'{}');
    if (all[myUser]) { delete all[myUser][contactID]; localStorage.setItem(CONTACTS_KEY, JSON.stringify(all)); }
  } catch {}
};

// ── Blocked users list ────────────────────────────────────────
const BLOCKED_KEY = 'am_blocked_v1';
Session.saveBlocked = function(myUser, list) {
  try {
    const all = JSON.parse(localStorage.getItem(BLOCKED_KEY)||'{}');
    all[myUser] = list;
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(all));
  } catch {}
};
Session.loadBlocked = function(myUser) {
  try {
    return JSON.parse(localStorage.getItem(BLOCKED_KEY)||'{}')[myUser] || [];
  } catch { return []; }
};
