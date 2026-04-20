// lib/webrtc.js — WebRTC P2P с защитой от утечки IP
//
// БЕЗОПАСНОСТЬ:
// 1. ICE candidate filtering — убираем local/mDNS адреса (утечка IP)
// 2. SDP validation — проверяем что SDP это именно SDP перед обработкой
// 3. DataChannel только через DTLS (встроено в WebRTC)
// 4. Signaling через уже установленный WS (не открываем новых каналов)

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Паттерны локальных адресов которые не нужно раскрывать
const LOCAL_IP_RE = /((192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+|127\.0\.0\.1|::1|fd[0-9a-f:]+)/i;
const MDNS_RE     = /[a-f0-9-]{36}\.local/i;

function isSafeCandidate(candidate) {
  if (!candidate) return false;
  // Пропускаем локальные IP и mDNS адреса — они раскрывают внутреннюю топологию сети
  if (LOCAL_IP_RE.test(candidate)) return false;
  if (MDNS_RE.test(candidate))     return false;
  return true;
}

// Проверяем что SDP payload валидный
function validateSDP(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.sdp !== 'string')          return false;
  if (!payload.sdp.startsWith('v=0'))           return false; // SDP всегда начинается с v=0
  if (payload.sdp.length > 20000)               return false; // SDP не может быть 20KB+
  return true;
}

// Проверяем что ICE candidate валидный
function validateICE(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.candidate !== 'string')   return false;
  if (!payload.candidate.startsWith('candidate:')) return false;
  if (payload.candidate.length > 1000)         return false;
  return true;
}

export class WebRTCManager {
  constructor({ onMessage, onStatusChange, sendSignal, onIPWarning }) {
    this.onMessage      = onMessage;
    this.onStatusChange = onStatusChange;
    this.sendSignal     = sendSignal;
    this.onIPWarning    = onIPWarning; // колбэк когда фильтруем подозрительный кандидат
    this.peers          = new Map(); // targetID → { pc, dc, status }
  }

  // Инициатор
  async createOffer(targetID) {
    if (this.peers.has(targetID)) this.close(targetID);
    const pc = this._createPC(targetID);
    const dc = pc.createDataChannel('msg', { ordered: true });
    this._setupDC(dc, targetID);
    this.peers.set(targetID, { pc, dc, status: 'connecting' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal('webrtc_offer', targetID, { sdp: offer.sdp });
    this.onStatusChange(targetID, 'connecting');
  }

  // Получатель принял offer
  async handleOffer(fromID, payload) {
    // SECURITY: валидируем SDP
    if (!validateSDP(payload)) {
      console.warn('[WebRTC] Invalid SDP offer from', fromID);
      return;
    }
    if (this.peers.has(fromID)) this.close(fromID);

    const pc = this._createPC(fromID);
    this.peers.set(fromID, { pc, dc: null, status: 'connecting' });

    pc.ondatachannel = ({ channel }) => {
      this._setupDC(channel, fromID);
      const peer = this.peers.get(fromID);
      if (peer) peer.dc = channel;
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignal('webrtc_answer', fromID, { sdp: answer.sdp });
    this.onStatusChange(fromID, 'connecting');
  }

  async handleAnswer(fromID, payload) {
    // SECURITY: валидируем SDP
    if (!validateSDP(payload)) {
      console.warn('[WebRTC] Invalid SDP answer from', fromID);
      return;
    }
    const peer = this.peers.get(fromID);
    if (!peer) return;
    await peer.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
  }

  async handleICE(fromID, candidate) {
    // SECURITY: валидируем ICE candidate
    if (!validateICE(candidate)) {
      console.warn('[WebRTC] Invalid ICE candidate from', fromID);
      return;
    }
    const peer = this.peers.get(fromID);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch(e) {
      console.warn('[WebRTC] ICE error:', e.message);
    }
  }

  // Отправить payload через DataChannel
  // Возвращает true если отправлено P2P
  async send(targetID, encPayload) {
    const peer = this.peers.get(targetID);
    if (peer?.dc?.readyState === 'open') {
      peer.dc.send(JSON.stringify(encPayload));
      return true;
    }
    return false;
  }

  isConnected(targetID) {
    return this.peers.get(targetID)?.dc?.readyState === 'open';
  }

  close(targetID) {
    const peer = this.peers.get(targetID);
    if (!peer) return;
    try { peer.dc?.close(); } catch {}
    try { peer.pc.close();  } catch {}
    this.peers.delete(targetID);
    this.onStatusChange(targetID, 'none');
  }

  closeAll() {
    for (const id of this.peers.keys()) this.close(id);
  }

  _createPC(targetID) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const cStr = candidate.candidate;

      // SECURITY: фильтруем локальные адреса
      if (!isSafeCandidate(cStr)) {
        this.onIPWarning?.(`ICE candidate filtered (local IP): ${cStr.substring(0,60)}…`);
        return; // не отправляем локальный адрес через signaling
      }

      this.sendSignal('webrtc_ice', targetID, candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const s     = pc.connectionState;
      const peer  = this.peers.get(targetID);
      if (peer) peer.status = s;

      console.log(`[WebRTC] ${targetID}: ${s}`);
      if (s === 'connected')                          this.onStatusChange(targetID, 'connected');
      if (s === 'failed' || s === 'disconnected') {
        this.onStatusChange(targetID, s);
        setTimeout(() => this.close(targetID), 2000);
      }
    };

    return pc;
  }

  _setupDC(dc, targetID) {
    dc.onopen = () => {
      const peer = this.peers.get(targetID);
      if (peer) peer.status = 'connected';
      this.onStatusChange(targetID, 'connected');
    };
    dc.onclose   = () => this.onStatusChange(targetID, 'closed');
    dc.onerror   = () => this.onStatusChange(targetID, 'failed');
    dc.onmessage = ({ data }) => {
      try {
        // SECURITY: парсим только JSON, отбрасываем неожиданные форматы
        if (typeof data !== 'string') return;
        if (data.length > 100_000)    return; // лимит 100KB
        const payload = JSON.parse(data);
        // Проверяем минимальную структуру зашифрованного сообщения
        if (typeof payload.iv !== 'string' || typeof payload.ct !== 'string') return;
        this.onMessage(targetID, payload);
      } catch(e) {
        console.warn('[WebRTC] DataChannel message parse error:', e);
      }
    };
  }
}
