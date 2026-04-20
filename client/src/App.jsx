// App.jsx — тонкий роутер. Вся логика в screens/ и components/
import { useState, useEffect } from 'react';
import { Session } from './session.js';
import { WSClient } from './lib/ws.js';
import { WebRTCManager } from './lib/webrtc.js';

import { CSS_VARS, Spinner } from './components/ui.jsx';
import { WelcomeBack, AuthScreen, RegisterScreen, LoginScreen } from './screens/Auth.jsx';
import { ChatScreen } from './screens/Chat.jsx';

// Singleton экземпляры — живут всё время работы приложения
const wsClient  = new WSClient({});
const rtcClient = new WebRTCManager({
  onMessage:      () => {},
  onStatusChange: () => {},
  sendSignal:     () => {},
  onIPWarning:    () => {},
});

export default function App() {
  const [screen,      setScreen]      = useState('loading');
  const [user,        setUser]        = useState('');
  const [userKeys,    setUserKeys]    = useState(null);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    const sess = Session.load();
    setScreen(sess ? 'welcome' : 'auth');
  }, []);

  const resumeSession = async () => {
    const sess = Session.load();
    if (!sess) { setScreen('auth'); return; }
    try {
      const keys = await Session.restoreKeys(sess);
      setUser(sess.username);
      setUserKeys(keys);
      setScreen('chat');
    } catch(e) {
      console.error('Session restore failed:', e);
      Session.clear();
      setScreen('auth');
    }
  };

  const finishRegister = async (name, keys) => {
    await Session.save(name, keys.priv, keys.pubHex);
    setUser(name); setUserKeys(keys); setServerError('');
    setScreen('chat');
  };

  const finishLogin = async (name, keys) => {
    await Session.save(name, keys.priv, keys.pubHex);
    setUser(name); setUserKeys(keys);
    setScreen('chat');
  };

  const logout = () => {
    Session.clear();
    rtcClient.closeAll?.();
    // Сбрасываем WS state без пересоздания объекта
    wsClient.destroy?.();
    wsClient._destroyed = false;
    wsClient.userID = null; wsClient.pubKey = null;
    setUser(''); setUserKeys(null); setServerError('');
    setScreen('auth');
  };

  const savedSess = Session.load();

  return (
    <>
      <style>{CSS_VARS}</style>
      {screen === 'loading' && (
        <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
          <Spinner/>
        </div>
      )}
      {screen === 'welcome' && savedSess && (
        <WelcomeBack sess={savedSess} onResume={resumeSession} onNew={() => { Session.clear(); setScreen('auth'); }}/>
      )}
      {screen === 'auth' && (
        <AuthScreen onRegister={() => setScreen('register')} onLogin={() => setScreen('login')}/>
      )}
      {screen === 'register' && (
        <RegisterScreen onDone={finishRegister} onBack={() => setScreen('auth')} serverError={serverError}/>
      )}
      {screen === 'login' && (
        <LoginScreen onDone={finishLogin} onBack={() => setScreen('auth')}/>
      )}
      {screen === 'chat' && userKeys && (
        <ChatScreen user={user} userKeys={userKeys} ws={wsClient} rtc={rtcClient} onLogout={logout}/>
      )}
    </>
  );
}
