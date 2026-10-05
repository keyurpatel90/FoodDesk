'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="brandMark">🍴</div>
        <h1>Food Event Desk</h1>
        <p className="muted">Sign in to run the event counter, kitchen and dashboard.</p>
        <form onSubmit={signIn} className="stack">
          <label>Email<input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="staff@example.com" /></label>
          <label>Password<input autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary bigbtn" disabled={busy}>{busy ? 'Signing in…' : 'SIGN IN'}</button>
        </form>
        <small className="muted">Ask your administrator to create or enable your staff account.</small>
      </section>
    </main>
  );
}
