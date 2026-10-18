'use client';

import { useEffect, useMemo, useState } from 'react';
import Auth from '@/components/Auth';
import Onboarding from '@/components/Onboarding';
import OrganizationAdmin from '@/components/OrganizationAdmin';
import Cashier from '@/components/Cashier';
import Kitchen from '@/components/Kitchen';
import Dashboard from '@/components/Dashboard';
import Admin from '@/components/Admin';
import Orders from '@/components/Orders';
import Station from '@/components/Station';
import Runner from '@/components/Runner';
import Shell from '@/components/Shell';
import { supabase } from '@/lib/supabase';
import { cacheSnapshot, getCachedProfile, getCachedSettings, installSyncListeners, syncNow } from '@/lib/offline';
import type { AppSettings, FeatureFlags, Profile, Role } from '@/lib/types';
import { DEFAULT_FEATURES, canonicalRole, ROLE_LABELS } from '@/lib/types';

export type Mode = 'cashier' | 'kitchen' | 'dashboard' | 'orders' | 'admin' | 'runner' | 'waffle' | 'chole' | 'pav' | 'organizations';

const initialSettings: AppSettings = {
  id: 1,
  event_name: 'FoodDesk',
  event_mode: true,
  event_start_date: null,
  event_end_date: null,
  event_location: '',
  expected_visitors: 0,
  number_stalls: 1,
  number_cashiers: 1,
  number_kitchen_stations: 3,
  currency_symbol: '₹',
  service_day_cutoff_hour: 5,
  kitchen_delay_minutes: 10,
  max_custom_discount_percent: 20,
  require_cash_received: true,
  features: DEFAULT_FEATURES,
};

function isRole(role: Role, ...allowed: Role[]): boolean {
  const current = canonicalRole(role);
  return allowed.map(canonicalRole).includes(current);
}

function allowedModes(profile: Profile, settings: AppSettings): Mode[] {
  const all: Mode[] = [];
  const role = canonicalRole(profile.role);
  const f = settings.features;
  if (profile.is_super_admin) all.push('organizations');
  if (['owner', 'manager', 'cashier'].includes(role) && f.cashier) all.push('cashier');
  if (['owner', 'manager', 'cashier'].includes(role) && f.orders) all.push('orders');
  if (['owner', 'manager', 'kitchen'].includes(role) && f.kitchen) all.push('kitchen', 'waffle', 'chole', 'pav');
  if (['owner', 'manager', 'viewer'].includes(role) && f.dashboard) all.push('dashboard');
  if (['owner', 'manager', 'runner'].includes(role)) all.push('runner');
  if (role === 'owner') all.push('admin');
  if (role === 'manager' && (f.menuManagement || f.discounts)) all.push('admin');
  return all;
}

function queryMode(): Mode | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('mode') as Mode | null;
  return raw && ['cashier', 'kitchen', 'dashboard', 'orders', 'admin', 'runner', 'waffle', 'chole', 'pav', 'organizations'].includes(raw) ? raw : null;
}

function mergeSettings(raw: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...initialSettings,
    ...(raw ?? {}),
    features: { ...DEFAULT_FEATURES, ...((raw?.features ?? {}) as Partial<FeatureFlags>) },
  };
}

async function loadUserContext(session: { user: { id: string } } | null): Promise<{ profile: Profile; settings: AppSettings } | null> {
  if (!session) return null;
  try {
    const { data: p, error: profileError } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    const { data: s, error: settingsError } = p?.organization_id
      ? await supabase.from('app_settings').select('*').eq('organization_id', p.organization_id).eq('outlet_id', p.outlet_id).maybeSingle()
      : { data: null, error: null };
    if (p && !profileError && p.active) {
      const profile = p as Profile;
      const settings = mergeSettings(s as Partial<AppSettings> | undefined);
      await cacheSnapshot({ profile, settings });
      return { profile, settings };
    }
    if (profileError && !settingsError) {
      const cached = await getCachedProfile();
      const cachedSettings = await getCachedSettings();
      if (cached?.active) return { profile: cached, settings: cachedSettings ?? initialSettings };
    }
  } catch {
    const cached = await getCachedProfile();
    const cachedSettings = await getCachedSettings();
    if (cached?.active) return { profile: cached, settings: cachedSettings ?? initialSettings };
  }
  return null;
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
      const context = await loadUserContext(session);
      if (context && alive) {
        setProfile(context.profile);
        setSettings(context.settings);
        const allowed = allowedModes(context.profile, context.settings);
        const requested = queryMode();
        setMode(requested && allowed.includes(requested) ? requested : (allowed[0] ?? 'cashier'));
        setError('');
        void syncNow();
      } else if (alive && session && typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedProfile();
        const cachedSettings = await getCachedSettings();
        if (cached?.active) {
          setProfile(cached);
          setSettings(cachedSettings ?? initialSettings);
          setError('Working from this device while offline.');
        }
      }
      if (alive) setSessionReady(true);
    }
    void bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) { setProfile(null); setSessionReady(true); return; }
      const context = await loadUserContext(session);
      if (context) { setProfile(context.profile); setSettings(context.settings); void syncNow(); }
      setSessionReady(true);
    });
    const cleanupSync = installSyncListeners();
    return () => { alive = false; listener.subscription.unsubscribe(); cleanupSync(); };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase.channel('app-settings-live').on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, payload => {
      const row = payload.new as Partial<AppSettings>;
      if (!row || row.id !== 1) return;
      const merged = mergeSettings({ ...settings, ...row });
      setSettings(merged);
      void cacheSnapshot({ settings: merged });
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile]);

  useEffect(() => { document.title = `${settings.event_name} • ${mode}`; }, [settings.event_name, mode]);

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
  }, []);

  const modes = useMemo(() => profile ? allowedModes(profile, settings) : [], [profile, settings]);
  useEffect(() => { if (profile && !modes.includes(mode)) setMode(modes[0] ?? 'cashier'); }, [profile, modes, mode]);

  if (!sessionReady) return <main className="authPage"><div className="loadingCard">Loading FoodDesk…</div></main>;
  if (!profile) return <Auth />;
  if (!profile.is_super_admin && (!profile.organization_id || !profile.outlet_id || !settings.onboarding_completed)) {
    return <Onboarding settings={settings} onComplete={(next) => { setSettings(mergeSettings(next)); setProfile({ ...profile, organization_id: next.organization_id ?? profile.organization_id, outlet_id: next.outlet_id ?? profile.outlet_id }); }} />;
  }

  const roleLabel = ROLE_LABELS[profile.role];
  const content = mode === 'organizations' && profile.is_super_admin ? <OrganizationAdmin />
    : mode === 'cashier'
    ? <Cashier settings={settings} />
    : mode === 'kitchen'
      ? <Kitchen settings={settings} />
      : mode === 'dashboard'
        ? <Dashboard settings={settings} userName={profile.display_name} nav={{ orders: modes.includes('orders') ? () => setMode('orders') : undefined, runner: modes.includes('runner') ? () => setMode('runner') : undefined, cashier: modes.includes('cashier') ? () => setMode('cashier') : undefined }} />
        : mode === 'orders'
          ? <Orders settings={settings} profile={profile} />
          : mode === 'admin'
            ? <Admin settings={settings} profile={profile} onSettingsChange={setSettings} />
            : mode === 'runner'
              ? <Runner settings={settings} />
              : <Station station={mode as 'waffle' | 'chole' | 'pav'} settings={settings} />;

  return <Shell brand={settings.event_name} roleLabel={roleLabel} userName={profile.display_name} modes={modes} mode={mode} onMode={next => setMode(next as Mode)} onSignOut={() => { void supabase.auth.signOut(); }}>
    {error && <div className="container"><div className="offlineNotice">{error}</div></div>}
    {content}
  </Shell>;
}
