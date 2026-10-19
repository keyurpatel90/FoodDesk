'use client';

import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cacheSnapshot } from '@/lib/offline';
import { saveSettings } from '@/lib/settings';
import { canonicalRole, ROLE_LABELS } from '@/lib/types';
import type { AppSettings, Discount, FeatureFlags, Product, Profile, ProductUnit, Role } from '@/lib/types';
import { lineAmount, money, unitLabel } from '@/lib/format';
import MultiOutlet from '@/components/MultiOutlet';
import Modal, { Field } from '@/components/Modal';

const roles: Role[] = ['owner', 'manager', 'cashier', 'kitchen', 'runner', 'viewer'];
const featureLabels: Record<keyof FeatureFlags, string> = { cashier: 'Cashier', kitchen: 'Kitchen', dashboard: 'Dashboard', orders: 'Order management', menuManagement: 'Menu management', discounts: 'Discounts', staffManagement: 'Staff management', reports: 'Reports', printing: 'Printing', customDiscount: 'Custom discounts', cashChange: 'Cash and change', upiPayment: 'UPI payments', posPayment: 'Card payments' };
const TABS = { menu: 'Menu', discounts: 'Discounts', staff: 'Staff', outlets: 'Outlets', settings: 'Settings' } as const;
type Tab = keyof typeof TABS;

const digitsOnly = (value: string) => Array.from(value).filter(c => c >= '0' && c <= '9').join('');
const emptyProduct = { name: '', price: '', cost: '', unit_type: 'piece' as ProductUnit, category: '' };
const emptyDiscount = { name: '', type: 'percent' as 'percent' | 'fixed', value: '10', min: '0', max: '' };
const emptyUser = { name: '', email: '', password: '', role: 'cashier' as Role, outlet_id: '' };

async function adminApi(method: 'GET' | 'POST' | 'PATCH', body?: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please sign in again.');
  const response = await fetch('/api/admin/users', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? 'Request failed');
  return json;
}

export default function Admin({ settings, profile, onSettingsChange }: { settings: AppSettings; profile: Profile; onSettingsChange: (settings: AppSettings) => void }) {
  const [tab, setTab] = useState<Tab>('menu');
  const [products, setProducts] = useState<Product[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string; code: string }[]>([]);
  const [localSettings, setLocalSettings] = useState(settings);
  const [toast, setToast] = useState('');

  const [productModal, setProductModal] = useState<null | { id: string | null }>(null);
  const [pForm, setPForm] = useState(emptyProduct);
  const [discountModal, setDiscountModal] = useState<null | { id: string | null }>(null);
  const [dForm, setDForm] = useState(emptyDiscount);
  const [userModal, setUserModal] = useState(false);
  const [uForm, setUForm] = useState(emptyUser);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const role = canonicalRole(profile.role);
  const isOwner = role === 'owner';
  const canStaff = isOwner;
  const canMenu = role === 'owner' || role === 'manager';
  const tabs = (Object.keys(TABS) as Tab[]).filter(t => t === 'menu' ? settings.features.menuManagement && canMenu : t === 'discounts' ? settings.features.discounts && canMenu : t === 'staff' ? settings.features.staffManagement && canStaff : isOwner);

  useEffect(() => { setLocalSettings(settings); }, [settings]);
  useEffect(() => { void loadProducts(); void loadDiscounts(); void loadOutlets(); if (canStaff) void loadUsers(); }, [canStaff]);
  useEffect(() => { if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]); }, [tabs.join(), tab]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(t); }, [toast]);

  async function tenant() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const { data } = await supabase.from('profiles').select('organization_id,outlet_id').eq('id', auth.user.id).single();
    return (data as { organization_id: string | null; outlet_id: string | null } | null) ?? null;
  }
  async function loadOutlets() {
    const t = await tenant();
    if (!t?.organization_id) return;
    const { data } = await supabase.from('outlets').select('id,name,code').eq('organization_id', t.organization_id).eq('active', true).order('name');
    setOutlets(data ?? []);
    setUForm(current => ({ ...current, outlet_id: current.outlet_id || data?.[0]?.id || '' }));
  }
  async function loadProducts() {
    const t = await tenant();
    if (!t?.organization_id || !t.outlet_id) return;
    const { data } = await supabase.from('products').select('*').eq('organization_id', t.organization_id).eq('outlet_id', t.outlet_id).order('category').order('sort_order').order('created_at');
    if (data) { const rows = data as Product[]; setProducts(rows); await cacheSnapshot({ products: rows.filter(p => p.active) }); }
  }
  async function loadDiscounts() {
    const { data } = await supabase.from('discounts').select('*').order('created_at');
    if (data) { const rows = data as Discount[]; setDiscounts(rows); await cacheSnapshot({ discounts: rows.filter(d => d.active) }); }
  }
  async function loadUsers() { try { const body = await adminApi('GET'); setUsers(body.users ?? []); } catch { /* shown on the Staff tab as empty */ } }

  function closeModals() { setProductModal(null); setDiscountModal(null); setUserModal(false); setFormError(''); setBusy(false); }

  /* ---------- products ---------- */
  function openProduct(product?: Product) {
    setFormError('');
    setPForm(product ? { name: product.name, price: String(product.price), cost: String(product.food_cost), unit_type: product.unit_type ?? 'piece', category: product.category ?? '' } : emptyProduct);
    setProductModal({ id: product?.id ?? null });
  }
  async function saveProduct() {
    if (!canMenu || !productModal) return;
    const name = pForm.name.trim();
    if (!name) { setFormError('Enter a product name.'); return; }
    if (!pForm.price || Number(pForm.price) <= 0) { setFormError('Enter a selling price above zero.'); return; }
    setBusy(true); setFormError('');
    const t = await tenant();
    if (!t?.organization_id || !t.outlet_id) { setBusy(false); setFormError('Your account is not assigned to an organization and outlet. Ask an administrator to assign access.'); return; }
    const payload = { name, price: Number(pForm.price), food_cost: Number(pForm.cost) || 0, unit_type: pForm.unit_type, category: pForm.category.trim() || null, organization_id: t.organization_id, outlet_id: t.outlet_id };
    const { error } = productModal.id
      ? await supabase.from('products').update(payload).eq('id', productModal.id)
      : await supabase.from('products').insert({ ...payload, sort_order: products.length + 1 });
    setBusy(false);
    if (error) { setFormError(error.message); return; }
    setToast(productModal.id ? 'Product updated' : 'Product added');
    closeModals(); await loadProducts();
  }
  async function toggleProduct(product: Product) {
    const { error } = await supabase.from('products').update({ active: !product.active }).eq('id', product.id);
    setToast(error?.message ?? (product.active ? 'Product disabled' : 'Product enabled')); await loadProducts();
  }

  /* ---------- discounts ---------- */
  function openDiscount(discount?: Discount) {
    setFormError('');
    setDForm(discount ? { name: discount.name, type: discount.type, value: String(discount.value), min: String(discount.min_order_amount ?? 0), max: discount.max_discount_amount ? String(discount.max_discount_amount) : '' } : emptyDiscount);
    setDiscountModal({ id: discount?.id ?? null });
  }
  async function saveDiscount() {
    if (!canMenu || !discountModal) return;
    if (!dForm.name.trim()) { setFormError('Enter an offer name.'); return; }
    if (!dForm.value || Number(dForm.value) <= 0) { setFormError('Enter a discount value above zero.'); return; }
    if (dForm.type === 'percent' && Number(dForm.value) > 100) { setFormError('A percentage discount cannot be more than 100.'); return; }
    setBusy(true); setFormError('');
    const payload = { name: dForm.name.trim(), type: dForm.type, value: Number(dForm.value), min_order_amount: Number(dForm.min) || 0, max_discount_amount: dForm.max ? Number(dForm.max) : null };
    const { error } = discountModal.id
      ? await supabase.from('discounts').update(payload).eq('id', discountModal.id)
      : await supabase.from('discounts').insert({ ...payload, active: true });
    setBusy(false);
    if (error) { setFormError(error.message); return; }
    setToast(discountModal.id ? 'Discount updated' : 'Discount added');
    closeModals(); await loadDiscounts();
  }
  async function toggleDiscount(discount: Discount) {
    const { error } = await supabase.from('discounts').update({ active: !discount.active }).eq('id', discount.id);
    setToast(error?.message ?? (discount.active ? 'Discount disabled' : 'Discount enabled')); await loadDiscounts();
  }

  /* ---------- staff ---------- */
  function openUser() { setFormError(''); setUForm({ ...emptyUser, outlet_id: outlets[0]?.id ?? '' }); setUserModal(true); }
  async function createUser() {
    if (!canStaff) return;
    if (!uForm.name.trim() || !uForm.email.trim()) { setFormError('Enter the staff member’s name and email.'); return; }
    if (uForm.password.length < 6) { setFormError('The password needs at least 6 characters.'); return; }
    if (!uForm.outlet_id) { setFormError('Choose an outlet.'); return; }
    setBusy(true); setFormError('');
    try {
      await adminApi('POST', { display_name: uForm.name.trim(), email: uForm.email.trim(), password: uForm.password, role: uForm.role, outlet_id: uForm.outlet_id });
      setToast('Staff member added'); closeModals(); await loadUsers();
    } catch (e) { setBusy(false); setFormError(e instanceof Error ? e.message : 'Could not create the user'); }
  }
  async function updateUser(user: Profile, patch: Record<string, unknown>) {
    try { await adminApi('PATCH', { id: user.id, ...patch }); await loadUsers(); } catch (e) { setToast(e instanceof Error ? e.message : 'Could not update the user'); }
  }

  /* ---------- settings ---------- */
  async function saveBusinessSettings() {
    setBusy(true);
    try {
      const t = await tenant();
      if (!t?.organization_id || !t.outlet_id) throw new Error('Your account is not assigned to an outlet.');
      const patch = {
        business_name: localSettings.business_name.trim() || settings.business_name,
        kitchen_delay_minutes: Math.min(180, Math.max(1, Number(localSettings.kitchen_delay_minutes) || 10)),
        max_custom_discount_percent: Math.min(100, Math.max(0, Number(localSettings.max_custom_discount_percent) || 0)),
        require_cash_received: localSettings.require_cash_received,
        features: localSettings.features,
      };
      await saveSettings(t.organization_id, t.outlet_id, patch);
      const next = { ...settings, ...patch };
      onSettingsChange(next); await cacheSnapshot({ settings: next }); setToast('Settings saved');
    } catch (e) { setToast(e instanceof Error ? e.message : 'Could not save settings'); }
    setBusy(false);
  }
  const toggleFeature = (key: keyof FeatureFlags) => { if (isOwner) setLocalSettings(c => ({ ...c, features: { ...c.features, [key]: !c.features[key] } })); };

  const cur = settings.currency_symbol;
  const perUnit = (u?: ProductUnit | null) => u === 'kg' ? 'kg' : u === 'litre' ? 'L' : 'piece';
  const margin = (p: Product) => p.price ? ((p.price - p.food_cost) / p.price) * 100 : 0;

  return <main className="container">
    <div className="pageHead"><div><h1>Manage</h1><p className="hint">Menu, offers, staff, outlets and settings for {settings.business_name}.</p></div></div>
    <div className="seg segScroll" role="tablist" aria-label="Manage sections">{tabs.map(t => <button type="button" key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{TABS[t]}</button>)}</div>

    {tab === 'menu' && canMenu && <section className="card sectionSpace">
      <div className="cardHead"><div><h3>Menu</h3><p className="hint">{products.length} product{products.length === 1 ? '' : 's'}. Set the price per piece, kg or litre; cashiers enter the quantity.</p></div><button type="button" className="primary small" onClick={() => openProduct()}><Plus size={16} /> Add product</button></div>
      {products.length ? <table className="tbl"><thead><tr><th>Product</th><th className="num">Price</th><th className="num c-cost">Cost</th><th className="num c-cost">Margin</th><th>Status</th><th className="num">Actions</th></tr></thead><tbody>
        {products.map(p => <tr key={p.id}>
          <td><b>{p.name}</b><small className="when">{p.category || 'No category'}</small></td>
          <td className="num">{money(p.price, cur)}<small className="when">per {perUnit(p.unit_type)}</small></td>
          <td className="num c-cost">{money(p.food_cost, cur)}</td>
          <td className="num c-cost">{margin(p).toFixed(0)}%</td>
          <td><span className={'chip ' + (p.active ? 't-success' : 't-secondary')}>{p.active ? 'Active' : 'Inactive'}</span></td>
          <td className="num"><div className="rowActions"><button type="button" className="iconBtn" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => openProduct(p)}><Pencil size={16} /></button><button type="button" className="secondary small" onClick={() => void toggleProduct(p)}>{p.active ? 'Disable' : 'Enable'}</button></div></td>
        </tr>)}
      </tbody></table> : <div className="emptyMini"><p>No products yet</p><small>Add your first product to start taking orders.</small></div>}
    </section>}

    {tab === 'discounts' && canMenu && <section className="card sectionSpace">
      <div className="cardHead"><div><h3>Discounts</h3><p className="hint">Offers cashiers can apply to an order.</p></div><button type="button" className="primary small" onClick={() => openDiscount()}><Plus size={16} /> Add discount</button></div>
      {discounts.length ? <table className="tbl"><thead><tr><th>Offer</th><th className="num">Value</th><th className="c-cost">Rules</th><th>Status</th><th className="num">Actions</th></tr></thead><tbody>
        {discounts.map(d => <tr key={d.id}>
          <td><b>{d.name}</b></td>
          <td className="num">{d.type === 'percent' ? `${d.value}%` : money(d.value, cur)}</td>
          <td className="c-cost"><small>{d.min_order_amount ? `Min order ${money(d.min_order_amount, cur)}` : 'No minimum'}{d.max_discount_amount ? ` • cap ${money(d.max_discount_amount, cur)}` : ''}</small></td>
          <td><span className={'chip ' + (d.active ? 't-success' : 't-secondary')}>{d.active ? 'Active' : 'Inactive'}</span></td>
          <td className="num"><div className="rowActions"><button type="button" className="iconBtn" aria-label={`Edit ${d.name}`} title="Edit" onClick={() => openDiscount(d)}><Pencil size={16} /></button><button type="button" className="secondary small" onClick={() => void toggleDiscount(d)}>{d.active ? 'Disable' : 'Enable'}</button></div></td>
        </tr>)}
      </tbody></table> : <div className="emptyMini"><p>No discounts yet</p></div>}
    </section>}

    {tab === 'staff' && canStaff && <section className="card sectionSpace">
      <div className="cardHead"><div><h3>Staff and roles</h3><p className="hint">Create a login and choose what each person can do.</p></div><button type="button" className="primary small" onClick={openUser}><UserPlus size={16} /> Add staff</button></div>
      {users.length ? <table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>
        {users.map(u => <tr key={u.id}>
          <td><b>{u.display_name}</b><small className="when">{u.email}</small></td>
          <td><select aria-label={`Role for ${u.display_name}`} value={canonicalRole(u.role)} onChange={e => void updateUser(u, { role: e.target.value })}>{roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td>
          <td><button type="button" className="secondary small" onClick={() => void updateUser(u, { active: !u.active })}>{u.active ? 'Active' : 'Disabled'}</button></td>
        </tr>)}
      </tbody></table> : <div className="emptyMini"><p>No staff yet</p></div>}
    </section>}

    {tab === 'outlets' && isOwner && <MultiOutlet />}

    {tab === 'settings' && isOwner && <section className="card sectionSpace settingsCard">
      <div className="cardHead"><div><h3>Settings</h3><p className="hint">How {settings.business_name} runs day to day.</p></div></div>
      <div className="mGrid">
        <Field label="Business name"><input value={localSettings.business_name} onChange={e => setLocalSettings({ ...localSettings, business_name: e.target.value })} /></Field>
        <Field label="Kitchen alert after (minutes)" hint="Orders waiting longer turn red on the kitchen board."><input type="number" min={1} max={180} value={localSettings.kitchen_delay_minutes} onChange={e => setLocalSettings({ ...localSettings, kitchen_delay_minutes: Number(e.target.value) })} /></Field>
        <Field label="Largest custom discount (%)"><input type="number" min={0} max={100} value={localSettings.max_custom_discount_percent} onChange={e => setLocalSettings({ ...localSettings, max_custom_discount_percent: Number(e.target.value) })} /></Field>
      </div>
      <div className="switchList">
        <div className="switchRow"><span>Cash received must cover the order total</span><button type="button" role="switch" aria-checked={localSettings.require_cash_received} className="switch" onClick={() => setLocalSettings({ ...localSettings, require_cash_received: !localSettings.require_cash_received })}><i /></button></div>
        {(Object.keys(featureLabels) as (keyof FeatureFlags)[]).map(k => <div className="switchRow" key={k}><span>{featureLabels[k]}</span><button type="button" role="switch" aria-checked={localSettings.features[k]} aria-label={featureLabels[k]} className="switch" onClick={() => toggleFeature(k)}><i /></button></div>)}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={() => void saveBusinessSettings()}><Save size={17} /> {busy ? 'Saving…' : 'Save settings'}</button>
    </section>}

    <Modal open={!!productModal} title={productModal?.id ? 'Edit product' : 'Add product'} subtitle="Price and food cost are per piece, kg or litre." onClose={closeModals} onSubmit={saveProduct} submitLabel={productModal?.id ? 'Save changes' : 'Add product'} busy={busy} error={formError}>
      <div className="mGrid">
        <Field label="Product name" wide><input value={pForm.name} onChange={e => setPForm({ ...pForm, name: e.target.value })} placeholder="e.g. Masala dosa" /></Field>
        <Field label="Category"><input value={pForm.category} onChange={e => setPForm({ ...pForm, category: e.target.value })} placeholder="e.g. Mains" /></Field>
        <Field label="Sold by"><select value={pForm.unit_type} onChange={e => setPForm({ ...pForm, unit_type: e.target.value as ProductUnit })}><option value="piece">Piece</option><option value="kg">Kilogram (kg)</option><option value="litre">Litre (L)</option></select></Field>
        <Field label={`Selling price (${cur})`}><input inputMode="numeric" value={pForm.price} onChange={e => setPForm({ ...pForm, price: digitsOnly(e.target.value) })} /></Field>
        <Field label={`Food cost (${cur})`}><input inputMode="numeric" value={pForm.cost} onChange={e => setPForm({ ...pForm, cost: digitsOnly(e.target.value) })} /></Field>
      </div>
      {pForm.price && pForm.unit_type !== 'piece' && <p className="hint">Example: 200 {pForm.unit_type === 'kg' ? 'g' : 'ml'} at {money(Number(pForm.price), cur)}/{unitLabel(pForm.unit_type)} = {money(lineAmount(Number(pForm.price), 0.2), cur)}</p>}
    </Modal>

    <Modal open={!!discountModal} title={discountModal?.id ? 'Edit discount' : 'Add discount'} subtitle="Cashiers pick this offer when taking an order." onClose={closeModals} onSubmit={saveDiscount} submitLabel={discountModal?.id ? 'Save changes' : 'Add discount'} busy={busy} error={formError}>
      <div className="mGrid">
        <Field label="Offer name" wide><input value={dForm.name} onChange={e => setDForm({ ...dForm, name: e.target.value })} placeholder="e.g. Festival offer" /></Field>
        <Field label="Type"><select value={dForm.type} onChange={e => setDForm({ ...dForm, type: e.target.value as 'percent' | 'fixed' })}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></Field>
        <Field label={dForm.type === 'percent' ? 'Value (%)' : `Amount (${cur})`}><input inputMode="numeric" value={dForm.value} onChange={e => setDForm({ ...dForm, value: digitsOnly(e.target.value) })} /></Field>
        <Field label={`Minimum order (${cur})`}><input inputMode="numeric" value={dForm.min} onChange={e => setDForm({ ...dForm, min: digitsOnly(e.target.value) })} /></Field>
        <Field label={`Largest discount (${cur})`} hint="Optional"><input inputMode="numeric" value={dForm.max} onChange={e => setDForm({ ...dForm, max: digitsOnly(e.target.value) })} /></Field>
      </div>
    </Modal>

    <Modal open={userModal} title="Add staff member" subtitle="They sign in with this email and password." onClose={closeModals} onSubmit={createUser} submitLabel="Add staff" busy={busy} error={formError}>
      <div className="mGrid">
        <Field label="Name"><input value={uForm.name} onChange={e => setUForm({ ...uForm, name: e.target.value })} autoComplete="off" /></Field>
        <Field label="Email"><input type="email" value={uForm.email} onChange={e => setUForm({ ...uForm, email: e.target.value })} autoComplete="off" /></Field>
        <Field label="Starting password" hint="At least 6 characters"><input type="password" value={uForm.password} onChange={e => setUForm({ ...uForm, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role"><select value={uForm.role} onChange={e => setUForm({ ...uForm, role: e.target.value as Role })}>{roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
        <Field label="Outlet" wide><select value={uForm.outlet_id} onChange={e => setUForm({ ...uForm, outlet_id: e.target.value })}><option value="">Choose an outlet</option>{outlets.map(o => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}</select></Field>
      </div>
    </Modal>

    {toast && <div className="snack" role="status">{toast}</div>}
  </main>;
}
