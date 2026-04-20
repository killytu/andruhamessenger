// ws.js — WebSocket клиент с автореконнектом + WebRTC signaling

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8080/ws`;

export class WSClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws       = null;
    this.userID   = null;
    this.pubKey   = null;
    this._ready   = false;
    this._reconnectTimer = null;
    this._reconnectDelay = 1500;
  }

  connect() {
    console.log(`[WS] Connecting → ${WS_URL}`);
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this._ready = true;
      this._reconnectDelay = 1500;
      clearTimeout(this._reconnectTimer);
      this.handlers.onConnect?.();
      if (this.userID && this.pubKey) {
        this._send({ type: 'register', user_id: this.userID, pub_key: this.pubKey });
      }
    };

    this.ws.onclose = () => {
      this._ready = false;
      this.handlers.onDisconnect?.();
      console.log(`[WS] Closed, retry in ${this._reconnectDelay}ms`);
      this._reconnectTimer = setTimeout(() => {
        this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, 10000);
        this.connect();
      }, this._reconnectDelay);
    };

    this.ws.onerror = (e) => console.error('[WS] Error:', e);
    this.ws.onmessage = ({ data }) => {
      try   { this._route(JSON.parse(data)); }
      catch { console.error('[WS] Parse error', data); }
    };
  }

  register(userID, pubKeyHex) {
    this.userID = userID;
    this.pubKey = pubKeyHex;
    this._send({ type: 'register', user_id: userID, pub_key: pubKeyHex });
  }

  getKey(targetID)          { this._send({ type: 'get_key', target: targetID }); }
  sendMessage(to, payload)  { this._send({ type: 'message', to, payload }); }
  sendSignal(type, to, payload) { this._send({ type, to, payload }); }

  get isReady() { return this._ready; }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      console.warn('[WS] Not ready, dropping:', obj.type);
    }
  }

  _route(msg) {
    switch (msg.type) {
      case 'registered':    this.handlers.onRegistered?.(msg);   break;
      case 'message':       this.handlers.onMessage?.(msg);      break;
      case 'pub_key':       this.handlers.onPubKey?.(msg);       break;
      case 'delivered':     this.handlers.onDelivered?.(msg);    break;
      case 'online':        this.handlers.onOnline?.(msg);       break;
      case 'offline':       this.handlers.onOffline?.(msg);      break;
      case 'error':         this.handlers.onError?.(msg);        break;
      case 'webrtc_offer':  this.handlers.onWebRTCOffer?.(msg);  break;
      case 'webrtc_answer': this.handlers.onWebRTCAnswer?.(msg); break;
      case 'webrtc_ice':    this.handlers.onWebRTCIce?.(msg);    break;
      default: console.warn('[WS] Unknown:', msg.type);
    }
  }
}
