'use client';

import { useEffect, useMemo, useState } from 'react';
import Auth from '@/components/Auth';
import Cashier from '@/components/Cashier';
import Kitchen from '@/components/Kitchen';
import Dashboard from '@/components/Dashboard';
import Admin from '@/components/Admin';
import Orders from '@/components/Orders';
import Station from '@/components/Station';
import { supabase } from '@/lib/supabase';
import type { AppSettings, FeatureFlags, Profile, Role } from '@/lib/types';
import { DEFAULT_FEATURES } from '@/lib/types';

type Mode = 'cashier' | 'kitchen' | 'dashboard' | 'orders' | 'admin' | 'waffle' | 'chole' | 'pav';

const roles: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  cashier: 'Cashier',
  kitchen: 'Kitchen',
  treasurer: 'Treasurer',
};

const initialSettings: AppSettings = {
  id: 1,
  event_name: 'Food Event Desk',
  currency_symbol: '₹',
  service_day_cutoff_hour: 5,
  kitchen_delay_minutes: 10,
  max_custom_discount_percent: 20,
  require_cash_received: true,
  features: DEFAULT_FEATURES,
};

function allowedModes(profile: Profile, settings: AppSettings): Mode[] {
  const all: Mode[] = [];
  const f = settings.features;
  if ((profile.role === 'admin' || profile.role === 'manager' || profile.role === 'cashier') && f.cashier) all.push('cashier');
  if ((profile.role === 'admin' || profile.role === 'manager' || profile.role === 'cashier') && f.orders) all.push('orders');
  if ((profile.role === 'admin' || profile.role === 'manager' || profile.role === 'kitchen') && f.kitchen) { all.push('kitchen','waffle','chole','pav'); }
  if ((profile.role === 'admin' || profile.role === 'manager' || profile.role === 'treasurer') && f.dashboard) all.push('dashboard');
  if (profile.role === 'admin') all.push('admin');
  if (profile.role === 'manager' && (f.menuManagement || f.discounts)) all.push('admin');
  return all;
}

function queryMode(): Mode | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('mode') as Mode | null;
  return raw && ['cashier','kitchen','dashboard','orders','admin','waffle','chole','pav'].includes(raw) ? raw : null;
}

export default function Home() {
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [mode, setMode] = useState<Mode>('cashier');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (alive) setSessionReady(true); return; }
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('app_settings').select('*').eq('id', 1).single(),
      ]);
      if (!p || !p.active) {
        await supabase.auth.signOut();
        if (alive) { setError('This account is disabled or its staff profile is missing.'); setSessionReady(true); }
        return;
      }
      const merged: AppSettings = { ...initialSettings, ...(s ?? {}), features: { ...DEFAULT_FEATURES, ...((s?.features ?? {}) as Partial<FeatureFlags>) } };
      if (alive) {
        setProfile(p as Profile);
        setSettings(merged);
        const allowed = allowedModes(p as Profile, merged);
        const requested = queryMode();
        setMode(requested && allowed.includes(requested) ? requested : (allowed[0] ?? 'cashier'));
        setSessionReady(true);
      }
    }
    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) { setProfile(null); setSessionReady(true); return; }
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        supabase.from('app_settings').select('*').eq('id', 1).single(),
      ]);
      if (!p?.active) { await supabase.auth.signOut(); setProfile(null); return; }
      const merged: AppSettings = { ...initialSettings, ...(s ?? {}), features: { ...DEFAULT_FEATURES, ...((s?.features ?? {}) as Partial<FeatureFlags>) } };
      setProfile(p as Profile);
      setSettings(merged);
      const allowed = allowedModes(p as Profile, merged);
      const requested = queryMode();
      setMode(requested && allowed.includes(requested) ? requested : (allowed[0] ?? 'cashier'));
      setSessionReady(true);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('app-settings-live').on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
      const row = payload.new as Partial<AppSettings>;
      if (!row || row.id !== 1) return;
      setSettings(s => ({ ...s, ...row, features: { ...DEFAULT_FEATURES, ...s.features, ...((row.features ?? {}) as Partial<FeatureFlags>) } }));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile]);

  useEffect(() => { document.title = `${settings.event_name} • ${mode}`; }, [settings.event_name, mode]);

  const modes = useMemo(() => profile ? allowedModes(profile, settings) : [], [profile, settings]);
  useEffect(() => { if (profile && !modes.includes(mode)) setMode(modes[0] ?? 'cashier'); }, [profile, modes, mode]);

  if (!sessionReady) return <main className="authPage"><div className="loadingCard">Loading Food Event Desk…</div></main>;
  if (!profile) return <Auth />;

  const content = mode === 'cashier'
    ? <Cashier settings={settings} />
    : mode === 'kitchen'
      ? <Kitchen settings={settings} />
      : mode === 'dashboard'
        ? <Dashboard settings={settings} />
        : mode === 'orders'
          ? <Orders settings={settings} profile={profile} />
          : mode === 'admin'
            ? <Admin settings={settings} profile={profile} onSettingsChange={setSettings} />
            : <Station station={mode} settings={settings} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brandBlock"><div className="brand">🍴 {settings.event_name}</div><div className="subtitle">Food Event Desk • {roles[profile.role]}</div></div>
        <div className="userActions">
          <nav className="tabs top-tabs">{modes.map(k => <button key={k} className={'tab ' + (mode === k ? 'active' : '')} onClick={() => setMode(k)}>{k === 'admin' ? 'Manage' : k === 'orders' ? 'Orders' : k === 'waffle' ? 'Waffle' : k === 'chole' ? 'Chole' : k === 'pav' ? 'Pav' : k.charAt(0).toUpperCase() + k.slice(1)}</button>)}</nav>
          <button className="avatar" title="Sign out" onClick={() => supabase.auth.signOut()}>{profile.display_name.slice(0,1).toUpperCase()}</button>
        </div>
      </header>
      {error && <div className="container"><div className="error">{error}</div></div>}
      {content}
    </div>
  );
}
