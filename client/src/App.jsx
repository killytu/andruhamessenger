import { useState, useEffect, useRef, useCallback } from 'react';
import { CE, Ratchet } from './crypto.js';
import { WSClient }    from './ws.js';
import { WebRTCManager } from './webrtc.js';
import { Session, Config, DEFAULT_SERVER, jwkDtoHex, hexToPrivJwk, looksLikePubKey } from './session.js';

// ─── THEMES ───────────────────────────────────────────────────
const THEMES = {
  dark: {
    '--bg':'#050810','--s1':'#090d16','--s2':'#0f1520',
    '--accent':'#00d4be','--purple':'#a78bfa',
    '--text':'#e2eaf4','--muted':'#4a6275','--dim':'#1e2d3d',
    '--border':'rgba(255,255,255,.05)',
  },
  midnight: {
    '--bg':'#000000','--s1':'#0a0a0a','--s2':'#111111',
    '--accent':'#00ffcc','--purple':'#bf94ff',
    '--text':'#ffffff','--muted':'#555566','--dim':'#1a1a2e',
    '--border':'rgba(255,255,255,.08)',
  },
  navy: {
    '--bg':'#0a0f1e','--s1':'#0d1427','--s2':'#111c36',
    '--accent':'#4fc3f7','--purple':'#ce93d8',
    '--text':'#e3eaf5','--muted':'#4a6880','--dim':'#1a2a42',
    '--border':'rgba(255,255,255,.06)',
  },
  slate: {
    '--bg':'#1a1a2e','--s1':'#16213e','--s2':'#0f3460',
    '--accent':'#e94560','--purple':'#b57bee',
    '--text':'#eaeaea','--muted':'#7a7a9a','--dim':'#2a2a4e',
    '--border':'rgba(255,255,255,.07)',
  },
  light: {
    '--bg':'#f0f4f8','--s1':'#ffffff','--s2':'#e8edf2',
    '--accent':'#0077cc','--purple':'#7c3aed',
    '--text':'#1a2030','--muted':'#7a8899','--dim':'#c8d4e0',
    '--border':'rgba(0,0,0,.09)',
  },
};

// Применяет CSS переменные темы напрямую к DOM — без перезагрузки страницы
function applyThemeToDom(settings) {
  const theme = THEMES[settings.theme] || THEMES.dark;
  const scale = (settings.scale || 100) / 100;
  const fs    = settings.fontSize || 14;
  const root  = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.fontSize = `${Math.round(fs * scale)}px`;
  // Цвет фона body для предотвращения flash
  document.body.style.background = theme['--bg'] || '#050810';
  document.body.style.color      = theme['--text'] || '#e2eaf4';
}

function buildCSS(settings) {
  const theme = THEMES[settings.theme] || THEMES.dark;
  const scale = (settings.scale||100)/100;
  const fs    = settings.fontSize||14;
  const vars  = Object.entries(theme).map(([k,v])=>`${k}:${v}`).join(';');
  return `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{${vars};--font:'Outfit',sans-serif;--mono:'JetBrains Mono',monospace;font-size:${Math.round(fs*scale)}px;}
  body{font-family:var(--font);background:var(--bg);color:var(--text);height:100vh;overflow:hidden}
  input,button,textarea{font-family:var(--font)}
  button{cursor:pointer;border:none;outline:none;background:none;color:inherit}
  input,textarea{outline:none;border:none;background:transparent;color:var(--text)}
  ::-webkit-scrollbar{width:3px}
  ::-webkit-scrollbar-thumb{background:rgba(127,127,127,.2);border-radius:2px}
  ::selection{background:rgba(127,127,127,.2)}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes msgIn {from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  @keyframes blink {0%,100%{opacity:1}50%{opacity:.1}}
  @keyframes spin  {to{transform:rotate(360deg)}}
  .fade-up{animation:fadeUp .4s cubic-bezier(.16,1,.3,1) both}
  .fade-in{animation:fadeIn .2s ease both}
  .msg-in {animation:msgIn  .16s ease both}
  .blink  {animation:blink  2s   ease infinite}
  .spin   {animation:spin   .85s linear infinite}
  `;
}

// ─── UTILS ────────────────────────────────────────────────────
const b2h = buf => [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const Sp  = ({s=38,c='var(--accent)'}) => <div className="spin" style={{width:s,height:s,borderRadius:'50%',border:`2px solid ${c}20`,borderTopColor:c,flexShrink:0}}/>;
const Av  = ({n='?',s=34,g,c}) => {
  const bg=g||'linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 60%,#008))';
  return <div style={{width:s,height:s,borderRadius:'50%',flexShrink:0,background:bg,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:Math.round(s*.42),color:c||'#021a17'}}>{(n||'?')[0].toUpperCase()}</div>;
};
const Cd  = ({c,a,sx={}}) => <div style={{background:'rgba(0,0,0,.15)',border:`1px solid ${a||'var(--accent)'}30`,borderRadius:12,padding:'12px 14px',marginBottom:9,...sx}}>{c}</div>;
const Lbl = ({t,c}) => <div style={{fontSize:'0.7em',color:c||'var(--accent)',fontWeight:700,letterSpacing:1.5,marginBottom:7,textTransform:'uppercase'}}>{t}</div>;
const Btn = ({children,onClick,variant='primary',disabled,style={}}) => {
  const styles={
    primary:{background:'linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#000))',color:'#021a17'},
    secondary:{background:'rgba(127,127,127,.06)',border:'1px solid rgba(127,127,127,.12)',color:'var(--muted)'},
    danger:{background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.2)',color:'#f87171'},
    ghost:{background:'transparent',border:'1px solid var(--border)',color:'var(--muted)'},
  };
  return <button onClick={onClick} disabled={disabled} style={{padding:'10px 16px',borderRadius:10,fontSize:'0.9em',fontWeight:700,cursor:disabled?'not-allowed':'pointer',opacity:disabled?.5:1,transition:'all .15s',...(styles[variant]||styles.primary),...style}}>{children}</button>;
};

function RBadge({mode}) {
  const m={p2p:{c:'var(--purple)',i:'🔗',l:'P2P'},relay:{c:'var(--accent)',i:'🌐',l:'Relay'}}[mode]||{c:'var(--muted)',i:'?',l:mode};
  return <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:'0.7em',color:m.c,fontWeight:600,background:`color-mix(in srgb,${m.c} 12%,transparent)`,border:`1px solid color-mix(in srgb,${m.c} 28%,transparent)`,borderRadius:5,padding:'1px 6px'}}>{m.i} {m.l}</span>;
}

// ─── CONN STATUS ──────────────────────────────────────────────
function ConnStatus({ wsInfo }) {
  const {status,url,reason,attempt}=wsInfo;
  const clr=status==='connected'?'var(--accent)':status==='connecting'?'#fbbf24':'#f87171';
  const bg =status==='connected'?'rgba(0,200,0,.03)':status==='connecting'?'rgba(251,191,36,.04)':'rgba(248,113,113,.04)';
  return (
    <div style={{background:bg,borderBottom:`1px solid ${clr}22`,padding:'4px 12px',display:'flex',alignItems:'center',gap:7,fontSize:'0.72em',flexShrink:0}}>
      <span style={{color:clr,fontSize:'1.1em'}} className={status==='connecting'?'blink':''}>{status==='connected'?'●':status==='connecting'?'◌':'✗'}</span>
      <span style={{color:clr,fontWeight:700}}>
        {status==='connected'?'Подключён':status==='connecting'?`Подключение… (попытка ${attempt||1})`:'Офлайн'}
      </span>
      <span style={{color:'var(--muted)',fontFamily:'var(--mono)',fontSize:'0.9em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:280}}>{url||'—'}</span>
      {reason&&<span style={{color:'#f87171',fontSize:'0.85em',marginLeft:'auto',flexShrink:0}}>({reason})</span>}
    </div>
  );
}

// ─── SEARCH BOX (в сайдбаре) ──────────────────────────────────
function SearchBox({ ws, serverBase, contacts, userKeys, user, onSelect }) {
  const [q,       setQ]       = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const timer   = useRef(null);
  const wsTimeout = useRef(null);

  const doSearch = async (rawQuery) => {
    const query = rawQuery.trim().replace(/^@+/, '').trim();
    if (!query) { setResults([]); setErr(''); setLoading(false); return; }
    const isPK = looksLikePubKey(query);
    if (!isPK && query.length < 2) { setResults([]); setErr(''); setLoading(false); return; }
    setLoading(true); setErr('');

    // ── Способ 1: WS search — без CORS, работает всегда ──────────────────
    if (ws.isReady) {
      clearTimeout(wsTimeout.current);
      ws.search(query);
      wsTimeout.current = setTimeout(() => {
        // Таймаут WS — пробуем HTTP
        tryHttp(query);
      }, 2500);
      return;
    }

    // ── Способ 2: HTTP API (офлайн пользователи видны) ───────────────────
    await tryHttp(query);
  };

  const tryHttp = async (query) => {
    try {
      const url = `${serverBase}/api/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        setResults(data.users || []);
        setLoading(false);
        return;
      }
    } catch {}
    setLoading(false);
    setErr('Сервер не отвечает — проверь подключение');
  };

  // WS search results
  useEffect(() => {
    const prev = ws.handlers.onSearchResults;
    ws.handlers.onSearchResults = (msg) => {
      prev?.(msg);
      clearTimeout(wsTimeout.current);
      try {
        // WS возвращает UserInfo[] (user_id, pub_key, display_name)
        // HTTP возвращает с полями online и last_seen
        // Нормализуем к одному формату
        const raw = JSON.parse(msg.message || '[]');
        const users = raw.map(u => ({
          user_id:      u.user_id || u.UserID,
          pub_key:      u.pub_key || u.PubKey,
          display_name: u.display_name || u.DisplayName || u.user_id,
          online:       true, // WS результаты = только онлайн пользователи
          last_seen:    Math.floor(Date.now()/1000),
        }));
        setResults(users);
      } catch (e) { console.error('[Search] parse error:', e); }
      setLoading(false);
    };
    return () => { ws.handlers.onSearchResults = prev; clearTimeout(wsTimeout.current); };
  }, [ws]);

  const handleChange = (val) => {
    setQ(val);
    clearTimeout(timer.current);
    const stripped = val.trim().replace(/^@+/, '').trim();
    if (!stripped) { setResults([]); setErr(''); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(() => doSearch(val), 400);
  };

  const formatLastSeen = (ts) => {
    if (!ts) return '';
    const diff = Date.now()/1000 - ts;
    if (diff < 60)       return 'только что';
    if (diff < 3600)     return `${Math.floor(diff/60)} мин назад`;
    if (diff < 86400)    return `${Math.floor(diff/3600)} ч назад`;
    return `${Math.floor(diff/86400)} дн назад`;
  };

  return (
    <div style={{padding:'7px 8px',borderBottom:'1px solid var(--border)'}}>
      <div style={{display:'flex',gap:5,alignItems:'center'}}>
        <div style={{flex:1,display:'flex',alignItems:'center',background:'var(--s2)',border:'1px solid var(--border)',borderRadius:8,padding:'0 9px',gap:6}}>
          <span style={{color:'var(--muted)',fontSize:'0.8em',flexShrink:0}}>🔍</span>
          <input value={q} onChange={e=>handleChange(e.target.value)}
            placeholder="@username или pub_key…"
            style={{flex:1,fontSize:'0.8em',padding:'6px 0'}}/>
          {loading && <Sp s={14} c="var(--accent)"/>}
        </div>
      </div>

      {/* Подсказки */}
      {q.startsWith('@') && !looksLikePubKey(q) && (
        <p style={{fontSize:'0.68em',color:'var(--accent)',marginTop:4}}>@ — поиск по username</p>
      )}
      {looksLikePubKey(q) && (
        <p style={{fontSize:'0.68em',color:'var(--accent)',marginTop:4}}>🔑 Публичный ключ — точный поиск</p>
      )}

      {err && <p style={{fontSize:'0.72em',color:'#f87171',marginTop:4}}>{err}</p>}

      {results.length > 0 && (
        <div style={{marginTop:6,background:'var(--s1)',border:'1px solid var(--border)',borderRadius:9,overflow:'hidden'}}>
          {results.map(u => {
            const alreadyAdded = !!contacts[u.user_id];
            return (
              <div key={u.user_id} style={{
                display:'flex',alignItems:'center',gap:8,padding:'8px 10px',
                borderBottom:'1px solid var(--border)',cursor:'pointer',
                background:'transparent',transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(127,127,127,.06)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                onClick={()=>{
                  onSelect(u);
                  setQ(''); setResults([]);
                }}>
                <div style={{position:'relative',flexShrink:0}}>
                  <Av n={u.display_name||u.user_id} s={30} g='linear-gradient(135deg,var(--purple),var(--accent))' c='#fff'/>
                  <span style={{position:'absolute',bottom:0,right:0,width:7,height:7,borderRadius:'50%',
                    background:u.online?'var(--accent)':'var(--muted)',border:'1.5px solid var(--s1)'}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:'0.88em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {u.display_name||u.user_id}
                    {alreadyAdded && <span style={{fontSize:'0.75em',color:'var(--accent)',marginLeft:5}}>✓ добавлен</span>}
                  </div>
                  <div style={{fontSize:'0.72em',color:'var(--muted)'}}>
                    @{u.user_id} · {u.online ? <span style={{color:'var(--accent)'}}>онлайн</span> : formatLastSeen(u.last_seen)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {q.trim().length >= 2 && !loading && results.length === 0 && !err && (
        <p style={{fontSize:'0.72em',color:'var(--muted)',marginTop:6,textAlign:'center',padding:'6px 0'}}>
          Пользователь не найден
        </p>
      )}
    </div>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────
function SettingsModal({ onClose, onSettingsChange }) {
  const [settings, setSettings] = useState(Config.getSettings());
  const [servers,  setServers]  = useState(Config.getServers());
  const [active,   setActive]   = useState(Config.getActiveServer().id);
  const [addName,  setAddName]  = useState('');
  const [addUrl,   setAddUrl]   = useState('ws://');
  const [addErr,   setAddErr]   = useState('');
  const [testing,  setTesting]  = useState(null);
  const [tab,      setTab]      = useState('appearance');

  const save = (s) => { setSettings(s); Config.saveSettings(s); applyThemeToDom(s); onSettingsChange(s); };

  const switchServer = (srv, ws, user, userKeys, dispName) => {
    Config.setActiveServer(srv.id); setActive(srv.id);
  };

  const addServer = () => {
    if (!addName.trim()) { setAddErr('Введи название'); return; }
    if (!addUrl.startsWith('ws://') && !addUrl.startsWith('wss://')) { setAddErr('URL должен начинаться с ws:// или wss://'); return; }
    Config.addServer(addName, addUrl);
    setServers(Config.getServers()); setAddName(''); setAddUrl('ws://'); setAddErr('');
  };

  const testServer = async (srv) => {
    setTesting(srv.id);
    try {
      await new Promise((res,rej)=>{
        const ws2=new WebSocket(srv.url);
        ws2.onopen=()=>{ws2.close();res();};
        ws2.onerror=()=>rej(new Error('Нет ответа'));
        setTimeout(()=>rej(new Error('Таймаут 5с')),5000);
      });
      alert(`✅ ${srv.name}\n${srv.url}\nДоступен!`);
    } catch(e) { alert(`❌ ${srv.name}\n${srv.url}\nОшибка: ${e.message}`); }
    finally { setTesting(null); }
  };

  const Tb = (id, lbl) => (
    <button onClick={()=>setTab(id)} style={{
      flex:1,padding:'7px',borderRadius:7,fontSize:'0.8em',fontWeight:600,cursor:'pointer',
      background:tab===id?'rgba(127,127,127,.12)':'transparent',
      color:tab===id?'var(--accent)':'var(--muted)',
      border:tab===id?'1px solid var(--border)':'1px solid transparent'}}>
      {lbl}
    </button>
  );

  return (
    <div className="fade-in" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'var(--s1)',border:'1px solid var(--border)',borderRadius:16,padding:'22px',maxWidth:500,width:'95%',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:'1.1em',fontWeight:800}}>⚙️ Настройки</h3>
          <button onClick={onClose} style={{color:'var(--muted)',fontSize:'1.1em',cursor:'pointer'}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:4,marginBottom:14,background:'rgba(0,0,0,.15)',border:'1px solid var(--border)',borderRadius:9,padding:3}}>
          {Tb('appearance','🎨 Вид')}{Tb('servers','🌐 Серверы')}{Tb('privacy','🔒 Приватность')}
        </div>

        {/* Tab: Appearance */}
        {tab==='appearance'&&(
          <div className="fade-in">
            {/* Theme */}
            <Lbl t="Тема оформления"/>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
              {Object.entries(THEMES).map(([key,th])=>{
                const active2=settings.theme===key;
                return (
                  <button key={key} onClick={()=>save({...settings,theme:key})} style={{
                    padding:'10px 6px',borderRadius:10,cursor:'pointer',
                    border:`2px solid ${active2?'var(--accent)':'var(--border)'}`,
                    background:th['--s1'],transition:'all .15s',textAlign:'center'}}>
                    <div style={{display:'flex',gap:3,justifyContent:'center',marginBottom:5}}>
                      {['--accent','--purple','--text'].map(v=>(
                        <span key={v} style={{width:12,height:12,borderRadius:'50%',background:th[v]||'#888',display:'inline-block'}}/>
                      ))}
                    </div>
                    <span style={{fontSize:'0.72em',color:th['--text'],fontWeight:600,textTransform:'capitalize'}}>{key}</span>
                  </button>
                );
              })}
            </div>

            {/* Scale */}
            <Lbl t="Масштаб интерфейса"/>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <input type="range" min={70} max={150} step={5} value={settings.scale||100}
                onChange={e=>save({...settings,scale:Number(e.target.value)})}
                style={{flex:1,accentColor:'var(--accent)'}}/>
              <span style={{fontSize:'0.88em',fontWeight:700,color:'var(--accent)',minWidth:40,textAlign:'right'}}>{settings.scale||100}%</span>
            </div>

            {/* Font size */}
            <Lbl t="Размер шрифта чата"/>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <input type="range" min={11} max={20} step={1} value={settings.fontSize||14}
                onChange={e=>save({...settings,fontSize:Number(e.target.value)})}
                style={{flex:1,accentColor:'var(--accent)'}}/>
              <span style={{fontSize:'0.88em',fontWeight:700,color:'var(--accent)',minWidth:40,textAlign:'right'}}>{settings.fontSize||14}px</span>
            </div>

            {/* Toggles */}
            {[
              {k:'compactMode',     l:'Компактный режим (меньше отступов)'},
              {k:'showEncByDefault',l:'Показывать шифр по умолчанию'},
            ].map(({k,l})=>(
              <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'8px 12px',background:'rgba(0,0,0,.15)',borderRadius:9,border:'1px solid var(--border)'}}>
                <span style={{fontSize:'0.85em'}}>{l}</span>
                <button onClick={()=>save({...settings,[k]:!settings[k]})} style={{
                  width:38,height:20,borderRadius:10,cursor:'pointer',
                  background:settings[k]?'var(--accent)':'var(--muted)',transition:'all .2s',
                  position:'relative',border:'none',flexShrink:0}}>
                  <span style={{position:'absolute',top:2,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'all .2s',
                    left:settings[k]?20:2}}/>
                </button>
              </div>
            ))}

            {/* Preview */}
            <div style={{marginTop:6,padding:'10px 14px',background:'var(--s2)',borderRadius:10,border:'1px solid var(--border)'}}>
              <span style={{fontSize:'0.72em',color:'var(--muted)'}}>Предпросмотр:</span>
              <p style={{fontSize:`${settings.fontSize||14}px`,color:'var(--text)',marginTop:4,lineHeight:1.5}}>
                🔐 ANDRUHA MESSENGER — зашифровано
              </p>
            </div>
          </div>
        )}

        {/* Tab: Servers */}
        {tab==='servers'&&(
          <div className="fade-in">
            <p style={{fontSize:'0.8em',color:'var(--muted)',marginBottom:12,lineHeight:1.6}}>
              Переключение сервера происходит мгновенно без перезапуска.
            </p>
            {servers.map(srv=>{
              const isAct=active===srv.id;
              return (
                <div key={srv.id} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 11px',borderRadius:9,marginBottom:6,cursor:'pointer',
                  background:isAct?'rgba(0,200,180,.06)':'rgba(0,0,0,.1)',
                  border:`1px solid ${isAct?'var(--accent)':'var(--border)'}44`,transition:'all .12s'}}
                  onClick={()=>{ Config.setActiveServer(srv.id); setActive(srv.id); }}>
                  <span style={{flexShrink:0,fontSize:'1em'}}>{isAct?'🟢':'⚪'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:'0.85em',display:'flex',alignItems:'center',gap:5}}>
                      {srv.name}
                      {srv.builtin&&<span style={{fontSize:'0.7em',color:'var(--accent)',background:'rgba(0,200,180,.1)',border:'1px solid rgba(0,200,180,.2)',borderRadius:4,padding:'1px 5px'}}>BUILT-IN</span>}
                    </div>
                    <div style={{fontSize:'0.72em',fontFamily:'var(--mono)',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{srv.url}</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();testServer(srv);}} style={{
                    padding:'3px 7px',borderRadius:6,fontSize:'0.75em',fontWeight:700,cursor:'pointer',flexShrink:0,
                    background:'rgba(167,139,250,.1)',border:'1px solid rgba(167,139,250,.2)',color:'var(--purple)'}}>
                    {testing===srv.id?<Sp s={12} c="var(--purple)"/>:'Ping'}
                  </button>
                  {!srv.builtin&&(
                    <button onClick={e=>{e.stopPropagation();Config.removeServer(srv.id);setServers(Config.getServers());if(active===srv.id){Config.setActiveServer('default');setActive('default');}}} style={{
                      padding:'3px 7px',borderRadius:6,fontSize:'0.75em',cursor:'pointer',flexShrink:0,
                      background:'rgba(248,113,113,.08)',border:'1px solid rgba(248,113,113,.15)',color:'#f87171'}}>✕</button>
                  )}
                </div>
              );
            })}

            <div style={{borderTop:'1px solid var(--border)',paddingTop:12,marginTop:4}}>
              <Lbl t="Добавить сервер" c="var(--muted)"/>
              <Cd c={<><Lbl t="Название"/><input value={addName} onChange={e=>setAddName(e.target.value)} placeholder="Мой сервер" style={{fontSize:'0.9em',fontWeight:600,width:'100%'}}/></>} sx={{marginBottom:7}}/>
              <Cd c={<><Lbl t="URL"/><input value={addUrl} onChange={e=>setAddUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addServer()} placeholder="ws://192.168.1.100:8080/ws" style={{fontSize:'0.8em',fontFamily:'var(--mono)',color:'var(--accent)',width:'100%'}}/></>}/>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
                {['ws://localhost:8080/ws','ws://192.168.1.100:8080/ws','ws://192.168.0.1:8080/ws'].map(u=>(
                  <button key={u} onClick={()=>setAddUrl(u)} style={{fontSize:'0.65em',fontFamily:'var(--mono)',padding:'2px 6px',borderRadius:4,cursor:'pointer',
                    background:'rgba(0,0,0,.15)',border:'1px solid var(--border)',color:'var(--muted)'}}>
                    {u.slice(5).replace('/ws','')}
                  </button>
                ))}
              </div>
              {addErr&&<p style={{fontSize:'0.75em',color:'#f87171',marginBottom:7}}>{addErr}</p>}
              <Btn onClick={addServer} style={{width:'100%'}}>Добавить →</Btn>
            </div>

            <div style={{marginTop:12,background:'rgba(167,139,250,.05)',border:'1px solid rgba(167,139,250,.12)',borderRadius:8,padding:'9px 11px'}}>
              <p style={{fontSize:'0.78em',color:'var(--purple)',lineHeight:1.7}}>
                <strong>Найти IP сервера:</strong><br/>
                Windows: <code style={{fontFamily:'var(--mono)'}}>ipconfig</code> → IPv4<br/>
                Linux: <code style={{fontFamily:'var(--mono)'}}>ip addr show</code> → inet
              </p>
            </div>
          </div>
        )}

        {/* Tab: Privacy */}
        {tab==='privacy'&&(
          <div className="fade-in">
            <Cd c={
              <><Lbl t="Политика хранения данных"/>
              <ul style={{fontSize:'0.82em',color:'var(--muted)',lineHeight:1.8,paddingLeft:16}}>
                <li>Сообщения хранятся <strong style={{color:'var(--text)'}}>только локально</strong></li>
                <li>Сервер хранит: ID, pubkey, display_name, last_seen</li>
                <li>Сообщения на сервере <strong style={{color:'var(--text)'}}>никогда не сохраняются</strong></li>
                <li>Пользователи удаляются через <strong style={{color:'var(--text)'}}>30 дней</strong> неактивности</li>
                <li>Трафик реле <strong style={{color:'var(--text)'}}>зашифрован E2EE</strong></li>
              </ul></>
            } a="rgba(0,200,180,.15)"/>
            <Cd c={
              <><Lbl t="Сервер видит" c="#f87171"/>
              <ul style={{fontSize:'0.82em',color:'var(--muted)',lineHeight:1.8,paddingLeft:16}}>
                <li>Кто с кем общается (user_id отправителя и получателя)</li>
                <li>Время и частоту сообщений</li>
                <li>IP адрес клиента (при подключении)</li>
                <li>Зашифрованные байты (не содержимое)</li>
              </ul></>
            } a="rgba(248,113,113,.2)" sx={{background:'rgba(248,113,113,.04)'}}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PROFILE MODAL ────────────────────────────────────────────
function ProfileModal({ user, displayName, userKeys, ws, onClose, onLogout, onNameChange }) {
  const [privHex,setPrivHex]=useState('…');
  const [copied, setCopied] =useState('');
  const [newName,setNewName]=useState(displayName);
  const [saving, setSaving] =useState(false);
  const [tab,    setTab]    =useState('id');

  useEffect(()=>{ Session.getPrivHex(userKeys.priv).then(h=>setPrivHex(h||'ошибка')); },[]);

  const copy=(t,l)=>{ navigator.clipboard.writeText(t).then(()=>{setCopied(l);setTimeout(()=>setCopied(''),1800);}); };

  const saveName=()=>{
    if(!newName.trim()||newName===displayName)return;
    setSaving(true);
    ws.setName(newName.trim());
    Session.updateDisplayName(newName.trim());
    onNameChange(newName.trim());
    setTimeout(()=>setSaving(false),600);
  };

  const Tb=(id,lbl)=>(
    <button onClick={()=>setTab(id)} style={{flex:1,padding:'6px',borderRadius:7,fontSize:'0.78em',fontWeight:600,cursor:'pointer',
      background:tab===id?'rgba(127,127,127,.12)':'transparent',
      color:tab===id?'var(--accent)':'var(--muted)',
      border:tab===id?'1px solid var(--border)':'1px solid transparent'}}>
      {lbl}
    </button>
  );

  return (
    <div className="fade-in" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
      <div style={{background:'var(--s1)',border:'1px solid var(--border)',borderRadius:16,padding:'20px',maxWidth:420,width:'92%',maxHeight:'88vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{fontSize:'1.1em',fontWeight:800}}>Профиль</h3>
          <button onClick={onClose} style={{color:'var(--muted)',fontSize:'1.1em',cursor:'pointer'}}>✕</button>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:14,background:'rgba(0,200,180,.05)',border:'1px solid rgba(0,200,180,.12)',borderRadius:11,padding:'10px 13px'}}>
          <Av n={displayName||user} s={40}/>
          <div><div style={{fontWeight:800,fontSize:'1em'}}>{displayName||user}</div><div style={{fontSize:'0.78em',color:'var(--muted)'}}>@{user}</div></div>
        </div>

        <div style={{display:'flex',gap:4,marginBottom:12,background:'rgba(0,0,0,.15)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
          {Tb('id','🔑 Ключи')}{Tb('name','✏️ Имя')}
        </div>

        {tab==='id'&&(
          <div className="fade-in">
            <div style={{marginBottom:9}}>
              <Lbl t="Публичный ключ"/>
              <div style={{background:'rgba(0,0,0,.2)',borderRadius:8,padding:'8px 10px',cursor:'pointer',position:'relative'}} onClick={()=>copy(userKeys.pubHex,'pub')}>
                <div style={{fontFamily:'var(--mono)',fontSize:'0.6em',color:'var(--muted)',lineHeight:1.7,wordBreak:'break-all'}}>{userKeys.pubHex}</div>
                <span style={{position:'absolute',top:5,right:7,fontSize:'0.7em',color:'var(--accent)'}}>{copied==='pub'?'✓':'copy'}</span>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <Lbl t="Приватный ключ — для восстановления доступа" c="#f472b6"/>
              <div style={{background:'rgba(0,0,0,.2)',borderRadius:8,padding:'8px 10px',cursor:'pointer',position:'relative'}} onClick={()=>copy(privHex,'priv')}>
                <div style={{fontFamily:'var(--mono)',fontSize:'0.6em',color:'#f472b6',lineHeight:1.7,wordBreak:'break-all'}}>{privHex}</div>
                <span style={{position:'absolute',top:5,right:7,fontSize:'0.7em',color:'#f472b6'}}>{copied==='priv'?'✓':'copy'}</span>
              </div>
              <p style={{fontSize:'0.72em',color:'var(--muted)',marginTop:4}}>⚠️ Храни в безопасном месте.</p>
            </div>
          </div>
        )}

        {tab==='name'&&(
          <div className="fade-in">
            <p style={{fontSize:'0.82em',color:'var(--muted)',marginBottom:10,lineHeight:1.5}}>Имя видят контакты. Username @{user} изменить нельзя.</p>
            <Cd c={<><Lbl t="Новое имя"/><input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveName()} style={{fontSize:'1.1em',fontWeight:700,width:'100%'}}/></>} a="rgba(0,200,180,.2)"/>
            <Btn onClick={saveName} disabled={!newName.trim()||newName===displayName} style={{width:'100%',marginTop:2}}>
              {saving?'Сохранено ✓':'Сохранить'}
            </Btn>
          </div>
        )}

        <div style={{borderTop:'1px solid var(--border)',marginTop:12,paddingTop:10}}>
          <Btn onClick={onLogout} variant="danger" style={{width:'100%'}}>Выйти из аккаунта</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── SMALL MODALS ─────────────────────────────────────────────
function P2PInviteDialog({fromID,fromName,onAccept,onReject}) {
  return (
    <div className="fade-in" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
      <div style={{background:'var(--s1)',border:'1px solid rgba(167,139,250,.3)',borderRadius:14,padding:'24px 26px',maxWidth:320,width:'90%',textAlign:'center'}}>
        <div style={{fontSize:'2.2em',marginBottom:10}}>🔗</div>
        <h3 style={{fontSize:'1em',fontWeight:700,marginBottom:7}}>Запрос P2P</h3>
        <p style={{fontSize:'0.82em',color:'var(--muted)',lineHeight:1.6,marginBottom:18}}>
          <strong style={{color:'var(--text)'}}>{fromName||fromID}</strong> хочет прямое соединение.
        </p>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={onReject} variant="ghost" style={{flex:1,padding:'9px'}}>Отклонить</Btn>
          <Btn onClick={onAccept} style={{flex:1,padding:'9px',background:'linear-gradient(135deg,var(--purple),#6d28d9)'}}>Принять</Btn>
        </div>
      </div>
    </div>
  );
}

function DelConfirm({chatID,name,onConfirm,onCancel}) {
  return (
    <div className="fade-in" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
      <div style={{background:'var(--s1)',border:'1px solid rgba(248,113,113,.2)',borderRadius:13,padding:'20px 22px',maxWidth:280,textAlign:'center'}}>
        <div style={{fontSize:'2em',marginBottom:8}}>🗑️</div>
        <h3 style={{fontWeight:800,marginBottom:6,fontSize:'1em'}}>Удалить чат?</h3>
        <p style={{fontSize:'0.82em',color:'var(--muted)',marginBottom:14,lineHeight:1.5}}>Чат с <strong>{name||chatID}</strong> и все сообщения.</p>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={onCancel} variant="ghost" style={{flex:1,padding:'8px'}}>Отмена</Btn>
          <Btn onClick={onConfirm} variant="danger" style={{flex:1,padding:'8px'}}>Удалить</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── BUBBLE ───────────────────────────────────────────────────
function Bubble({msg,showEnc,fontSize}) {
  const isMe=msg.from==='me';
  const t=msg.time instanceof Date?msg.time:(msg.time?new Date(msg.time):new Date());
  const time=t.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
  return (
    <div className="msg-in" style={{display:'flex',gap:6,alignItems:'flex-end',flexDirection:isMe?'row-reverse':'row'}}>
      {!isMe&&<Av n={msg.fromName||msg.from} s={26} g='linear-gradient(135deg,var(--purple),var(--accent))' c='#fff'/>}
      <div style={{maxWidth:'70%'}}>
        {!isMe&&<div style={{fontSize:'0.7em',color:'var(--muted)',marginBottom:3,paddingLeft:2}}>{msg.fromName||msg.from}</div>}
        <div style={{
          background:isMe?'linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,transparent),color-mix(in srgb,var(--accent) 8%,transparent))':'var(--s2)',
          border:`1px solid ${isMe?'color-mix(in srgb,var(--accent) 22%,transparent)':'var(--border)'}`,
          borderRadius:isMe?'13px 3px 13px 13px':'3px 13px 13px 13px',
          padding:'8px 12px'}}>
          <p style={{fontSize:`${fontSize||14}px`,lineHeight:1.55,wordBreak:'break-word',color:'var(--text)'}}>{msg.text}</p>
          {showEnc&&msg.enc&&(
            <div style={{marginTop:6,padding:'6px 8px',background:'rgba(0,0,0,.35)',borderRadius:6}}>
              <div style={{fontFamily:'var(--mono)',fontSize:'0.62em',lineHeight:1.8}}>
                <div style={{color:'var(--accent)',fontWeight:700,letterSpacing:1,marginBottom:2}}>▸ AES-256-GCM idx:{msg.enc.idx??'—'}</div>
                <div><span style={{color:'#f472b6'}}>iv: </span><span style={{color:'var(--muted)'}}>{msg.enc.iv}</span></div>
                <div><span style={{color:'var(--purple)'}}>ct: </span><span style={{color:'var(--dim)'}}>{msg.enc.ct?.slice(0,64)}…</span></div>
              </div>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center',marginTop:2,justifyContent:isMe?'flex-end':'flex-start',fontSize:'0.7em',color:'var(--dim)',paddingInline:2}}>
          {msg.via&&<RBadge mode={msg.via}/>}
          {isMe&&({sending:'⏳',delivered:<span style={{color:'var(--muted)'}}>✓</span>,read:<span style={{color:'var(--accent)'}}>✓✓</span>,failed:<span style={{color:'#f87171'}}>✗</span>})[msg.status]}
          <span>{time}</span>
        </div>
      </div>
    </div>
  );
}

// ─── CHAT SCREEN ──────────────────────────────────────────────
function ChatScreen({ user, displayName:initDisp, userKeys, ws, onLogout, settings, onSettingsChange }) {
  const [messages,    setMessages]    = useState(()=>Session.loadMessages(user));
  // FIX: загружаем контакты из localStorage при старте
  const [contacts,    setContacts]    = useState(()=>{
    const saved = Session.loadContacts(user);
    // Восстанавливаем ratchet для каждого сохранённого контакта
    // (ratchet восстановится лениво при первом обращении через ensureRatchet)
    return saved;
  });
  const [activeChat,  setActiveChat]  = useState(null);
  const [readCounts,  setReadCounts]  = useState(()=>Session.loadReadCounts(user));
  const [input,       setInput]       = useState('');
  const [showEnc,     setShowEnc]     = useState(settings.showEncByDefault||false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings,setShowSettings]= useState(false);
  const [wsInfo,      setWsInfo]      = useState({status:'connecting',url:Config.getActiveUrl(),attempt:1});
  const [p2pStatus,   setP2pStatus]   = useState({});
  const [p2pPending,  setP2pPending]  = useState(null);
  const [p2pInvite,   setP2pInvite]   = useState(null);
  const [delTarget,   setDelTarget]   = useState(null);
  const [blocked,     setBlocked]     = useState(()=>Session.loadBlocked(user));
  // FIX: blockedRef для доступа к актуальному blocked из async WS handlers
  const blockedRef = useRef([]);
  const [dispName,    setDispName]    = useState(initDisp);
  const [sendErr,     setSendErr]     = useState('');
  // Offline queue — контакты добавленные когда сервер недоступен
  const [offlineQueue,setOfflineQueue]= useState(()=>{
    // Восстанавливаем из localStorage (контакты без pubKey = в очереди)
    const saved = Session.loadContacts(user);
    return Object.entries(saved)
      .filter(([,info])=>!info.pubKey)
      .map(([id])=>({id,addedAt:Date.now()}));
  });

  const bottomRef   = useRef(null);
  const isMounted   = useRef(true);
  const rtcRef      = useRef(null);
  const contactsRef = useRef({});
  const activeChatRef=useRef(null);
  contactsRef.current=contacts;
  activeChatRef.current=activeChat;

  useEffect(()=>{ isMounted.current=true; return()=>{ isMounted.current=false; }; },[]);
  // Синхронизируем ref с состоянием
  useEffect(()=>{ blockedRef.current=blocked; },[blocked]);
  useEffect(()=>{ Session.saveMessages(user,messages); },[messages]);
  // FIX: сохраняем контакты при каждом изменении
  useEffect(()=>{ Session.saveContacts(user,contacts); },[contacts]);
  // FIX: сохраняем readCounts при каждом изменении
  useEffect(()=>{ Session.saveReadCounts(user,readCounts); },[readCounts]);
  useEffect(()=>{
    if(!activeChat)return;
    // FIX: сбрасываем непрочитанные как при переключении чата, так и при получении новых сообщений пока чат открыт
    const tot=(messages[activeChat]||[]).filter(m=>m.from!=='me').length;
    setReadCounts(prev=>({...prev,[activeChat]:tot}));
    const last=[...(messages[activeChat]||[])].reverse().find(m=>m.from!=='me');
    if(last)ws.sendReadReceipt(last.from);
  },[activeChat, messages]);  // зависимость от messages — ключевое исправление

  const unread=id=>Math.max(0,(messages[id]||[]).filter(m=>m.from!=='me').length-(readCounts[id]||0));
  const ss=fn=>{ if(isMounted.current)fn(); };

  const pendingKeys=useRef(new Map());
  const getPubKey=id=>new Promise(resolve=>{
    const arr=pendingKeys.current.get(id)||[];
    arr.push(resolve); pendingKeys.current.set(id,arr);
    if(arr.length===1)ws.getKey(id);
    setTimeout(()=>{ const l=pendingKeys.current.get(id)||[]; const i=l.indexOf(resolve); if(i!==-1)l.splice(i,1); resolve(null); if(!l.length)pendingKeys.current.delete(id); },8000);
  });

  const resolveKey=(id,pk,dn)=>{
    (pendingKeys.current.get(id)||[]).forEach(r=>r(pk));
    pendingKeys.current.delete(id);
    ss(()=>setContacts(p=>({...p,[id]:{...(p[id]||{}),pubKey:pk,displayName:dn||id}})));
  };

  const building=useRef(new Set());
  const ensureRatchet=async id=>{
    const c=contactsRef.current[id]; if(c?.ratchet)return c;
    if(building.current.has(id)){await new Promise(r=>setTimeout(r,250));return contactsRef.current[id];}
    building.current.add(id);
    try{
      let pk=c?.pubKey; if(!pk)pk=await getPubKey(id); if(!pk)return null;
      const saved=Session.loadRatchet(user,id);
      const ratchet=saved?Ratchet.fromSaved(saved):await Ratchet.fromSharedSecret(userKeys.priv,pk,userKeys.pubHex);
      if(!saved)Session.saveRatchet(user,id,ratchet.export());
      const up={...(c||{}),pubKey:pk,ratchet,online:true,displayName:c?.displayName||id};
      contactsRef.current={...contactsRef.current,[id]:up};
      ss(()=>setContacts(p=>({...p,[id]:up})));
      return up;
    }finally{building.current.delete(id);}
  };

  const saveRatchet=(id,r)=>Session.saveRatchet(user,id,r.export());
  const pushMsg=useCallback((cid,msg)=>ss(()=>setMessages(p=>({...p,[cid]:[...(p[cid]||[]),{id:Date.now()+Math.random(),...msg}]}))), []);

  const p2pRef=useRef(null);
  p2pRef.current=async(fromID,enc)=>{
    const isFromBlocked = blockedRef.current.includes(fromID);
    const c=await ensureRatchet(fromID); if(!c?.ratchet)return;
    try{
      const text=await c.ratchet.decrypt(enc.iv,enc.ct,enc.idx??c.ratchet.recvCount);
      saveRatchet(fromID,c.ratchet);
      if(isFromBlocked)return; // ratchet продвинут, сообщение не показываем
      pushMsg(fromID,{from:fromID,fromName:c.displayName,text,enc,via:'p2p',status:'received',time:new Date()});
    }catch(e){
      if(!isFromBlocked) pushMsg(fromID,{from:'system',text:`⚠️ P2P decrypt: ${e.message}`,time:new Date()});
    }
  };

  useEffect(()=>{
    rtcRef.current=new WebRTCManager({
      onMessage:(f,p)=>p2pRef.current?.(f,p),
      onStatusChange:(id,s)=>{
        ss(()=>setP2pStatus(p=>({...p,[id]:s})));
        if(s==='connected')ss(()=>setP2pPending(p=>p===id?null:p));
      },
      sendSignal:(type,to,pl)=>{
        if(!ws.isReady){ss(()=>setSendErr('⚠️ P2P требует сервер для handshake.'));setTimeout(()=>ss(()=>setSendErr('')),4000);return;}
        ws.sendSignal(type,to,pl);
      },
    });
  },[]);

  // ── WS handlers ──────────────────────────────────────────
  useEffect(()=>{
    ws.handlers={
      onStatusChange:info=>ss(()=>setWsInfo(info)),
      onConnect:()=>{
        ss(()=>setWsInfo(p=>({...p,status:'connected'})));
        // Обрабатываем offline queue
        offlineQueue.forEach(({id})=>{ ws.getKey(id); });
        // Запрашиваем pubkey для контактов у которых его нет (после resume сессии)
        const current = contactsRef.current;
        Object.entries(current).forEach(([id, info])=>{
          if(!info.pubKey) ws.getKey(id);
        });
      },
      onDisconnect:()=>ss(()=>setWsInfo(p=>({...p,status:'offline'}))),

      onRegistered:(msg)=>{
        ss(()=>setWsInfo(p=>({...p,status:'connected'})));
        // FIX: НЕ добавляем чужих пользователей автоматически.
        // Обновляем только тех кто уже добавлен (pubKey + online статус).
        if(msg.users?.length) ss(()=>setContacts(p=>{
          const n={...p};
          msg.users.forEach(u=>{
            if(n[u.user_id]) {
              // Уже в контактах — обновляем ключ и статус
              n[u.user_id]={...n[u.user_id],pubKey:u.pub_key,online:true,displayName:u.display_name||u.user_id};
            }
            // Иначе игнорируем — пользователь должен явно добавить контакт через поиск
          });
          return n;
        }));
      },

      onMessage:async(msg)=>{
        const isFromBlocked = blockedRef.current.includes(msg.from);
        const c=await ensureRatchet(msg.from); if(!c?.ratchet)return;
        try{
          const text=await c.ratchet.decrypt(msg.payload.iv,msg.payload.ct,msg.payload.idx??c.ratchet.recvCount);
          saveRatchet(msg.from,c.ratchet); // всегда сохраняем ratchet для sync
          if(isFromBlocked)return;         // молча дропаем — ratchet уже продвинут
          pushMsg(msg.from,{from:msg.from,fromName:c.displayName,text,enc:msg.payload,via:'relay',status:'received',time:new Date()});
        }catch(e){
          if(!isFromBlocked) pushMsg(msg.from,{from:'system',text:`⚠️ Relay decrypt: ${e.message}`,time:new Date()});
        }
      },

      onPubKey:(msg)=>{
        resolveKey(msg.user_id,msg.pub_key,msg.display_name);
        // Если этот пользователь в offline queue — добавляем как контакт
        if(offlineQueue.find(q=>q.id===msg.user_id)){
          ss(()=>setOfflineQueue(p=>p.filter(q=>q.id!==msg.user_id)));
          // Инициализируем ratchet
          ensureRatchet(msg.user_id);
        }
      },

      onDelivered:()=>{
        const ch=activeChatRef.current; if(!ch)return;
        ss(()=>setMessages(p=>{
          const msgs=[...(p[ch]||[])];
          for(let i=msgs.length-1;i>=0;i--)if(msgs[i].from==='me'&&msgs[i].status==='sending'){msgs[i]={...msgs[i],status:'delivered'};break;}
          return{...p,[ch]:msgs};
        }));
      },

      onRead:(msg)=>ss(()=>setMessages(p=>{
        const ch=msg.user_id; if(!p[ch])return p;
        return{...p,[ch]:p[ch].map(m=>m.from==='me'&&['delivered','sending'].includes(m.status)?{...m,status:'read'}:m)};
      })),

      onOnline: (msg)=>ss(()=>setContacts(p=>({...p,[msg.user_id]:{...(p[msg.user_id]||{}),online:true,displayName:msg.display_name||msg.user_id}}))),
      onOffline:(msg)=>ss(()=>setContacts(p=>({...p,[msg.user_id]:{...(p[msg.user_id]||{}),online:false}}))),
      onNameChanged:(msg)=>ss(()=>setContacts(p=>({...p,[msg.user_id]:{...(p[msg.user_id]||{}),displayName:msg.display_name}}))),
      onError:(msg)=>{
        // FIX: 'user_id already taken' при переподключении = наш же старый WS
        // не выходим автоматически — сервер сам выкинет старое соединение
        if(msg.message==='user_id already taken'){
          console.warn('[WS] user_id already taken — retrying in 3s (old connection still alive)');
          setTimeout(()=>{
            if(ws.isReady)ws.register(user,userKeys.pubHex,dispName);
          },3000);
        }
      },

      onWebRTCOffer: (msg)=>ss(()=>setP2pInvite({from:msg.from,fromName:contactsRef.current[msg.from]?.displayName,payload:msg.payload})),
      onWebRTCAnswer:(msg)=>rtcRef.current?.handleAnswer(msg.from,msg.payload),
      onWebRTCIce:   (msg)=>rtcRef.current?.handleICE(msg.from,msg.payload),
      onWebRTCCancel:(msg)=>{
        // FIX: показываем сообщение только если был активный входящий запрос
        if(p2pInvite?.from===msg.from){
          ss(()=>setP2pInvite(null));
          pushMsg(msg.from,{from:'system',text:`@${contactsRef.current[msg.from]?.displayName||msg.from} отменил P2P запрос.`,time:new Date()});
        }
        // Также закрываем P2P если был в статусе connecting (исходящий отменён другой стороной)
        if((p2pStatus[msg.from]||'none')==='connecting'||(p2pStatus[msg.from]||'none')==='connected'){
          rtcRef.current?.close(msg.from);
          ss(()=>setP2pStatus(p=>({...p,[msg.from]:'none'})));
        }
      },
    };

    ws.connect(Config.getActiveUrl());
    ws.register(user,userKeys.pubHex,dispName);
    const t=setInterval(()=>{ if(isMounted.current)setWsInfo(p=>({...p,status:ws.isReady?'connected':'offline'})); },3000);
    return()=>{ clearInterval(t); };
  },[]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages,activeChat]);

  // ── Добавить контакт из поиска ─────────────────────────────
  const addContactFromSearch=async(u)=>{
    const id=u.user_id;
    if(!contacts[id]){
      if(u.pub_key){
        // Мы уже знаем pubKey из результатов поиска — строим ratchet сразу
        const ratchet=await Ratchet.fromSharedSecret(userKeys.priv,u.pub_key,userKeys.pubHex);
        Session.saveRatchet(user,id,ratchet.export());
        ss(()=>setContacts(p=>({...p,[id]:{pubKey:u.pub_key,ratchet,online:u.online||false,displayName:u.display_name||id}})));
      } else if(!ws.isReady) {
        // Офлайн очередь — попробуем получить ключ когда появится соединение
        ss(()=>setOfflineQueue(p=>[...p.filter(q=>q.id!==id),{id,addedAt:Date.now()}]));
        ss(()=>setContacts(p=>({...p,[id]:{pubKey:null,ratchet:null,online:false,displayName:u.display_name||id}})));
        pushMsg(id,{from:'system',text:`📶 Контакт добавлен в очередь. Ключ будет запрошен при восстановлении связи.`,time:new Date()});
      } else {
        ss(()=>setContacts(p=>({...p,[id]:{pubKey:null,ratchet:null,online:false,displayName:u.display_name||id}})));
        ws.getKey(id);
      }
    }
    ss(()=>setActiveChat(id));
  };

  const blockUser = (id) => {
    const wasBlocked = blocked.includes(id);
    const newList = wasBlocked ? blocked.filter(b=>b!==id) : [...blocked, id];
    setBlocked(newList);
    Session.saveBlocked(user, newList);
    if (!wasBlocked) {
      // Блокируем: закрываем P2P, показываем сообщение
      rtcRef.current?.close(id);
      pushMsg(id,{from:'system',text:`🚫 @${contacts[id]?.displayName||id} заблокирован.`,time:new Date()});
    } else {
      // Разблокируем: сбрасываем ratchet чтобы избежать рассинхронизации
      // Если другая сторона слала пока мы блокировали — наш ratchet уже продвинут корректно.
      // Но чистим saved state, чтобы следующий ensureRatchet пересоздал его с актуальными счётчиками.
      // (НЕ удаляем — сохранённый ratchet корректен благодаря fix 3/4 выше)
      pushMsg(id,{from:'system',text:`✅ @${contacts[id]?.displayName||id} разблокирован.`,time:new Date()});
    }
  };

  const isBlocked = (id) => blocked.includes(id);

  const delChat=id=>{
    Session.deleteContact(user,id);
    Session.deleteContactMeta(user,id);
    ss(()=>{
      setMessages(p=>{const n={...p};delete n[id];return n;});
      setContacts(p=>{const n={...p};delete n[id];return n;});
    });
    rtcRef.current?.close(id);
    if(activeChat===id)ss(()=>setActiveChat(null));
    ss(()=>setDelTarget(null));
  };

  const startP2P=()=>{
    if(!activeChat)return;
    if(!ws.isReady){ss(()=>setSendErr('⚠️ P2P требует сервер для handshake.'));setTimeout(()=>ss(()=>setSendErr('')),5000);return;}
    ss(()=>{setP2pPending(activeChat);setP2pStatus(p=>({...p,[activeChat]:'connecting'}));});
    rtcRef.current?.createOffer(activeChat);
  };
  const cancelP2P=()=>{ if(!activeChat)return; ws.sendSignal('webrtc_cancel',activeChat,null); rtcRef.current?.close(activeChat); ss(()=>{setP2pPending(null);setP2pStatus(p=>({...p,[activeChat]:'none'}));}); };
  const stopP2P  =()=>{ if(!activeChat)return; rtcRef.current?.close(activeChat); ss(()=>setP2pStatus(p=>({...p,[activeChat]:'none'}))); };
  const acceptP2P=async()=>{
    if(!p2pInvite)return;
    const{from,payload}=p2pInvite; ss(()=>setP2pInvite(null));
    if(!contacts[from])ss(()=>setContacts(p=>({...p,[from]:{pubKey:null,ratchet:null,online:true,displayName:from}})));
    if(activeChat!==from)ss(()=>setActiveChat(from));
    await rtcRef.current?.handleOffer(from,payload);
  };

  const send=async()=>{
    if(!input.trim()||!activeChat)return;
    // FIX: нельзя отправлять заблокированному пользователю
    if(blockedRef.current.includes(activeChat)){
      ss(()=>setSendErr('🚫 Пользователь заблокирован. Разблокируй чтобы отправить сообщение.'));
      setTimeout(()=>ss(()=>setSendErr('')),4000);
      return;
    }
    const text=input.trim(); setInput(''); setSendErr('');
    const c=await ensureRatchet(activeChat);
    if(!c?.ratchet){ss(()=>setSendErr('⚠️ Нет ключа контакта.'));return;}
    let enc;
    try{enc=await c.ratchet.encrypt(text);saveRatchet(activeChat,c.ratchet);}
    catch(e){ss(()=>setSendErr(`⚠️ Шифрование: ${e.message}`));return;}
    let sentP2P=false;
    try{sentP2P=await rtcRef.current?.send(activeChat,enc)||false;}catch{}
    if(!sentP2P){
      if(!ws.isReady){pushMsg(activeChat,{from:'me',text,enc,via:'relay',status:'failed',time:new Date()});ss(()=>setSendErr('⚠️ Нет сервера.'));return;}
      ws.sendMessage(activeChat,enc);
    }
    pushMsg(activeChat,{from:'me',text,enc,via:sentP2P?'p2p':'relay',status:sentP2P?'delivered':'sending',time:new Date()});
  };

  const chatMsgs=(activeChat?(messages[activeChat]||[]):[]);
  const p2pSt=(activeChat?(p2pStatus[activeChat]||'none'):'none');
  const isP2P=p2pSt==='connected';
  const isPending=activeChat&&p2pPending===activeChat;
  const ci=activeChat?contacts[activeChat]:null;
  const pad=settings.compactMode?'5px 8px':'8px 10px';

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',background:'var(--bg)',overflow:'hidden'}}>
      {p2pInvite    &&<P2PInviteDialog fromID={p2pInvite.from} fromName={p2pInvite.fromName} onAccept={acceptP2P} onReject={()=>setP2pInvite(null)}/>}
      {showProfile  &&<ProfileModal user={user} displayName={dispName} userKeys={userKeys} ws={ws} onClose={()=>setShowProfile(false)} onLogout={onLogout} onNameChange={n=>setDispName(n)}/>}
      {showSettings &&<SettingsModal onClose={()=>setShowSettings(false)} onSettingsChange={onSettingsChange}/>}
      {delTarget    &&<DelConfirm chatID={delTarget} name={contacts[delTarget]?.displayName} onConfirm={()=>delChat(delTarget)} onCancel={()=>setDelTarget(null)}/>}

      <ConnStatus wsInfo={wsInfo}/>

      {sendErr&&(
        <div className="fade-in" style={{background:'rgba(248,113,113,.06)',borderBottom:'1px solid rgba(248,113,113,.14)',padding:'4px 12px',fontSize:'0.75em',color:'#f87171',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          {sendErr}<button onClick={()=>setSendErr('')} style={{cursor:'pointer',color:'#f87171'}}>✕</button>
        </div>
      )}

      {/* Offline queue indicator */}
      {offlineQueue.length > 0 && (
        <div className="fade-in" style={{background:'rgba(251,191,36,.04)',borderBottom:'1px solid rgba(251,191,36,.15)',padding:'3px 12px',fontSize:'0.72em',color:'#fbbf24',display:'flex',gap:6,alignItems:'center'}}>
          📶 В очереди {offlineQueue.length} контакт(ов) — ключи будут получены при подключении к серверу
        </div>
      )}

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        {/* ── Sidebar ──────────────── */}
        <div style={{width:248,background:'var(--s1)',flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
          {/* Header */}
          <div style={{padding:`${settings.compactMode?'10px 10px 8px':'13px 11px 11px'}`,borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setShowProfile(true)} style={{borderRadius:'50%',cursor:'pointer',transition:'filter .15s'}}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.15)'}
                onMouseLeave={e=>e.currentTarget.style.filter=''}>
                <Av n={dispName||user} s={settings.compactMode?30:36}/>
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:'0.88em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dispName||user}</div>
                <div style={{fontSize:'0.65em',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>@{user}</div>
              </div>
              <button onClick={()=>setShowSettings(true)} title="Настройки" style={{
                padding:'4px 7px',borderRadius:7,fontSize:'0.88em',cursor:'pointer',
                background:'rgba(127,127,127,.06)',border:'1px solid var(--border)',color:'var(--muted)'}}>⚙️</button>
            </div>
          </div>

          {/* Search */}
          <SearchBox
            ws={ws}
            serverBase={Config.getHttpBase()}
            contacts={contacts}
            userKeys={userKeys}
            user={user}
            onSelect={addContactFromSearch}
          />

          {/* Contacts list */}
          <div style={{flex:1,overflowY:'auto',padding:'4px'}}>
            {Object.keys(contacts).length===0&&(
              <p style={{fontSize:'0.75em',color:'var(--dim)',padding:'12px 8px',textAlign:'center',lineHeight:1.7}}>
                Найди контакт через поиск выше.
              </p>
            )}
            {Object.entries(contacts).map(([id,info])=>{
              const u=unread(id),cP2P=p2pStatus[id]||'none',last=(messages[id]||[]).slice(-1)[0],nm=info.displayName||id;
              const isQueued=offlineQueue.find(q=>q.id===id);
              return (
                <div key={id} style={{position:'relative',marginBottom:1}}>
                  <button onClick={()=>setActiveChat(id)} style={{
                    width:'100%',display:'flex',alignItems:'center',gap:7,padding:pad,
                    borderRadius:8,textAlign:'left',cursor:'pointer',
                    background:activeChat===id?'color-mix(in srgb,var(--accent) 7%,transparent)':'transparent',
                    border:activeChat===id?'1px solid color-mix(in srgb,var(--accent) 15%,transparent)':'1px solid transparent',
                    transition:'all .12s'}}>
                    <div style={{position:'relative',flexShrink:0}}>
                      <Av n={nm} s={settings.compactMode?28:32} g='linear-gradient(135deg,var(--purple),var(--accent))' c='#fff'/>
                      <span style={{position:'absolute',bottom:0,right:0,width:8,height:8,borderRadius:'50%',
                        background:isQueued?'#fbbf24':cP2P==='connected'?'var(--purple)':info.online?'var(--accent)':'var(--muted)',
                        border:'2px solid var(--s1)'}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:'0.85em',display:'flex',justifyContent:'space-between',gap:3}}>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nm}</span>
                        {u>0&&<span style={{background:'var(--accent)',color:'#021a17',borderRadius:10,padding:'1px 6px',fontSize:'0.72em',fontWeight:800,flexShrink:0}}>{u}</span>}
                      </div>
                      <div style={{fontSize:'0.7em',color:'var(--muted)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:130}}>
                        {blocked.includes(id)?<span style={{color:'#fbbf24'}}>🚫 заблокирован</span>:isQueued?'📶 ожидает':last?(last.from==='me'?'Ты: ':'')+last.text:cP2P==='connected'?'🔗 P2P':''}
                      </div>
                    </div>
                  </button>
                  <button onClick={e=>{e.stopPropagation();setDelTarget(id);}}
                    style={{position:'absolute',right:3,top:'50%',transform:'translateY(-50%)',width:19,height:19,borderRadius:5,fontSize:'0.7em',cursor:'pointer',
                      background:'rgba(248,113,113,.08)',color:'#f87171',display:'flex',alignItems:'center',justifyContent:'center',
                      opacity:0,transition:'opacity .12s'}}
                    onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                    onMouseLeave={e=>e.currentTarget.style.opacity='0'}>✕</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Chat area ────────────── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0}}>
          {/* Topbar */}
          <div style={{height:settings.compactMode?42:50,display:'flex',alignItems:'center',gap:8,padding:'0 10px',background:'var(--s1)',borderBottom:'1px solid var(--border)',flexShrink:0}}>
            {activeChat?(
              <>
                <Av n={ci?.displayName||activeChat} s={settings.compactMode?26:30} g='linear-gradient(135deg,var(--purple),var(--accent))' c='#fff'/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:'0.9em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {ci?.displayName||activeChat}
                    <span style={{fontSize:'0.72em',color:'var(--muted)',fontWeight:400,marginLeft:5}}>@{activeChat}</span>
                  </div>
                  <div style={{fontSize:'0.65em',color:'var(--muted)',display:'flex',gap:4,alignItems:'center',marginTop:1}}>
                    <RBadge mode={isP2P?'p2p':'relay'}/> <span>Ratchet · ECDH P-256</span>
                  </div>
                </div>

                {!isP2P&&!isPending&&p2pSt!=='connecting'&&(
                  <button onClick={startP2P} style={{padding:'3px 9px',borderRadius:7,fontSize:'0.72em',fontWeight:700,cursor:'pointer',
                    background:'color-mix(in srgb,var(--purple) 10%,transparent)',border:'1px solid color-mix(in srgb,var(--purple) 25%,transparent)',color:'var(--purple)',flexShrink:0}}>
                    🔗 P2P
                  </button>
                )}
                {(isPending||p2pSt==='connecting')&&(
                  <div style={{display:'flex',gap:5,alignItems:'center',flexShrink:0}}>
                    <Sp s={11} c="var(--purple)"/><span style={{fontSize:'0.72em',color:'var(--purple)'}}>Handshake…</span>
                    <button onClick={cancelP2P} style={{padding:'2px 6px',borderRadius:6,fontSize:'0.68em',fontWeight:700,cursor:'pointer',
                      background:'rgba(248,113,113,.1)',border:'1px solid rgba(248,113,113,.2)',color:'#f87171'}}>✕</button>
                  </div>
                )}
                {isP2P&&<button onClick={stopP2P} style={{padding:'2px 7px',borderRadius:6,fontSize:'0.68em',cursor:'pointer',color:'var(--muted)',border:'1px solid var(--border)',flexShrink:0}}>✕ P2P</button>}
                <button onClick={()=>setShowEnc(!showEnc)} style={{padding:'3px 8px',borderRadius:7,fontSize:'0.72em',fontWeight:600,cursor:'pointer',
                  background:showEnc?'color-mix(in srgb,var(--accent) 10%,transparent)':'rgba(127,127,127,.05)',
                  border:`1px solid ${showEnc?'color-mix(in srgb,var(--accent) 25%,transparent)':'var(--border)'}`,
                  color:showEnc?'var(--accent)':'var(--muted)',flexShrink:0}}>
                  {showEnc?'🔓':'🔐'}
                </button>
                <button onClick={()=>setDelTarget(activeChat)} style={{padding:'3px 6px',borderRadius:7,fontSize:'0.8em',cursor:'pointer',
                  background:'rgba(248,113,113,.06)',border:'1px solid rgba(248,113,113,.14)',color:'#f87171',flexShrink:0}}>🗑️</button>
                <button onClick={()=>blockUser(activeChat)} title={isBlocked(activeChat)?'Разблокировать':'Заблокировать'} style={{
                  padding:'3px 6px',borderRadius:7,fontSize:'0.8em',cursor:'pointer',flexShrink:0,
                  background:isBlocked(activeChat)?'rgba(251,191,36,.08)':'rgba(127,127,127,.06)',
                  border:`1px solid ${isBlocked(activeChat)?'rgba(251,191,36,.2)':'var(--border)'}`,
                  color:isBlocked(activeChat)?'#fbbf24':'var(--muted)'}}>
                  {isBlocked(activeChat)?'🔓':'🚫'}
                </button>
              </>
            ):(
              <span style={{color:'var(--muted)',fontSize:'0.85em'}}>← Найди контакт через поиск</span>
            )}
          </div>

          {isP2P&&activeChat&&(
            <div className="fade-in" style={{background:'color-mix(in srgb,var(--purple) 5%,transparent)',borderBottom:'1px solid color-mix(in srgb,var(--purple) 10%,transparent)',padding:'4px 12px',fontSize:'0.72em',color:'color-mix(in srgb,var(--purple) 80%,white)',display:'flex',gap:6}}>
              🔗 <strong>P2P активен</strong> — сервер не участвует.
            </div>
          )}

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:`${settings.compactMode?'8px 10px 4px':'12px 13px 6px'}`,display:'flex',flexDirection:'column',gap:settings.compactMode?5:8}}>
            {!activeChat&&(
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'var(--dim)',marginTop:'16vh',textAlign:'center'}}>
                <span style={{fontSize:'2.8em'}}>🔐</span>
                <p style={{fontSize:'0.85em',lineHeight:1.7}}>Найди контакт через поиск слева.</p>
              </div>
            )}
            {chatMsgs.map(m=>m.from==='system'
              ?<div key={m.id} style={{textAlign:'center',fontSize:'0.72em',color:'var(--muted)',padding:'2px 0'}}>{m.text}</div>
              :<Bubble key={m.id} msg={m} showEnc={showEnc} fontSize={settings.fontSize}/>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          {activeChat&&(
            <div style={{padding:settings.compactMode?'6px 9px':'8px 10px',background:'var(--s1)',borderTop:'1px solid var(--border)',display:'flex',gap:7,alignItems:'center'}}>
              <div style={{flex:1,background:'var(--s2)',border:'1px solid var(--border)',borderRadius:10,display:'flex',alignItems:'center',padding:'0 12px'}}>
                <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}
                  placeholder={isP2P?`P2P · @${activeChat}…`:`Relay · @${activeChat}…`}
                  style={{flex:1,fontSize:`${settings.fontSize||14}px`,padding:settings.compactMode?'8px 0':'10px 0'}}/>
              </div>
              <button onClick={send} disabled={!input.trim()} style={{
                width:settings.compactMode?34:38,height:settings.compactMode?34:38,borderRadius:9,flexShrink:0,fontWeight:800,fontSize:'1em',cursor:input.trim()?'pointer':'not-allowed',
                background:input.trim()?isP2P?'linear-gradient(135deg,var(--purple),#6d28d9)':'linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#000))':'rgba(127,127,127,.06)',
                color:input.trim()?'#fff':'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .18s',border:'none'}}>→</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AUTH SCREENS (compact) ───────────────────────────────────
function WelcomeBack({sess,onResume,onNew}) {
  return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,opacity:.2,backgroundImage:`linear-gradient(rgba(127,127,127,.08)1px,transparent 1px),linear-gradient(90deg,rgba(127,127,127,.08)1px,transparent 1px)`,backgroundSize:'50px 50px'}}/>
      <div className="fade-up" style={{position:'relative',textAlign:'center',maxWidth:340,padding:'0 24px'}}>
        <div style={{fontSize:'3em',marginBottom:10}}>👋</div>
        <h2 style={{fontSize:'1.4em',fontWeight:800,marginBottom:6}}>С возвращением!</h2>
        <p style={{fontSize:'0.85em',color:'var(--muted)',marginBottom:18}}>Сохранена сессия:</p>
        <div style={{display:'inline-flex',alignItems:'center',gap:11,background:'color-mix(in srgb,var(--accent) 7%,transparent)',border:'1px solid color-mix(in srgb,var(--accent) 20%,transparent)',borderRadius:12,padding:'11px 18px',marginBottom:24}}>
          <Av n={sess.displayName||sess.username} s={38}/>
          <div style={{textAlign:'left'}}><div style={{fontWeight:800,fontSize:'1em'}}>{sess.displayName||sess.username}</div><div style={{fontSize:'0.75em',color:'var(--muted)'}}>@{sess.username}</div></div>
        </div>
        <div style={{display:'flex',gap:9}}>
          <Btn onClick={onNew} variant="ghost" style={{flex:1}}>Другой аккаунт</Btn>
          <Btn onClick={onResume} style={{flex:2}}>Продолжить →</Btn>
        </div>
      </div>
    </div>
  );
}

function AuthScreen({onRegister,onLogin}) {
  return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,opacity:.2,backgroundImage:`linear-gradient(rgba(127,127,127,.08)1px,transparent 1px),linear-gradient(90deg,rgba(127,127,127,.08)1px,transparent 1px)`,backgroundSize:'50px 50px'}}/>
      <div className="fade-up" style={{position:'relative',textAlign:'center',maxWidth:440,padding:'0 28px'}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:7,marginBottom:24,background:'color-mix(in srgb,var(--accent) 6%,transparent)',border:'1px solid color-mix(in srgb,var(--accent) 20%,transparent)',borderRadius:24,padding:'5px 14px',fontSize:'0.68em',fontWeight:700,letterSpacing:2,color:'var(--accent)'}}>
          <span className="blink" style={{width:5,height:5,borderRadius:'50%',background:'var(--accent)',display:'inline-block'}}/>ANDRUHA MESSENGER
        </div>
        <h1 style={{fontSize:'3em',fontWeight:800,letterSpacing:-2,lineHeight:1.02,marginBottom:10,background:'linear-gradient(150deg,var(--text) 30%,var(--accent) 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>ANDRUHA<br/>MESSENGER</h1>
        <p style={{fontSize:'0.88em',color:'var(--muted)',lineHeight:1.7,marginBottom:28}}>E2E-шифрование · WebRTC P2P · Double Ratchet</p>
        <div style={{display:'flex',gap:9}}>
          <Btn onClick={onLogin} variant="ghost" style={{flex:1}}>🔑 Войти по ключу</Btn>
          <Btn onClick={onRegister} style={{flex:1}}>✦ Создать аккаунт</Btn>
        </div>
        <p style={{marginTop:11,fontSize:'0.7em',color:'var(--dim)'}}>Ключи генерируются локально — сервер их не видит.</p>
      </div>
    </div>
  );
}

function RegisterScreen({onDone,onBack,serverError}) {
  const [step,setStep]=useState(0);const[name,setName]=useState('');const[disp,setDisp]=useState('');const[keys,setKeys]=useState(null);const[ph,setPh]=useState('');
  useEffect(()=>{if(serverError)setStep(0);},[serverError]);
  const go=async()=>{
    if(!name.trim()||name.length<3||name.length>32)return;
    setStep(1);
    const k=await CE.genKeys();const j=await CE.exportPrivJwk(k.priv);
    setKeys(k);setPh(jwkDtoHex(j.d));setStep(2);
  };
  const nameErr=name.length>0&&(name.length<3?'Минимум 3 символа':name.length>32?'Максимум 32 символа':!/^[a-zA-Z0-9_-]+$/.test(name)?'Только латиница, цифры, _ и -':'');
  return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:20}}>
      <div className="fade-up" style={{width:'100%',maxWidth:460}}>
        <button onClick={onBack} style={{fontSize:'0.78em',color:'var(--muted)',marginBottom:10,cursor:'pointer'}}>← Назад</button>
        <h2 style={{fontSize:'1.5em',fontWeight:800,marginBottom:16}}>{step<2?'Новый аккаунт':'Аккаунт создан ✓'}</h2>
        {serverError&&step===0&&<Cd c={<p style={{fontSize:'0.85em',color:'#f87171'}}>⚠️ {serverError}</p>} a="rgba(248,113,113,.25)" sx={{background:'rgba(248,113,113,.04)',marginBottom:9}}/>}
        {step===0&&(<div className="fade-in">
          <Cd c={<><Lbl t="USERNAME (ID)"/><input value={name} onChange={e=>setName(e.target.value.slice(0,32))} onKeyDown={e=>e.key==='Enter'&&!nameErr&&go()} placeholder="alice123 (3-32 символа)" style={{fontSize:'1.1em',fontWeight:800,width:'100%'}} autoFocus/>{nameErr&&<p style={{fontSize:'0.72em',color:'#f87171',marginTop:4}}>{nameErr}</p>}</> } a="color-mix(in srgb,var(--accent) 22%,transparent)"/>
          <Cd c={<><Lbl t="Имя для отображения (опционально)" c="var(--muted)"/><input value={disp} onChange={e=>setDisp(e.target.value.slice(0,64))} placeholder="Alice" style={{fontSize:'1em',fontWeight:600,width:'100%'}}/></>}/>
          <Btn onClick={go} disabled={!!nameErr||!name.trim()} style={{width:'100%'}}>Создать аккаунт →</Btn>
        </div>)}
        {step===1&&(<div className="fade-in" style={{textAlign:'center',padding:'40px 0'}}><Sp/><p style={{fontFamily:'var(--mono)',fontSize:'0.78em',color:'var(--accent)',marginTop:14}}>ECDH P-256 keygen…</p></div>)}
        {step===2&&keys&&(<div className="fade-in">
          <Cd c={<><Lbl t="⚠️ Сохрани приватный ключ" c="#f87171"/><p style={{fontSize:'0.78em',color:'#f87171',lineHeight:1.5,marginBottom:7}}>Единственный способ восстановить доступ к аккаунту.</p>
            <div style={{fontFamily:'var(--mono)',fontSize:'0.62em',color:'#fca5a5',lineHeight:1.8,wordBreak:'break-all',background:'rgba(0,0,0,.3)',borderRadius:6,padding:'7px 9px',cursor:'pointer'}} onClick={()=>navigator.clipboard.writeText(ph)}>{ph}<div style={{fontSize:'0.9em',color:'#f87171',marginTop:3,opacity:.7}}>↑ нажми чтобы скопировать</div></div></>} a="rgba(248,113,113,.3)" sx={{background:'rgba(248,113,113,.04)'}}/>
          <Cd c={<><Lbl t="Публичный ключ (адрес в сети)"/><div style={{fontFamily:'var(--mono)',fontSize:'0.6em',color:'var(--muted)',lineHeight:1.7,wordBreak:'break-all'}}>{keys.pubHex}</div></>}/>
          <Btn onClick={()=>onDone(name.trim(),disp.trim()||name.trim(),keys)} style={{width:'100%',marginTop:2}}>Ключ сохранён. Войти →</Btn>
        </div>)}
      </div>
    </div>
  );
}

function LoginScreen({onDone,onBack}) {
  const[username,setUsername]=useState('');const[keyHex,setKeyHex]=useState('');const[disp,setDisp]=useState('');const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  const go=async()=>{
    if(!username.trim()||!keyHex.trim()){setErr('Заполни все поля');return;}
    setErr('');setLoading(true);
    try{
      const j=hexToPrivJwk(keyHex.trim().toLowerCase());
      const priv=await CE.importPriv(j);
      const fj=await CE.exportPrivJwk(priv);
      const pub=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:fj.x,y:fj.y,ext:true},{name:'ECDH',namedCurve:'P-256'},true,[]);
      const raw=await crypto.subtle.exportKey('raw',pub);
      onDone(username.trim(),disp.trim()||username.trim(),{pub,priv,pubHex:b2h(raw)});
    }catch(e){console.error(e);setErr('Неверный ключ. Нужно 64 hex символа.');}
    finally{setLoading(false);}
  };
  return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:20}}>
      <div className="fade-up" style={{width:'100%',maxWidth:460}}>
        <button onClick={onBack} style={{fontSize:'0.78em',color:'var(--muted)',marginBottom:10,cursor:'pointer'}}>← Назад</button>
        <h2 style={{fontSize:'1.5em',fontWeight:800,marginBottom:7}}>Войти по ключу</h2>
        <p style={{fontSize:'0.82em',color:'var(--muted)',marginBottom:16,lineHeight:1.5}}>Username + приватный ключ (64 hex символа).</p>
        <Cd c={<><Lbl t="Username"/><input value={username} onChange={e=>setUsername(e.target.value.slice(0,32))} placeholder="alice123" style={{fontSize:'1.1em',fontWeight:700,width:'100%'}} autoFocus/></>} a="color-mix(in srgb,var(--accent) 22%,transparent)"/>
        <Cd c={<><Lbl t="Имя (опционально)" c="var(--muted)"/><input value={disp} onChange={e=>setDisp(e.target.value.slice(0,64))} placeholder="Alice" style={{fontSize:'0.95em',fontWeight:600,width:'100%'}}/></>}/>
        <Cd c={<><Lbl t="Приватный ключ (64 hex символа)" c="#f472b6"/><textarea value={keyHex} onChange={e=>setKeyHex(e.target.value)} placeholder="вставь ключ…" style={{width:'100%',fontSize:'0.7em',fontFamily:'var(--mono)',color:'#f472b6',lineHeight:1.6,resize:'none',minHeight:52}}/></>} a="rgba(244,114,182,.2)"/>
        {err&&<div style={{background:'rgba(248,113,113,.06)',border:'1px solid rgba(248,113,113,.2)',borderRadius:8,padding:'6px 11px',marginBottom:8,fontSize:'0.78em',color:'#f87171'}}>⚠️ {err}</div>}
        <Btn onClick={go} disabled={loading||!username.trim()||!keyHex.trim()} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          {loading?<><Sp s={15} c="#021a17"/>Проверяем…</>:'Войти →'}
        </Btn>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────
export default function App() {
  const [screen,    setScreen]    = useState('loading');
  const [user,      setUser]      = useState('');
  const [dispName,  setDispName]  = useState('');
  const [userKeys,  setUserKeys]  = useState(null);
  const [srvErr,    setSrvErr]    = useState('');
  const [settings,  setSettings]  = useState(()=>Config.getSettings());
  const wsRef = useRef(null);
  if (!wsRef.current) wsRef.current = new WSClient({});

  useEffect(()=>{
    // Применяем сохранённую тему сразу при загрузке — до рендера
    applyThemeToDom(Config.getSettings());
    setScreen(Session.load()?'welcome':'auth');
  },[]);

  // Применяем тему и масштаб
  const css = buildCSS(settings);

  const resume=async()=>{
    const s=Session.load();if(!s){setScreen('auth');return;}
    try{const k=await Session.restoreKeys(s);setUser(s.username);setDispName(s.displayName||s.username);setUserKeys(k);setScreen('chat');}
    catch{Session.clear();setScreen('auth');}
  };
  const finishReg=async(name,disp,keys)=>{ await Session.save(name,keys.priv,keys.pubHex,disp);setUser(name);setDispName(disp);setUserKeys(keys);setSrvErr('');setScreen('chat'); };
  const finishLogin=async(name,disp,keys)=>{ await Session.save(name,keys.priv,keys.pubHex,disp);setUser(name);setDispName(disp);setUserKeys(keys);setScreen('chat'); };
  const logout=()=>{ Session.clear();wsRef.current.destroy();wsRef.current=new WSClient({});setUser('');setDispName('');setUserKeys(null);setSrvErr('');setScreen('auth'); };

  if(screen==='loading')return(<div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#050810'}}><style>{css}</style><Sp/></div>);

  const sess=Session.load();
  return (
    <>
      <style>{css}</style>
      {screen==='welcome'&&sess&&<WelcomeBack sess={sess} onResume={resume} onNew={()=>{Session.clear();setScreen('auth');}}/>}
      {screen==='auth'&&<AuthScreen onRegister={()=>setScreen('register')} onLogin={()=>setScreen('login')}/>}
      {screen==='register'&&<RegisterScreen onDone={finishReg} onBack={()=>setScreen('auth')} serverError={srvErr}/>}
      {screen==='login'&&<LoginScreen onDone={finishLogin} onBack={()=>setScreen('auth')}/>}
      {screen==='chat'&&userKeys&&<ChatScreen user={user} displayName={dispName} userKeys={userKeys} ws={wsRef.current} onLogout={logout} settings={settings}
        onSettingsChange={s=>{setSettings(s);applyThemeToDom(s);}}/>}
    </>
  );
}
