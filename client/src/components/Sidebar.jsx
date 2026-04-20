// components/Sidebar.jsx — список контактов
import { useState } from 'react';
import { Avatar, StatusDot } from './ui.jsx';

export function Sidebar({
  user, wsStatus,
  contacts, messages, p2pStatus,
  activeChat, onSelect,
  onAddContact, onDeleteChat,
  onOpenProfile,
  queueCount,
}) {
  const [deleteHover, setDeleteHover] = useState(null);

  const unread = (id) => {
    const msgs = messages[id] || [];
    return msgs.filter(m => m.from !== 'me' && m.status !== 'read').length;
  };

  const lastMsg = (id) => {
    const msgs = messages[id] || [];
    const m = msgs.filter(m => m.from !== 'system').slice(-1)[0];
    if (!m) return null;
    return { text: m.text, isMe: m.from === 'me' };
  };

  const wsSt = wsStatus === 'connected' ? 'connected'
             : wsStatus === 'connecting' ? 'connecting' : 'offline';

  return (
    <div style={{
      width: 252, background: 'var(--s1)', flexShrink: 0,
      borderRight: '1px solid rgba(255,255,255,.04)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Header ─────────────────────────────────── */}
      <div style={{ padding: '14px 12px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            onClick={onOpenProfile}
            title="Открыть профиль"
            style={{
              background: 'linear-gradient(135deg,#00d4be,#0099aa)',
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, fontSize: 15, color: '#021a17',
              transition: 'transform .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.07)'}
            onMouseLeave={e => e.currentTarget.style.transform = ''}
          >
            {user[0]?.toUpperCase()}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>@{user}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <StatusDot status={wsSt}/>
              <span style={{
                fontSize: 9.5,
                color: wsSt === 'connected' ? '#00d4be' : wsSt === 'connecting' ? '#fbbf24' : '#f87171',
              }}>
                {wsSt === 'connected' ? 'Онлайн · E2EE' : wsSt === 'connecting' ? 'Подключение…' : 'Offline'}
              </span>
              {queueCount > 0 && (
                <span style={{
                  background: 'rgba(251,191,36,.15)', color: '#fbbf24',
                  fontSize: 9, borderRadius: 4, padding: '1px 5px', fontWeight: 700,
                }}>⏸ {queueCount}</span>
              )}
            </div>
          </div>

          {/* Add contact button */}
          <button
            onClick={onAddContact}
            title="Добавить контакт"
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'rgba(0,212,190,.1)', border: '1px solid rgba(0,212,190,.2)',
              color: '#00d4be', fontSize: 18, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>+</button>
        </div>
      </div>

      {/* ── Contact list ───────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {Object.keys(contacts).length === 0 ? (
          <div style={{
            padding: '20px 12px', textAlign: 'center',
            fontSize: 11, color: 'var(--dim)', lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            Нажми <strong style={{ color: 'var(--muted)' }}>+</strong> чтобы добавить контакт.<br/>
            <span style={{ fontSize: 10, color: '#1e2d3d' }}>
              Работает по username (сервер)<br/>или по публичному ключу (offline).
            </span>
          </div>
        ) : (
          Object.entries(contacts).map(([id, info]) => {
            const u      = unread(id);
            const last   = lastMsg(id);
            const cP2P   = p2pStatus[id] || 'none';
            const isActive = activeChat === id;

            return (
              <div
                key={id}
                style={{ position: 'relative' }}
                onMouseEnter={() => setDeleteHover(id)}
                onMouseLeave={() => setDeleteHover(null)}
              >
                <button
                  onClick={() => onSelect(id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 8px', borderRadius: 9, textAlign: 'left', marginBottom: 1,
                    background: isActive ? 'rgba(0,212,190,.07)' : 'transparent',
                    border: isActive ? '1px solid rgba(0,212,190,.14)' : '1px solid transparent',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar name={id} size={36}/>
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 9, height: 9, borderRadius: '50%',
                      background: cP2P === 'connected' ? '#a78bfa'
                                : info.online ? '#00d4be' : '#4a6275',
                      border: '2px solid var(--s1)',
                    }}/>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontWeight: u > 0 ? 800 : 700, fontSize: 13,
                    }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                        @{id}
                      </span>
                      {u > 0 && (
                        <span style={{
                          background: '#00d4be', color: '#021a17',
                          borderRadius: 10, padding: '1px 6px',
                          fontSize: 9, fontWeight: 800, flexShrink: 0,
                        }}>{u}</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 10, color: u > 0 ? 'var(--muted)' : 'var(--dim)',
                      fontWeight: u > 0 ? 600 : 400,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: 148, marginTop: 1,
                    }}>
                      {last
                        ? `${last.isMe ? 'Ты: ' : ''}${last.text}`
                        : info.pubKey
                          ? cP2P === 'connected' ? '🔗 P2P активен' : '🔑 Ключ получен'
                          : '⏳ Ожидание ключа'}
                    </div>
                  </div>
                </button>

                {/* Delete button on hover */}
                {deleteHover === id && (
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteChat(id); }}
                    title="Удалить чат"
                    className="fade-in"
                    style={{
                      position: 'absolute', right: 4, top: '50%',
                      transform: 'translateY(-50%)',
                      width: 22, height: 22, borderRadius: 6,
                      background: 'rgba(248,113,113,.1)', color: '#f87171',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11,
                    }}>✕</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
