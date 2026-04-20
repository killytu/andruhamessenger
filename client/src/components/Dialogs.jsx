// components/Dialogs.jsx — все модальные диалоги
import { useState, useEffect } from 'react';
import { CE } from '../crypto.js';
import { Spinner, Btn, Card, FieldLabel, Avatar } from './ui.jsx';

// ── Overlay wrapper ────────────────────────────────────────────
function Overlay({ children, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fade-in" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}>
      {children}
    </div>
  );
}

// ── P2P Invite ────────────────────────────────────────────────
export function P2PInviteDialog({ fromID, onAccept, onReject }) {
  return (
    <Overlay onClose={onReject}>
      <div style={{
        background: 'var(--s1)', border: '1px solid rgba(167,139,250,.3)',
        borderRadius: 16, padding: '28px 32px', maxWidth: 360, width: '90%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 42, marginBottom: 14 }}>🔗</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Запрос P2P</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
          <strong style={{ color: 'var(--text)' }}>@{fromID}</strong> хочет установить прямое соединение.<br/>
          <span style={{ fontSize: 11 }}>Сообщения пойдут напрямую — сервер не участвует.</span>
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onReject}  variant="ghost"  size="md" style={{ flex: 1 }}>Отклонить</Btn>
          <Btn onClick={onAccept} variant="purple" size="md" style={{ flex: 1 }}>Принять P2P</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ── Delete chat confirm ────────────────────────────────────────
export function DeleteConfirmDialog({ contactID, onConfirm, onCancel }) {
  return (
    <Overlay onClose={onCancel}>
      <div style={{
        background: 'var(--s1)', border: '1px solid rgba(248,113,113,.2)',
        borderRadius: 14, padding: '24px 28px', maxWidth: 320, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
        <h3 style={{ fontWeight: 800, marginBottom: 8 }}>Удалить чат?</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Чат с <strong>@{contactID}</strong> и все сообщения будут удалены.<br/>
          <span style={{ fontSize: 11 }}>Ratchet также сбросится.</span>
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onCancel}  variant="ghost"  size="md" style={{ flex: 1 }}>Отмена</Btn>
          <Btn onClick={onConfirm} variant="danger" size="md" style={{ flex: 1 }}>Удалить</Btn>
        </div>
      </div>
    </Overlay>
  );
}

// ── Profile modal ─────────────────────────────────────────────
export function ProfileModal({ user, userKeys, onClose, onLogout }) {
  const [privHex, setPrivHex] = useState('');
  const [copied,  setCopied]  = useState('');

  useEffect(() => {
    CE.exportPrivJwk(userKeys.priv).then(jwk => {
      if (jwk.d) {
        const b64 = jwk.d.replace(/-/g, '+').replace(/_/g, '/');
        const hex = [...atob(b64)].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
        setPrivHex(hex);
      }
    });
  }, [userKeys.priv]);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const MonoBox = ({ value, copyKey, accent = '#00d4be' }) => (
    <div
      onClick={() => copy(value, copyKey)}
      title="Нажми чтобы скопировать"
      style={{
        background: 'rgba(0,0,0,.3)', borderRadius: 8, padding: '10px 12px',
        fontFamily: 'var(--mono)', fontSize: 9, wordBreak: 'break-all', lineHeight: 1.7,
        color: accent, cursor: 'pointer', position: 'relative', userSelect: 'all',
      }}>
      {value || 'загружается…'}
      <span style={{ position: 'absolute', top: 6, right: 8, fontSize: 10, opacity: .7 }}>
        {copied === copyKey ? '✓ copied' : 'copy'}
      </span>
    </div>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{
        background: 'var(--s1)', border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 16, padding: '26px', maxWidth: 440, width: '90%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Профиль</h3>
          <button onClick={onClose} style={{ color: 'var(--muted)', fontSize: 18 }}>✕</button>
        </div>

        {/* Identity */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
          background: 'rgba(0,212,190,.05)', border: '1px solid rgba(0,212,190,.12)',
          borderRadius: 12, padding: '14px 16px',
        }}>
          <Avatar name={user} size={48} gradient="135deg,#00d4be,#0099aa"/>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>@{user}</div>
            <div style={{ fontSize: 11, color: '#00d4be', marginTop: 2 }}>
              ECDH P-256 · Double Ratchet · E2EE
            </div>
          </div>
        </div>

        {/* Public key */}
        <div style={{ marginBottom: 12 }}>
          <FieldLabel color="#00d4be">ПУБЛИЧНЫЙ КЛЮЧ — твой адрес в сети</FieldLabel>
          <MonoBox value={userKeys.pubHex} copyKey="pub" accent="#3d5a6e"/>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
            Безопасно делиться. Используется для поиска тебя в сети.
          </p>
        </div>

        {/* Private key */}
        <div style={{ marginBottom: 20 }}>
          <FieldLabel color="#f472b6">ПРИВАТНЫЙ КЛЮЧ — для восстановления аккаунта</FieldLabel>
          <MonoBox value={privHex} copyKey="priv" accent="#f472b6"/>
          <p style={{ fontSize: 10, color: '#f87171', marginTop: 5, lineHeight: 1.5 }}>
            ⚠️ Не показывай никому. Потеря ключа = потеря аккаунта навсегда.
          </p>
        </div>

        <Btn onClick={onLogout} variant="danger" size="md">
          Выйти из аккаунта
        </Btn>
      </div>
    </Overlay>
  );
}

// ── Add contact dialog (by pubKey or username) ─────────────────
export function AddContactDialog({ onAdd, onClose, wsReady }) {
  const [mode,    setMode]    = useState('username'); // 'username' | 'pubkey'
  const [val,     setVal]     = useState('');
  const [alias,   setAlias]   = useState('');
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');

  const submit = async () => {
    setErr('');
    if (!val.trim()) { setErr('Заполни поле'); return; }
    setLoading(true);
    try {
      if (mode === 'pubkey') {
        // Добавляем по публичному ключу напрямую
        const hexVal = val.trim().toLowerCase();
        if (!/^[0-9a-f]{130}$/.test(hexVal)) {
          setErr('Неверный формат публичного ключа (130 hex-символов)'); setLoading(false); return;
        }
        const contactID = alias.trim() || hexVal.slice(0, 16);
        onAdd({ id: contactID, pubKey: hexVal, source: 'pubkey' });
      } else {
        // Добавляем по username — нужен сервер
        if (!wsReady) {
          setErr('Сервер недоступен. Используй поиск по публичному ключу.'); setLoading(false); return;
        }
        onAdd({ id: val.trim(), pubKey: null, source: 'username' });
      }
    } catch(e) {
      setErr('Ошибка: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div className="fade-in" style={{
        background: 'var(--s1)', border: '1px solid rgba(255,255,255,.07)',
        borderRadius: 16, padding: '26px', maxWidth: 420, width: '90%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800 }}>Добавить контакт</h3>
          <button onClick={onClose} style={{ color: 'var(--muted)', fontSize: 18 }}>✕</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16,
          background: 'rgba(0,0,0,.2)', borderRadius: 9, padding: 3 }}>
          {[
            { id: 'username', icon: '👤', label: 'По username', note: 'требует сервер' },
            { id: 'pubkey',   icon: '🔑', label: 'По публичному ключу', note: 'offline' },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setMode(tab.id); setVal(''); setErr(''); }}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                background: mode === tab.id ? 'var(--s2)' : 'transparent',
                border: mode === tab.id ? '1px solid rgba(255,255,255,.08)' : '1px solid transparent',
                color: mode === tab.id ? 'var(--text)' : 'var(--muted)',
                transition: 'all .15s', textAlign: 'center',
              }}>
              {tab.icon} {tab.label}
              <div style={{ fontSize: 9, fontWeight: 400, marginTop: 2, opacity: .6 }}>{tab.note}</div>
            </button>
          ))}
        </div>

        {mode === 'username' && (
          <>
            {!wsReady && (
              <div style={{ background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.15)',
                borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: '#fbbf24' }}>
                ⚠️ Сервер недоступен. Для поиска по username нужно подключение.
              </div>
            )}
            <Card accent="var(--accent)">
              <FieldLabel>USERNAME</FieldLabel>
              <input value={val} onChange={e => setVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="alice, bob…"
                style={{ fontSize: 18, fontWeight: 700, width: '100%' }} autoFocus/>
            </Card>
          </>
        )}

        {mode === 'pubkey' && (
          <>
            <div style={{ background: 'rgba(0,212,190,.05)', border: '1px solid rgba(0,212,190,.12)',
              borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: '#00d4be' }}>
              ✓ Работает без сервера. Попроси собеседника показать публичный ключ в профиле.
            </div>
            <Card accent="#a78bfa">
              <FieldLabel color="#a78bfa">ПУБЛИЧНЫЙ КЛЮЧ (130 hex-символов)</FieldLabel>
              <textarea value={val} onChange={e => setVal(e.target.value)}
                placeholder="04a1b2c3…"
                style={{ width: '100%', fontSize: 10, fontFamily: 'var(--mono)',
                  color: '#c4b5fd', lineHeight: 1.6, resize: 'none', minHeight: 54 }} autoFocus/>
            </Card>
            <Card>
              <FieldLabel color="var(--muted)">ПСЕВДОНИМ (необязательно)</FieldLabel>
              <input value={alias} onChange={e => setAlias(e.target.value)}
                placeholder="как назвать этот контакт"
                style={{ fontSize: 15, fontWeight: 600, width: '100%' }}/>
            </Card>
          </>
        )}

        {err && (
          <div className="shake" style={{
            background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.2)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#f87171',
          }}>⚠️ {err}</div>
        )}

        <Btn onClick={submit} disabled={loading || !val.trim()} variant="primary" size="md">
          {loading ? <><Spinner size={16} color="#021a17"/> Поиск…</> : 'Добавить →'}
        </Btn>
      </div>
    </Overlay>
  );
}
