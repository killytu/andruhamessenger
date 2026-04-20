// components/Bubble.jsx
import { RouteBadge } from './ui.jsx';

export function Bubble({ msg, showEnc, isRead }) {
  const isMe = msg.from === 'me';
  const time  = msg.time
    ? new Date(msg.time).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : '';

  if (msg.from === 'system') {
    return (
      <div className="msg-in" style={{
        textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '4px 0',
      }}>{msg.text}</div>
    );
  }

  return (
    <div className="msg-in" style={{
      display: 'flex', gap: 8, alignItems: 'flex-end',
      flexDirection: isMe ? 'row-reverse' : 'row',
    }}>
      {!isMe && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#6d28d9,#00d4be)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: '#fff',
        }}>{msg.from?.[0]?.toUpperCase()}</div>
      )}

      <div style={{ maxWidth: '68%' }}>
        {!isMe && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, paddingLeft: 2 }}>
            @{msg.from}
          </div>
        )}

        <div style={{
          background: isMe
            ? 'linear-gradient(135deg,rgba(0,212,190,.12),rgba(0,212,190,.05))'
            : 'var(--s2)',
          border: isMe
            ? '1px solid rgba(0,212,190,.18)'
            : '1px solid rgba(255,255,255,.05)',
          borderRadius: isMe ? '14px 3px 14px 14px' : '3px 14px 14px 14px',
          padding: '9px 13px',
        }}>
          {/* SECURITY: React автоматически эскейпит {msg.text} — XSS невозможен */}
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>{msg.text}</p>

          {showEnc && msg.enc && (
            <div style={{ marginTop: 7, padding: '7px 10px', background: 'rgba(0,0,0,.4)', borderRadius: 7 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 8.5, lineHeight: 1.8 }}>
                <div style={{ color: '#00d4be', fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>
                  ▸ AES-256-GCM · idx:{msg.enc.idx ?? '—'}
                </div>
                <div>
                  <span style={{ color: '#f472b6' }}>iv: </span>
                  <span style={{ color: '#3d5a6e' }}>{msg.enc.iv}</span>
                </div>
                <div style={{ marginTop: 2 }}>
                  <span style={{ color: '#a78bfa' }}>ct: </span>
                  <span style={{ color: '#1e2d3d' }}>{msg.enc.ct?.slice(0, 72)}…</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 4, alignItems: 'center', marginTop: 3,
          justifyContent: isMe ? 'flex-end' : 'flex-start',
          fontSize: 10, color: 'var(--dim)', paddingInline: 2,
        }}>
          {msg.via && <RouteBadge mode={msg.via} />}
          {isMe && msg.status === 'sending'   && <span style={{ color: 'var(--muted)' }}>⏳</span>}
          {isMe && msg.status === 'delivered' && <span style={{ color: 'var(--muted)' }}>✓</span>}
          {isMe && msg.status === 'read'      && <span style={{ color: '#00d4be' }}>✓✓</span>}
          {isMe && msg.status === 'queued'    && <span style={{ color: '#fbbf24' }}>⏸</span>}
          {isMe && msg.status === 'failed'    && <span style={{ color: '#f87171' }}>✗</span>}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}
