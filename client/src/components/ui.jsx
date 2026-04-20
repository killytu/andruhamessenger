// components/ui.jsx — атомарные UI компоненты

export const CSS_VARS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#050810;--s1:#090d16;--s2:#0f1520;--s3:#161e2e;
    --accent:#00d4be;--purple:#a78bfa;--pink:#f472b6;--amber:#fbbf24;
    --text:#e2eaf4;--muted:#4a6275;--dim:#1e2d3d;
    --font:'Outfit',sans-serif;--mono:'JetBrains Mono',monospace;
  }
  body{font-family:var(--font);background:var(--bg);color:var(--text);height:100vh;overflow:hidden}
  input,button,textarea{font-family:var(--font)}
  button{cursor:pointer;border:none;outline:none;background:none;color:inherit}
  input,textarea{outline:none;border:none;background:transparent;color:var(--text)}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-thumb{background:rgba(0,212,190,.15);border-radius:2px}
  ::selection{background:rgba(0,212,190,.2)}

  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes msgIn {from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
  @keyframes blink {0%,100%{opacity:1}50%{opacity:.15}}
  @keyframes spin  {to{transform:rotate(360deg)}}
  @keyframes shake {0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}

  .fade-up   {animation:fadeUp   .45s cubic-bezier(.16,1,.3,1) both}
  .fade-in   {animation:fadeIn   .25s ease both}
  .msg-in    {animation:msgIn    .2s  ease both}
  .blink     {animation:blink    2s   ease infinite}
  .spin      {animation:spin     .85s linear infinite}
  .shake     {animation:shake    .3s  ease}
  .slide-down{animation:slideDown.2s  ease both}
`;

export function Spinner({ size = 44, color = '#00d4be' }) {
  return (
    <div className="spin" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${color}18`, borderTopColor: color,
    }}/>
  );
}

export function RouteBadge({ mode }) {
  const cfg = {
    p2p:   { c: '#a78bfa', i: '🔗', l: 'P2P' },
    relay: { c: '#00d4be', i: '🌐', l: 'Relay' },
  }[mode] || { c: '#4a6275', i: '?', l: mode };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: `${cfg.c}12`, border: `1px solid ${cfg.c}28`,
      borderRadius: 5, padding: '1px 7px', fontSize: 9.5, color: cfg.c, fontWeight: 600,
    }}>{cfg.i} {cfg.l}</span>
  );
}

export function StatusDot({ status }) {
  const color = {
    connected:  '#00d4be',
    connecting: '#fbbf24',
    offline:    '#f87171',
  }[status] || '#4a6275';
  return (
    <span className={status === 'connected' ? 'blink' : ''} style={{
      width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: color,
    }}/>
  );
}

export function Avatar({ name, size = 36, gradient = '135deg,#6d28d9,#00d4be' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(${gradient})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.38, color: '#fff', userSelect: 'none',
    }}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export function Banner({ type, children }) {
  const cfg = {
    warning:  { bg: 'rgba(251,191,36,.05)',  border: 'rgba(251,191,36,.15)',  color: '#fbbf24' },
    info:     { bg: 'rgba(0,212,190,.04)',   border: 'rgba(0,212,190,.1)',    color: '#00d4be' },
    p2p:      { bg: 'rgba(167,139,250,.05)', border: 'rgba(167,139,250,.12)', color: '#c4b5fd' },
    error:    { bg: 'rgba(248,113,113,.05)', border: 'rgba(248,113,113,.15)', color: '#f87171' },
  }[type] || {};
  return (
    <div className="fade-in" style={{
      background: cfg.bg, borderBottom: `1px solid ${cfg.border}`,
      padding: '6px 16px', fontSize: 11, color: cfg.color,
      display: 'flex', gap: 7, alignItems: 'center',
    }}>{children}</div>
  );
}

// Карточка для форм
export function Card({ children, accent, style = {} }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,.2)',
      border: `1px solid ${accent ? `${accent}28` : 'rgba(255,255,255,.07)'}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
      ...style,
    }}>{children}</div>
  );
}

export function FieldLabel({ color = '#00d4be', children }) {
  return (
    <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function Btn({ onClick, disabled, variant = 'primary', size = 'md', children, style = {} }) {
  const variants = {
    primary:  { bg: 'linear-gradient(135deg,#00d4be,#009e8e)', color: '#021a17', border: 'none' },
    ghost:    { bg: 'rgba(255,255,255,.05)', color: 'var(--muted)', border: '1px solid rgba(255,255,255,.1)' },
    danger:   { bg: 'rgba(248,113,113,.08)', color: '#f87171', border: '1px solid rgba(248,113,113,.2)' },
    purple:   { bg: 'linear-gradient(135deg,#a78bfa,#7c3aed)', color: '#fff', border: 'none' },
    accent:   { bg: 'rgba(0,212,190,.1)', color: '#00d4be', border: '1px solid rgba(0,212,190,.2)' },
  };
  const sizes = {
    sm: { padding: '5px 11px', fontSize: 11 },
    md: { padding: '11px 20px', fontSize: 14 },
    lg: { padding: '13px 24px', fontSize: 15 },
  };
  const v = disabled
    ? { bg: 'rgba(255,255,255,.04)', color: 'var(--muted)', border: '1px solid transparent' }
    : variants[variant] || variants.primary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size], ...v, background: v.bg, borderRadius: 10,
        fontWeight: 700, transition: 'all .2s', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
