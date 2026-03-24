import React, { useState } from 'react';
import { API_BASE } from '../constants.js';
import { setToken } from '../hooks/useApi.js';

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const action = mode === 'login' ? 'login' : mode === 'register' ? 'register' : 'forgot-password';
      const body = mode === 'forgot-password' ? { email } : mode === 'register' ? { email, password, name } : { email, password };

      const res = await fetch(`${API_BASE}/auth?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else if (mode === 'login' && data.token) {
        setToken(data.token);
        onLogin(data.user);
      } else if (data.message) {
        setMessage(data.message);
        if (mode === 'register') setTimeout(() => setMode('login'), 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>Grid Social</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {mode === 'login' ? 'Sign in to your dashboard' : mode === 'register' ? 'Create an account' : 'Reset your password'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} required />
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          {mode !== 'forgot-password' && (
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          {message && <div style={{ color: 'var(--success)', fontSize: 13 }}>{message}</div>}

          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '10px 16px', fontSize: 15 }}>
            {loading ? '...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13 }}>
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('forgot-password')} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', padding: 0, fontSize: 13 }}>Forgot password?</button>
              <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>·</span>
              <button onClick={() => setMode('register')} style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, fontSize: 13 }}>Create account</button>
            </>
          )}
          {mode !== 'login' && (
            <button onClick={() => { setMode('login'); setError(''); setMessage(''); }} style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, fontSize: 13 }}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
