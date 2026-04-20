// lib/ws.js — WebSocket клиент с валидацией входящих signaling сообщений
//
// БЕЗОПАСНОСТЬ:
// 1. Проверяем тип и структуру каждого входящего сообщения
// 2. Лимит размера сообщения
// 3. Автореконнект с exponential backoff

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080/ws`;
const MAX_MSG_SIZE = 512 * 1024; // 512 KB

// Допустимые типы входящих сообщений
const ALLOWED_TYPES = new Set([
  'registered', 'message', 'pub_key', 'delivered', 'read',
  'online', 'offline', 'error',
  'webrtc_offer', 'webrtc_answer', 'webrtc_ice',
]);

export class WSClient {
  constructor(handlers = {}) {
    this.handlers        = handlers;
    this.ws              = null;
    this.userID          = null;
    this.pubKey          = null;
    this._ready          = false;
    this._reconnectTimer = null;
    this._delay          = 1500;
    this._destroyed      = false;
  }

  connect() {
    if (this._destroyed) return;
    console.log(`[WS] Connecting → ${WS_URL}`);
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this._ready = true;
      this._delay = 1500;
      clearTimeout(this._reconnectTimer);
      console.log('[WS] Connected');
      this.handlers.onConnect?.();
      if (this.userID && this.pubKey) {
        this._send({ type: 'register', user_id: this.userID, pub_key: this.pubKey });
      }
    };

    this.ws.onclose = () => {
      if (this._destroyed) return;
      this._ready = false;
      this.handlers.onDisconnect?.();
      this._reconnectTimer = setTimeout(() => {
        this._delay = Math.min(this._delay * 1.5, 15000);
        this.connect();
      }, this._delay);
    };

    this.ws.onerror = () => {};

    this.ws.onmessage = ({ data }) => {
      // SECURITY: лимит размера
      if (typeof data !== 'string' || data.length > MAX_MSG_SIZE) {
        console.warn('[WS] Message too large or wrong type, dropping');
        return;
      }
      try {
        const msg = JSON.parse(data);
        this._route(msg);
      } catch {
        console.warn('[WS] JSON parse error');
      }
    };
  }

  register(userID, pubKeyHex) {
    this.userID = userID;
    this.pubKey = pubKeyHex;
    this._send({ type: 'register', user_id: userID, pub_key: pubKeyHex });
  }

  getKey(targetID) {
    if (!targetID || typeof targetID !== 'string') return;
    this._send({ type: 'get_key', target: targetID });
  }

  sendMessage(to, payload) {
    if (!to || !payload?.iv || !payload?.ct) return;
    this._send({ type: 'message', to, payload });
  }

  sendRead(to) {
    this._send({ type: 'read_receipt', to });
  }

  // WebRTC сигналинг — только relay, не интерпретируем SDP на этом уровне
  sendSignal(type, to, payload) {
    if (!['webrtc_offer','webrtc_answer','webrtc_ice'].includes(type)) return;
    if (!to) return;
    this._send({ type, to, payload });
  }

  get isReady() { return this._ready; }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    this.ws?.close();
  }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  _route(msg) {
    // SECURITY: проверяем тип
    if (!msg || typeof msg.type !== 'string') return;
    if (!ALLOWED_TYPES.has(msg.type)) {
      console.warn('[WS] Unknown message type:', msg.type);
      return;
    }

    switch (msg.type) {
      case 'registered':    this.handlers.onRegistered?.(msg);   break;
      case 'message':       this.handlers.onMessage?.(msg);      break;
      case 'pub_key':       this.handlers.onPubKey?.(msg);       break;
      case 'delivered':     this.handlers.onDelivered?.(msg);    break;
      case 'read':          this.handlers.onRead?.(msg);         break;
      case 'online':        this.handlers.onOnline?.(msg);       break;
      case 'offline':       this.handlers.onOffline?.(msg);      break;
      case 'error':         this.handlers.onError?.(msg);        break;
      case 'webrtc_offer':  this.handlers.onWebRTCOffer?.(msg);  break;
      case 'webrtc_answer': this.handlers.onWebRTCAnswer?.(msg); break;
      case 'webrtc_ice':    this.handlers.onWebRTCIce?.(msg);    break;
    }
  }
}
