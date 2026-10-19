'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal, { Field, useToast } from '@/components/Modal';

type Outlet = { id: string; name: string; code: string; active: boolean };
type Org = { id: string; name: string; created_at: string; outlets: Outlet[] | null };

export default function OrganizationAdmin() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loadError, setLoadError] = useState('');
  const [orgModal, setOrgModal] = useState(false);
  const [outletFor, setOutletFor] = useState<Org | null>(null);
  const [name, setName] = useState('');
  const [outletName, setOutletName] = useState('Main Outlet');
  const [code, setCode] = useState('MAIN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { show, toast } = useToast();

  async function load() {
    const { data, error: loadErr } = await supabase.from('organizations').select('id,name,created_at,outlets(id,name,code,active)').order('created_at', { ascending: false });
    if (loadErr) setLoadError(loadErr.message); else { setLoadError(''); setOrgs((data ?? []) as unknown as Org[]); }
  }
  useEffect(() => { void load(); }, []);

  function close() { setOrgModal(false); setOutletFor(null); setBusy(false); setError(''); }
  function openOrg() { setName(''); setOutletName('Main Outlet'); setCode('MAIN'); setError(''); setOrgModal(true); }
  function openOutlet(org: Org) { setOutletName(''); setCode(''); setError(''); setOutletFor(org); }

  async function addOrg() {
    if (!name.trim()) { setError('Enter the organization or business name.'); return; }
    if (!outletName.trim() || !code.trim()) { setError('Enter the first outlet’s name and code.'); return; }
    setBusy(true); setError('');
    const { data, error: orgError } = await supabase.from('organizations').insert({ name: name.trim() }).select().single();
    if (orgError || !data) { setBusy(false); setError(orgError?.message ?? 'Could not create the organization.'); return; }
    const { error: outletError } = await supabase.from('outlets').insert({ organization_id: data.id, name: outletName.trim(), code: code.trim().toUpperCase() });
    if (outletError) { setBusy(false); setError(`The organization was created, but its first outlet failed: ${outletError.message}`); await load(); return; }
    show('Organization created'); close(); await load();
  }

  async function addOutlet() {
    if (!outletFor) return;
    if (!outletName.trim() || !code.trim()) { setError('Enter an outlet name and a short code.'); return; }
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('outlets').insert({ organization_id: outletFor.id, name: outletName.trim(), code: code.trim().toUpperCase() });
    if (insertError) { setBusy(false); setError(insertError.message); return; }
    show('Outlet added'); close(); await load();
  }

  return <main className="container">
    <div className="pageHead">
      <div><h1>Organizations</h1><p className="hint">Every business on FoodDesk and its outlets (super admin).</p></div>
      <div className="toolbar"><button type="button" className="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</button><button type="button" className="primary" onClick={openOrg}><Plus size={16} /> Add organization</button></div>
    </div>
    {loadError && <div className="error">{loadError}</div>}
    <div className="orgGrid">
      {orgs.map(o => <section className="card" key={o.id}>
        <div className="cardHead"><div><h3>{o.name}</h3><p className="hint">{(o.outlets ?? []).length} outlet{(o.outlets ?? []).length === 1 ? '' : 's'}</p></div><button type="button" className="secondary small" onClick={() => openOutlet(o)}><Plus size={15} /> Add outlet</button></div>
        <ul className="rows">{(o.outlets ?? []).map(r => <li key={r.id} className="t-primary"><span className="tonal sm">{r.code.slice(0, 2)}</span><span className="grow"><b>{r.name}</b><small className="when">{r.code}</small></span><span className={'chip ' + (r.active ? 't-success' : 't-secondary')}>{r.active ? 'Active' : 'Disabled'}</span></li>)}</ul>
      </section>)}
    </div>
    {!orgs.length && !loadError && <div className="card emptyMini"><p>No organizations yet</p></div>}

    <Modal open={orgModal} title="Add organization" subtitle="Creates the business and its first outlet." onClose={close} onSubmit={addOrg} submitLabel="Create organization" busy={busy} error={error}>
      <div className="mGrid">
        <Field label="Organization / business name" wide><input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="First outlet name"><input value={outletName} onChange={e => setOutletName(e.target.value)} /></Field>
        <Field label="Outlet code"><input value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} /></Field>
      </div>
    </Modal>

    <Modal open={!!outletFor} title={`Add outlet to ${outletFor?.name ?? ''}`} onClose={close} onSubmit={addOutlet} submitLabel="Add outlet" busy={busy} error={error}>
      <div className="mGrid">
        <Field label="Outlet name"><input value={outletName} onChange={e => setOutletName(e.target.value)} /></Field>
        <Field label="Outlet code"><input value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} /></Field>
      </div>
    </Modal>
    {toast}
  </main>;
}
