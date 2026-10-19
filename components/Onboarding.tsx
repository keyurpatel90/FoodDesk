'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LogOut, Plus, Store, Trash2, UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { saveSettings } from '@/lib/settings';
import type { AppSettings, Profile, ProductUnit } from '@/lib/types';
import { Field } from '@/components/Modal';

type Draft = { name: string; price: string; cost: string; unit_type: ProductUnit; category: string };
const blank = (): Draft => ({ name: '', price: '', cost: '', unit_type: 'piece', category: '' });
const STEPS = [{ label: 'Business', icon: Store }, { label: 'Menu', icon: UtensilsCrossed }, { label: 'Finish', icon: CheckCircle2 }];
const digitsOnly = (v: string) => Array.from(v).filter(c => c >= '0' && c <= '9').join('');
const errorText = (e: unknown, fallback: string): string => {
  const message = e && typeof e === 'object' ? (e as { message?: unknown }).message : undefined;
  return typeof message === 'string' && message ? message : fallback;
};

export default function Onboarding({ settings, profile, onComplete }: { settings: AppSettings; profile: Profile; onComplete: () => Promise<void> }) {
  const needsBusiness = !profile.organization_id || !profile.outlet_id;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [business, setBusiness] = useState(needsBusiness ? '' : settings.business_name === 'FoodDesk' ? '' : settings.business_name);
  const [outletName, setOutletName] = useState('Main Outlet');
  const [outletCode, setOutletCode] = useState('MAIN');
  const [items, setItems] = useState<Draft[]>([blank()]);
  const cur = settings.currency_symbol || '₹';

  const isEmpty = (d: Draft) => !d.name.trim() && !d.price && !d.cost;
  const isComplete = (d: Draft) => !!d.name.trim() && Number(d.price) > 0;
  const valid = items.filter(isComplete);
  const update = (i: number, patch: Partial<Draft>) => setItems(list => list.map((d, n) => n === i ? { ...d, ...patch } : d));

  function next() {
    setMsg('');
    if (step === 1) {
      if (!business.trim()) { setMsg('Enter your business name to continue.'); return; }
      if (needsBusiness && (!outletName.trim() || !outletCode.trim())) { setMsg('Enter a name and a short code for your first outlet.'); return; }
    }
    if (step === 2 && items.some(d => !isEmpty(d) && !isComplete(d))) { setMsg('Give every item a name and a selling price above zero, or remove it.'); return; }
    setStep(step + 1);
  }

  async function finish() {
    setSaving(true); setMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session expired. Please sign in again.');
      const { data: existing } = await supabase.from('profiles').select('organization_id,outlet_id').eq('id', user.id).single();
      let org = existing?.organization_id as string | null | undefined;
      let outlet = existing?.outlet_id as string | null | undefined;

      if (!org || !outlet) {
        const { data: created, error } = await supabase.rpc('create_organization_with_outlet', { p_organization_name: business.trim(), p_outlet_name: outletName.trim() || 'Main Outlet', p_outlet_code: outletCode.trim().toUpperCase() || 'MAIN' });
        if (error) throw error;
        org = created?.organization_id; outlet = created?.outlet_id;
      }
      if (!org || !outlet) throw new Error('Your business could not be created. Run the latest SQL migration in Supabase and try again.');

      // Menu first, then mark setup complete, so a failed save can simply be retried.
      if (valid.length) {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('outlet_id', outlet);
        if (!count) {
          const { error } = await supabase.from('products').insert(valid.map((d, i) => ({ name: d.name.trim(), price: Number(d.price), food_cost: Number(d.cost) || 0, unit_type: d.unit_type, category: d.category.trim() || null, active: true, sort_order: i + 1, organization_id: org, outlet_id: outlet })));
          if (error) throw error;
        }
      }
      await saveSettings(org, outlet, { business_name: business.trim(), onboarding_completed: true });
      await onComplete();
    } catch (e) {
      setMsg(errorText(e, 'Could not finish setup. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return <main className="obPage">
    <section className="obCard">
      <header className="obHead">
        <span className="logo"><UtensilsCrossed size={22} /></span>
        <div><h1>Set up FoodDesk</h1><p className="hint">Three quick steps, then you are ready to take orders.</p></div>
        <button type="button" className="iconBtn obOut" onClick={() => void supabase.auth.signOut()} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
      </header>

      <ol className="obSteps" aria-label="Setup progress">
        {STEPS.map((s, i) => { const n = i + 1; const Icon = s.icon; const state = step === n ? 'active' : step > n ? 'done' : ''; return <li key={s.label} className={state} aria-current={step === n ? 'step' : undefined}><span className="obDot">{step > n ? <Check size={18} /> : <Icon size={18} />}</span><b>{s.label}</b></li>; })}
      </ol>

      <div className="obBody">
        {step === 1 && <>
          <h2>Tell us about your business</h2>
          <p className="hint">This name appears on receipts and across the app.</p>
          <div className="mGrid">
            <Field label="Business name" wide><input autoFocus value={business} onChange={e => setBusiness(e.target.value)} placeholder="e.g. Spice Garden" /></Field>
            {needsBusiness && <>
              <Field label="First outlet name"><input value={outletName} onChange={e => setOutletName(e.target.value)} /></Field>
              <Field label="Outlet code" hint="Short and unique, for example MAIN"><input value={outletCode} maxLength={12} onChange={e => setOutletCode(e.target.value.toUpperCase())} /></Field>
            </>}
          </div>
        </>}

        {step === 2 && <>
          <div className="cardHead"><div><h2>Add what you sell</h2><p className="hint">Price per piece, kg or litre. You can skip this and add items later in Manage.</p></div><button type="button" className="secondary small" onClick={() => setItems(l => [...l, blank()])}><Plus size={16} /> Add item</button></div>
          <div className="obItems">
            {items.map((d, i) => <div className="obItem" key={i}>
              <Field label="Item name" wide><input value={d.name} onChange={e => update(i, { name: e.target.value })} placeholder="e.g. Masala dosa" /></Field>
              <Field label={`Price (${cur})`}><input inputMode="numeric" value={d.price} onChange={e => update(i, { price: digitsOnly(e.target.value) })} /></Field>
              <Field label={`Food cost (${cur})`}><input inputMode="numeric" value={d.cost} onChange={e => update(i, { cost: digitsOnly(e.target.value) })} /></Field>
              <Field label="Sold by"><select value={d.unit_type} onChange={e => update(i, { unit_type: e.target.value as ProductUnit })}><option value="piece">Piece</option><option value="kg">Kilogram</option><option value="litre">Litre</option></select></Field>
              <button type="button" className="iconBtn obDel" aria-label={`Remove item ${i + 1}`} onClick={() => setItems(l => l.length > 1 ? l.filter((_, n) => n !== i) : [blank()])}><Trash2 size={17} /></button>
            </div>)}
          </div>
        </>}

        {step === 3 && <div className="obDone">
          <span className="obBadge"><CheckCircle2 size={34} /></span>
          <h2>Ready to go</h2>
          <p className="hint">Review and finish. Everything can be changed later in Manage.</p>
          <ul className="obReview">
            <li><span>Business</span><b>{business.trim()}</b></li>
            {needsBusiness && <li><span>First outlet</span><b>{outletName.trim() || 'Main Outlet'} ({outletCode.trim() || 'MAIN'})</b></li>}
            <li><span>Menu items</span><b>{valid.length ? `${valid.length} item${valid.length === 1 ? '' : 's'}` : 'None yet'}</b></li>
          </ul>
        </div>}

        {msg && <div className="error" role="alert">{msg}</div>}
      </div>

      <footer className="obFoot">
        {step > 1 ? <button type="button" className="secondary" onClick={() => { setMsg(''); setStep(step - 1); }} disabled={saving}><ArrowLeft size={17} /> Back</button> : <span />}
        {step < 3
          ? <button type="button" className="primary" onClick={next}>Continue <ArrowRight size={17} /></button>
          : <button type="button" className="primary" disabled={saving} onClick={() => void finish()}>{saving ? 'Setting up…' : 'Finish setup'}</button>}
      </footer>
    </section>
  </main>;
}
