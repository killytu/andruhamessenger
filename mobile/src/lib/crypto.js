// crypto.js — ECDH P-256 + AES-256-GCM + Double Ratchet

const enc = new TextEncoder();
const dec = new TextDecoder();
export const b2h = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
export const h2b = hex => { const b=new Uint8Array(hex.length/2); for(let i=0;i<hex.length;i+=2)b[i/2]=parseInt(hex.substr(i,2),16); return b; };

export const CE = {
  async genKeys() {
    const kp  = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveKey']);
    const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    return { pub: kp.publicKey, priv: kp.privateKey, pubHex: b2h(raw) };
  },

  importPub(hex) {
    return crypto.subtle.importKey('raw', h2b(hex), { name:'ECDH', namedCurve:'P-256' }, true, []);
  },

  // Импорт приватного ключа из JWK (для восстановления сессии)
  importPriv(jwk) {
    return crypto.subtle.importKey('jwk', jwk, { name:'ECDH', namedCurve:'P-256' }, true, ['deriveKey']);
  },

  async exportPrivJwk(privKey) {
    return crypto.subtle.exportKey('jwk', privKey);
  },

  async sharedSecret(privKey, pubKey) {
    const sk  = await crypto.subtle.deriveKey(
      { name:'ECDH', public: pubKey }, privKey,
      { name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']
    );
    return crypto.subtle.exportKey('raw', sk);
  },

  async encryptRaw(keyBuf, text) {
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', keyBuf, { name:'AES-GCM', length:256 }, false, ['encrypt']);
    const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(text));
    return { iv: b2h(iv), ct: b2h(ct) };
  },

  async decryptRaw(keyBuf, iv, ct) {
    const key = await crypto.subtle.importKey('raw', keyBuf, { name:'AES-GCM', length:256 }, false, ['decrypt']);
    const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv: h2b(iv) }, key, h2b(ct));
    return dec.decode(pt);
  },

  async hkdf(inputKeyMaterial, salt, info, length=32) {
    const ikm  = await crypto.subtle.importKey('raw', inputKeyMaterial, { name:'HKDF' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'HKDF', hash: 'SHA-256',
      salt: salt || new Uint8Array(32),
      info: enc.encode(info),
    }, ikm, length * 8);
    return bits;
  },
};

// ─── Double Ratchet ────────────────────────────────────────────
export class Ratchet {
  constructor(sendChain, recvChain) {
    this.sendChain  = sendChain;  // ArrayBuffer
    this.recvChain  = recvChain;  // ArrayBuffer
    this.sendCount  = 0;
    this.recvCount  = 0;
    this.skippedKeys = new Map();
  }

  async _step(chain) {
    const combined = await CE.hkdf(chain, new Uint8Array(32), 'am-step', 64);
    const arr = new Uint8Array(combined);
    return { newChain: arr.slice(0,32).buffer, msgKey: arr.slice(32,64).buffer };
  }

  async encrypt(plaintext) {
    const { newChain, msgKey } = await this._step(this.sendChain);
    this.sendChain = newChain;
    const payload  = await CE.encryptRaw(msgKey, plaintext);
    const idx      = this.sendCount++;
    return { ...payload, idx };
  }

  async decrypt(iv, ct, idx) {
    const key = String(idx);
    if (this.skippedKeys.has(key)) {
      const msgKey = this.skippedKeys.get(key);
      this.skippedKeys.delete(key);
      return CE.decryptRaw(msgKey, iv, ct);
    }
    while (this.recvCount < idx) {
      const { newChain, msgKey } = await this._step(this.recvChain);
      this.skippedKeys.set(String(this.recvCount), msgKey);
      this.recvChain = newChain;
      this.recvCount++;
    }
    const { newChain, msgKey } = await this._step(this.recvChain);
    this.recvChain = newChain;
    this.recvCount++;
    return CE.decryptRaw(msgKey, iv, ct);
  }

  // Создать из shared secret. myPubHex < theirPubHex → разные цепочки
  static async fromSharedSecret(privKey, theirPubHex, myPubHex) {
    const pub    = await CE.importPub(theirPubHex);
    const secret = await CE.sharedSecret(privKey, pub);
    const chainA = await CE.hkdf(secret, new Uint8Array(32), 'am-chain-A', 32);
    const chainB = await CE.hkdf(secret, new Uint8Array(32), 'am-chain-B', 32);
    const smaller = myPubHex < theirPubHex;
    return new Ratchet(smaller ? chainA : chainB, smaller ? chainB : chainA);
  }

  // Восстановить из сохранённого состояния (сессия)
  static fromSaved(saved) {
    const r = new Ratchet(h2b(saved.sendChain).buffer, h2b(saved.recvChain).buffer);
    r.sendCount = saved.sendCount;
    r.recvCount = saved.recvCount;
    return r;
  }

  // Экспорт для сохранения
  export() {
    return {
      sendChain: b2h(this.sendChain),
      recvChain: b2h(this.recvChain),
      sendCount: this.sendCount,
      recvCount: this.recvCount,
    };
  }
}
