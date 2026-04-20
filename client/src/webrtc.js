// webrtc.js — P2P соединения через WebRTC DataChannel
//
// Поток:
//   Alice.createOffer(bob) → ws → Bob.handleOffer(alice)
//   Bob.handleAnswer(alice) ← ws ← Bob.createAnswer()
//   ICE candidates ← ws → (оба конца)
//   DataChannel.open() → P2P готов!
//   Сообщения: шифруются тем же ECDH ключом что и relay-режим

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export class WebRTCManager {
  constructor({ onMessage, onStatusChange, sendSignal }) {
    // onMessage(fromID, encPayload)  — входящее P2P сообщение
    // onStatusChange(targetID, status) — 'connecting'|'connected'|'closed'|'failed'
    // sendSignal(type, to, payload)  — отправить через WS сигнал

    this.onMessage      = onMessage;
    this.onStatusChange = onStatusChange;
    this.sendSignal     = sendSignal;

    // targetID → { pc: RTCPeerConnection, dc: RTCDataChannel, status }
    this.peers = new Map();
  }

  // ── Инициатор (Alice нажала "P2P") ─────────────────────────
  async createOffer(targetID) {
    if (this.peers.has(targetID)) this.close(targetID);

    const pc = this._createPC(targetID);
    // Создаём DataChannel до createOffer (важно!)
    const dc = pc.createDataChannel('msg', { ordered: true });
    this._setupDC(dc, targetID);
    this.peers.set(targetID, { pc, dc, status: 'connecting' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignal('webrtc_offer', targetID, { sdp: offer.sdp });
    this.onStatusChange(targetID, 'connecting');
    console.log(`[WebRTC] Offer sent to ${targetID}`);
  }

  // ── Получатель (Bob получил offer) ─────────────────────────
  async handleOffer(fromID, { sdp }) {
    if (this.peers.has(fromID)) this.close(fromID);

    const pc = this._createPC(fromID);
    this.peers.set(fromID, { pc, dc: null, status: 'connecting' });

    // У получателя DataChannel приходит через событие
    pc.ondatachannel = ({ channel }) => {
      this._setupDC(channel, fromID);
      const peer = this.peers.get(fromID);
      if (peer) peer.dc = channel;
    };

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal('webrtc_answer', fromID, { sdp: answer.sdp });
    this.onStatusChange(fromID, 'connecting');
    console.log(`[WebRTC] Answer sent to ${fromID}`);
  }

  // ── Alice получила answer ───────────────────────────────────
  async handleAnswer(fromID, { sdp }) {
    const peer = this.peers.get(fromID);
    if (!peer) return console.warn(`[WebRTC] No peer for answer from ${fromID}`);
    await peer.pc.setRemoteDescription({ type: 'answer', sdp });
    console.log(`[WebRTC] Answer from ${fromID} applied`);
  }

  // ── ICE candidate (NAT traversal) ──────────────────────────
  async handleICE(fromID, candidate) {
    const peer = this.peers.get(fromID);
    if (!peer || !candidate) return;
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      // Иногда кандидаты приходят до remote description — игнорируем
      console.warn(`[WebRTC] ICE error from ${fromID}:`, e.message);
    }
  }

  // ── Отправить зашифрованный payload через DataChannel ──────
  // Возвращает true если ушло P2P, false если нужен fallback
  async send(targetID, encPayload) {
    const peer = this.peers.get(targetID);
    if (peer?.dc?.readyState === 'open') {
      peer.dc.send(JSON.stringify(encPayload));
      return true;
    }
    return false;
  }

  isConnected(targetID) {
    const peer = this.peers.get(targetID);
    return peer?.dc?.readyState === 'open';
  }

  getStatus(targetID) {
    return this.peers.get(targetID)?.status ?? 'none';
  }

  close(targetID) {
    const peer = this.peers.get(targetID);
    if (!peer) return;
    try { peer.dc?.close(); } catch {}
    try { peer.pc.close();  } catch {}
    this.peers.delete(targetID);
    this.onStatusChange(targetID, 'closed');
  }

  // ── Внутренние хелперы ──────────────────────────────────────
  _createPC(targetID) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Собираем ICE candidates и отправляем через WS
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignal('webrtc_ice', targetID, candidate.toJSON());
      }
    };

    // Следим за состоянием соединения
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log(`[WebRTC] ${targetID} connectionState: ${s}`);
      const peer = this.peers.get(targetID);
      if (peer) peer.status = s;

      if (s === 'connected') this.onStatusChange(targetID, 'connected');
      if (s === 'failed' || s === 'disconnected') {
        this.onStatusChange(targetID, s);
        // Авто-закрытие при ошибке
        setTimeout(() => this.close(targetID), 2000);
      }
    };

    return pc;
  }

  _setupDC(dc, targetID) {
    dc.onopen = () => {
      console.log(`[WebRTC] DataChannel OPEN with ${targetID}`);
      const peer = this.peers.get(targetID);
      if (peer) peer.status = 'connected';
      this.onStatusChange(targetID, 'connected');
    };

    dc.onclose = () => {
      console.log(`[WebRTC] DataChannel CLOSED with ${targetID}`);
      this.onStatusChange(targetID, 'closed');
    };

    dc.onerror = (e) => {
      console.error(`[WebRTC] DataChannel ERROR with ${targetID}:`, e);
      this.onStatusChange(targetID, 'failed');
    };

    dc.onmessage = ({ data }) => {
      try {
        const payload = JSON.parse(data);
        this.onMessage(targetID, payload);
      } catch (e) {
        console.error('[WebRTC] Message parse error:', e);
      }
    };
  }
}
