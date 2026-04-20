// screens/Auth.jsx — экраны аутентификации
import { useState, useEffect } from 'react';
import { CE } from '../crypto.js';
import { Spinner, Card, FieldLabel, Btn } from '../components/ui.jsx';

// ── Welcome Back (сессия найдена) ─────────────────────────────
export function WelcomeBack({ sess, onResume, onNew }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 40% 20%,#0d1f2d,#050810 65%)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: .25,
        backgroundImage: `linear-gradient(rgba(0,212,190,.06)1px,transparent 1px),linear-gradient(90deg,rgba(0,212,190,.06)1px,transparent 1px)`,
        backgroundSize: '52px 52px',
      }}/>
      <div className="fade-up" style={{ position: 'relative', textAlign: 'center', maxWidth: 380, padding: '0 28px' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>👋</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>С возвращением</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>Найдена сохранённая сессия</p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          background: 'rgba(0,212,190,.07)', border: '1px solid rgba(0,212,190,.2)',
          borderRadius: 12, padding: '12px 20px', marginBottom: 28,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg,#00d4be,#0099aa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: 16, color: '#021a17',
          }}>{sess.username[0]?.toUpperCase()}</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>@{sess.username}</div>
            <div style={{ fontSize: 9.5, color: '#00d4be', fontFamily: 'var(--mono)', marginTop: 1 }}>
              {sess.pubKeyHex?.slice(0, 28)}…
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onNew}    variant="ghost"   size="md" style={{ flex: 1 }}>Другой аккаунт</Btn>
          <Btn onClick={onResume} variant="primary" size="md" style={{ flex: 2 }}>Продолжить →</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Auth entry ────────────────────────────────────────────────
export function AuthScreen({ onRegister, onLogin }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 40% 20%,#0d1f2d,#050810 65%)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: .25,
        backgroundImage: `linear-gradient(rgba(0,212,190,.06)1px,transparent 1px),linear-gradient(90deg,rgba(0,212,190,.06)1px,transparent 1px)`,
        backgroundSize: '52px 52px',
      }}/>
      <div className="fade-up" style={{ position: 'relative', textAlign: 'center', maxWidth: 480, padding: '0 32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 30,
          background: 'rgba(0,212,190,.06)', border: '1px solid rgba(0,212,190,.2)',
          borderRadius: 24, padding: '6px 18px', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#00d4be',
        }}>
          <span className="blink" style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4be', display: 'inline-block' }}/>
          ANDRUHA MESSENGER
        </div>
        <h1 style={{
          fontSize: 50, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, marginBottom: 12,
          background: 'linear-gradient(150deg,#fff 25%,#00d4be 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Andruha<br/>Messenger</h1>
        <p style={{ fontSize: 14, color: '#4a6275', lineHeight: 1.7, marginBottom: 32 }}>
          E2E-шифрование · WebRTC P2P · Double Ratchet<br/>Без номера телефона. Ключи только у тебя.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 32, textAlign: 'left' }}>
          {[
            { i: '🔐', t: 'ECDH P-256', d: 'Shared secret без передачи по сети' },
            { i: '🔑', t: 'Double Ratchet', d: 'Новый ключ на каждое сообщение' },
            { i: '🔗', t: 'WebRTC P2P', d: 'Прямое соединение без сервера' },
            { i: '📶', t: 'Offline-first', d: 'Работает без интернета' },
          ].map(f => (
            <div key={f.t} style={{
              background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
              borderRadius: 10, padding: '11px 13px',
            }}>
              <div style={{ fontSize: 18, marginBottom: 3 }}>{f.i}</div>
              <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 2 }}>{f.t}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>{f.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onLogin}    variant="ghost"   size="lg" style={{ flex: 1 }}>🔑 Войти по ключу</Btn>
          <Btn onClick={onRegister} variant="primary" size="lg" style={{ flex: 1 }}>✦ Создать аккаунт</Btn>
        </div>
        <p style={{ marginTop: 14, fontSize: 10, color: '#1a2535' }}>
          Ключи генерируются в браузере — сервер их никогда не видит.
        </p>
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────
export function RegisterScreen({ onDone, onBack, serverError }) {
  const [step,    setStep]    = useState(0);
  const [name,    setName]    = useState('');
  const [keys,    setKeys]    = useState(null);
  const [privHex, setPrivHex] = useState('');

  useEffect(() => { if (serverError) setStep(0); }, [serverError]);

  const generate = async () => {
    if (!name.trim()) return;
    setStep(1);
    const k = await CE.genKeys();
    const jwk = await CE.exportPrivJwk(k.priv);
    const ph = jwk.d
      ? [...atob(jwk.d.replace(/-/g, '+').replace(/_/g, '/'))].map(c => c.charCodeAt(0).toString(16).padStart(2,'0')).join('')
      : '';
    setKeys(k); setPrivHex(ph); setStep(2);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 480 }}>
        <button onClick={onBack} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          ← Назад
        </button>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>
          {step < 2 ? 'Новый аккаунт' : 'Аккаунт создан ✓'}
        </h2>

        {serverError && step === 0 && (
          <Card style={{ borderColor: 'rgba(248,113,113,.3)', background: 'rgba(248,113,113,.04)', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#f87171' }}>⚠️ {serverError}</p>
          </Card>
        )}

        {step === 0 && (
          <div className="fade-in">
            <Card accent="var(--accent)">
              <FieldLabel>USERNAME</FieldLabel>
              <input value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
                placeholder="alice, bob, аноним…"
                style={{ fontSize: 22, fontWeight: 800, width: '100%' }} autoFocus/>
            </Card>
            <Btn onClick={generate} disabled={!name.trim()} variant="primary" size="lg">
              Создать аккаунт →
            </Btn>
          </div>
        )}

        {step === 1 && (
          <div className="fade-in" style={{ textAlign: 'center', padding: '52px 0' }}>
            <Spinner/>
            <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#00d4be', marginTop: 18 }}>
              Генерация ECDH P-256 ключей…
            </p>
          </div>
        )}

        {step === 2 && keys && (
          <div className="fade-in">
            <Card style={{ borderColor: 'rgba(248,113,113,.3)', background: 'rgba(248,113,113,.04)', marginBottom: 12 }}>
              <FieldLabel color="#f87171">⚠️ СОХРАНИ ПРИВАТНЫЙ КЛЮЧ — ЭТО ЕДИНСТВЕННЫЙ СПОСОБ ВОЙТИ</FieldLabel>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: '#fca5a5',
                lineHeight: 1.8, wordBreak: 'break-all',
                background: 'rgba(0,0,0,.3)', borderRadius: 6, padding: '8px 10px',
                userSelect: 'all', cursor: 'copy',
              }}
                onClick={() => navigator.clipboard.writeText(privHex)}>
                {privHex}
              </div>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                Нажми чтобы скопировать. Потеря ключа = потеря аккаунта.
              </p>
            </Card>
            <Card accent="var(--accent)">
              <FieldLabel>ПУБЛИЧНЫЙ КЛЮЧ (твой адрес)</FieldLabel>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#3d5a6e', lineHeight: 1.7, wordBreak: 'break-all' }}>
                {keys.pubHex}
              </div>
            </Card>
            <Btn onClick={() => onDone(name.trim(), keys)} variant="primary" size="lg" style={{ marginTop: 4 }}>
              Я сохранил ключ. Войти →
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Login by private key ──────────────────────────────────────
export function LoginScreen({ onDone, onBack }) {
  const [username, setUsername] = useState('');
  const [keyHex,   setKeyHex]   = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const tryLogin = async () => {
    if (!username.trim() || !keyHex.trim()) { setError('Заполни оба поля'); return; }
    setError(''); setLoading(true);
    try {
      const hex = keyHex.trim().replace(/\s/g, '');
      if (hex.length !== 64) throw new Error('Длина приватного ключа должна быть 64 hex-символа');

      const bin  = hex.match(/.{2}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
      const b64u = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const jwk  = {
        kty: 'EC', crv: 'P-256', key_ops: ['deriveKey'], ext: true, d: b64u,
        x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        y: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      };

      const priv   = await CE.importPriv(jwk);
      const fullJwk = await CE.exportPrivJwk(priv);
      const pubJwk  = { kty: 'EC', crv: 'P-256', x: fullJwk.x, y: fullJwk.y, ext: true };
      const pub     = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
      const raw     = await crypto.subtle.exportKey('raw', pub);
      const pubHex  = [...new Uint8Array(raw)].map(b => b.toString(16).padStart(2, '0')).join('');

      onDone(username.trim(), { pub, priv, pubHex });
    } catch(e) {
      setError(e.message || 'Неверный ключ. Проверь что скопировал правильно.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div className="fade-up" style={{ width: '100%', maxWidth: 480 }}>
        <button onClick={onBack} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          ← Назад
        </button>
        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Войти по ключу</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 22, lineHeight: 1.6 }}>
          Введи username и приватный ключ (64 hex-символа) из профиля.
        </p>

        <Card accent="var(--accent)">
          <FieldLabel>USERNAME</FieldLabel>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="alice" style={{ fontSize: 20, fontWeight: 700, width: '100%' }} autoFocus/>
        </Card>

        <Card accent="#f472b6">
          <FieldLabel color="#f472b6">ПРИВАТНЫЙ КЛЮЧ (64 символа hex)</FieldLabel>
          <textarea value={keyHex} onChange={e => setKeyHex(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && tryLogin()}
            placeholder="вставь приватный ключ…"
            style={{
              width: '100%', fontSize: 11, fontFamily: 'var(--mono)',
              color: '#f472b6', lineHeight: 1.6, resize: 'none', minHeight: 54,
            }}/>
        </Card>

        {error && (
          <div className="shake" style={{
            background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.2)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#f87171',
          }}>⚠️ {error}</div>
        )}

        <Btn
          onClick={tryLogin}
          disabled={loading || !username.trim() || !keyHex.trim()}
          variant="primary" size="lg">
          {loading ? <><Spinner size={16} color="#021a17"/> Проверяем…</> : 'Войти →'}
        </Btn>
      </div>
    </div>
  );
}
