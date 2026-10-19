'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal, { Field, useToast } from '@/components/Modal';

type Outlet = { id: string; name: string; code: string; active: boolean };

export default function MultiOutlet() {
  const [rows, setRows] = useState<Outlet[]>([]);
  const [org, setOrg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { show, toast } = useToast();

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: p } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
    setOrg(p?.organization_id ?? null);
    if (!p?.organization_id) { setRows([]); return; }
    const { data } = await supabase.from('outlets').select('*').eq('organization_id', p.organization_id).order('created_at');
    setRows((data ?? []) as Outlet[]);
  }
  useEffect(() => { void load(); }, []);

  function openForm() { setName(''); setCode(''); setError(''); setOpen(true); }
  function close() { setOpen(false); setBusy(false); setError(''); }

  async function add() {
    if (!org) { setError('Your account is not part of an organization yet.'); return; }
    if (!name.trim() || !code.trim()) { setError('Enter an outlet name and a short code.'); return; }
    setBusy(true); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
    if (!['owner', 'admin'].includes(profile?.role || '')) { setBusy(false); setError('Only organization owners can create outlets.'); return; }
    const { data: outlet, error: insertError } = await supabase.from('outlets').insert({ organization_id: org, name: name.trim(), code: code.trim().toUpperCase() }).select().single();
    if (insertError || !outlet) { setBusy(false); setError(insertError?.message ?? 'Could not create the outlet.'); return; }
    if (user) await supabase.from('user_outlet_access').insert({ user_id: user.id, organization_id: org, outlet_id: outlet.id, role: 'owner' });
    show('Outlet added'); close(); await load();
  }

  return <section className="card sectionSpace">
    <div className="cardHead"><div><h3>Outlets</h3><p className="hint">Each outlet has its own menu, orders and reports. Staff only see the outlets they are assigned to.</p></div><button type="button" className="primary small" onClick={openForm}><Plus size={16} /> Add outlet</button></div>
    {rows.length ? <table className="tbl"><thead><tr><th>Outlet</th><th>Code</th><th>Status</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id}><td><b>{r.name}</b></td><td>{r.code}</td><td><span className={'chip ' + (r.active ? 't-success' : 't-secondary')}>{r.active ? 'Active' : 'Disabled'}</span></td></tr>)}
    </tbody></table> : <div className="emptyMini"><p>No outlets yet</p></div>}
    <Modal open={open} title="Add outlet" subtitle="A new branch or location." onClose={close} onSubmit={add} submitLabel="Add outlet" busy={busy} error={error}>
      <div className="mGrid">
        <Field label="Outlet name" wide><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mumbai Central" /></Field>
        <Field label="Short code" hint="Used on order numbers, for example MUM01"><input value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} /></Field>
      </div>
    </Modal>
    {toast}
  </section>;
}
