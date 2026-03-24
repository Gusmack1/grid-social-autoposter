import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import { getToken, clearToken, api } from './hooks/useApi.js';
import './styles/theme.css';

function Root() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    api('/auth?action=verify')
      .then(data => { if (data.valid) setUser(data.user); else clearToken(); })
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#94a3b8' }}>
      Loading...
    </div>
  );

  if (!user) return <AuthScreen onLogin={setUser} />;

  return <App user={user} onLogout={() => { clearToken(); setUser(null); }} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
