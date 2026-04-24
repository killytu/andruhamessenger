// ws.js — WebSocket с детальным статусом подключения

export class WSClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws       = null;
    this.userID   = null;
    this.pubKey   = null;
    this.dispName = null;
    this._ready   = false;
    this._closed  = false;
    this._timer   = null;
    this._delay   = 1500;
    this._url     = null;
    this._attempt = 0;
  }

  connect(url) {
    if (url) this._url = url;
    if (!this._url || this._closed) return;

    this._attempt++;
    console.log(`[WS] Connecting (attempt ${this._attempt}) → ${this._url}`);
    this.handlers.onStatusChange?.({ status: 'connecting', url: this._url, attempt: this._attempt });

    try {
      this.ws = new WebSocket(this._url);
    } catch (e) {
      // Невалидный URL
      this.handlers.onStatusChange?.({ status: 'error', url: this._url, error: `Неверный URL: ${e.message}` });
      return;
    }

    this.ws.onopen = () => {
      if (this._closed) { this.ws.close(); return; }
      console.log('[WS] Connected ✓');
      this._ready = true;
      this._delay = 1500;
      this._attempt = 0;
      clearTimeout(this._timer);
      this.handlers.onStatusChange?.({ status: 'connected', url: this._url });
      this.handlers.onConnect?.();
      if (this.userID && this.pubKey) {
        this._send({ type: 'register', user_id: this.userID, pub_key: this.pubKey, display_name: this.dispName || this.userID });
      }
    };

    this.ws.onclose = (ev) => {
      this._ready = false;
      if (this._closed) return;
      const reason = ev.reason || (ev.code === 1006 ? 'Сервер недоступен (1006)' : `code ${ev.code}`);
      console.log(`[WS] Closed: ${reason}, retry in ${this._delay}ms`);
      this.handlers.onStatusChange?.({ status: 'offline', url: this._url, reason });
      this.handlers.onDisconnect?.();
      this._timer = setTimeout(() => {
        this._delay = Math.min(this._delay * 1.5, 15000);
        this.connect();
      }, this._delay);
    };

    this.ws.onerror = () => {
      // onerror всегда предшествует onclose — не дублируем логику
      console.warn('[WS] Error on', this._url);
    };

    this.ws.onmessage = ({ data }) => {
      try   { this._route(JSON.parse(data)); }
      catch (e) { console.error('[WS] Parse error:', e); }
    };
  }

  // Переключить сервер БЕЗ перезапуска приложения
  switchServer(url, userID, pubKey, dispName) {
    console.log('[WS] Switching server →', url);
    this._closed = true;
    clearTimeout(this._timer);
    try { this.ws?.close(); } catch {}

    this._closed  = false;
    this._ready   = false;
    this._delay   = 1500;
    this._attempt = 0;
    if (userID)   this.userID   = userID;
    if (pubKey)   this.pubKey   = pubKey;
    if (dispName) this.dispName = dispName;
    this.connect(url);
  }

  destroy() {
    this._closed = true;
    clearTimeout(this._timer);
    try { this.ws?.close(); } catch {}
  }

  register(userID, pubKeyHex, displayName) {
    this.userID   = userID;
    this.pubKey   = pubKeyHex;
    this.dispName = displayName;
    this._send({ type: 'register', user_id: userID, pub_key: pubKeyHex, display_name: displayName || userID });
  }

  setName(displayName) { this._send({ type: 'set_name', display_name: displayName }); }
  getKey(targetID)     { this._send({ type: 'get_key', target: targetID }); }
  sendMessage(to, payload) { this._send({ type: 'message', to, payload }); }
  sendSignal(type, to, payload) { this._send({ type, to, payload }); }
  sendReadReceipt(to)  { this._send({ type: 'read_receipt', to }); }

  get isReady() { return this._ready && !this._closed; }
  get currentUrl() { return this._url; }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    console.warn('[WS] Not ready, dropping:', obj.type);
    return false;
  }

  _route(msg) {
    const h = this.handlers;
    switch (msg.type) {
      case 'registered':    h.onRegistered?.(msg);   break;
      case 'message':       h.onMessage?.(msg);      break;
      case 'pub_key':       h.onPubKey?.(msg);       break;
      case 'delivered':     h.onDelivered?.(msg);    break;
      case 'online':        h.onOnline?.(msg);       break;
      case 'offline':       h.onOffline?.(msg);      break;
      case 'read':          h.onRead?.(msg);         break;
      case 'name_changed':  h.onNameChanged?.(msg);  break;
      case 'error':         h.onError?.(msg);        break;
      case 'webrtc_offer':  h.onWebRTCOffer?.(msg);  break;
      case 'webrtc_answer': h.onWebRTCAnswer?.(msg); break;
      case 'webrtc_ice':    h.onWebRTCIce?.(msg);    break;
      case 'webrtc_cancel': h.onWebRTCCancel?.(msg); break;
      default: console.warn('[WS] Unknown type:', msg.type);
    }
  }
}
