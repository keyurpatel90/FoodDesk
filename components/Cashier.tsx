'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings, CartItem, Discount, PaymentMethod, Product } from '@/lib/types';
import { money } from '@/lib/format';

export default function Cashier({ settings }: { settings: AppSettings }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [discountId, setDiscountId] = useState('');
  const [customType, setCustomType] = useState<'percent' | 'fixed'>('percent');
  const [customValue, setCustomValue] = useState('');
  const [covers, setCovers] = useState('1');
  const [notes, setNotes] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [placing, setPlacing] = useState(false);
  const [last, setLast] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const f = settings.features;
  const activeDiscounts = discounts.filter(d => d.active);
  const availablePayments: PaymentMethod[] = ['cash', ...(f.upiPayment ? ['upi' as const] : []), ...(f.posPayment ? ['pos' as const] : [])];
  const subtotal = useMemo(() => cart.reduce((s, x) => s + x.product.price * x.qty, 0), [cart]);
  const selectedDiscount = activeDiscounts.find(d => d.id === discountId) ?? null;
  const customAmount = customValue ? Math.max(0, customType === 'percent' ? Math.round(subtotal * Number(customValue) / 100) : Math.min(subtotal, Number(customValue))) : 0;
  const discountAmount = selectedDiscount
    ? selectedDiscount.type === 'percent'
      ? Math.min(selectedDiscount.max_discount_amount ?? Infinity, Math.round(subtotal * selectedDiscount.value / 100))
      : Math.min(subtotal, selectedDiscount.value)
    : customAmount;
  const total = Math.max(0, subtotal - discountAmount);
  const change = payment === 'cash' && cashReceived ? Math.max(0, Number(cashReceived) - total) : 0;

  useEffect(() => { load(); loadDiscounts(); }, []);
  useEffect(() => { if (!availablePayments.includes(payment)) setPayment(availablePayments[0] ?? 'cash'); }, [availablePayments.join(','), payment]);
  useEffect(() => { loadDiscounts(); }, [f.discounts]);
  useEffect(() => {
    const productChannel = supabase.channel('cashier-products-v2').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, load).subscribe();
    const discountChannel = supabase.channel('cashier-discounts-v2').on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, loadDiscounts).subscribe();
    return () => { supabase.removeChannel(productChannel); supabase.removeChannel(discountChannel); };
  }, []);

  async function load() {
    const { data } = await supabase.from('products').select('*').eq('active', true).order('station').order('sort_order').order('created_at');
    setProducts((data ?? []) as Product[]);
  }
  async function loadDiscounts() {
    if (!f.discounts) return setDiscounts([]);
    const { data } = await supabase.from('discounts').select('*').eq('active', true).order('created_at');
    setDiscounts((data ?? []) as Discount[]);
  }
  function add(p: Product) {
    setCart(c => { const x = c.find(i => i.product.id === p.id); return x ? c.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i) : [...c, { product: p, qty: 1 }]; });
  }
  function change(id: string, delta: number) { setCart(c => c.map(i => i.product.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0)); }
  function selectDiscount(id: string) { setDiscountId(id); if (id) { setCustomValue(''); } }
  function resetDiscount() { setDiscountId(''); setCustomValue(''); }
  async function place() {
    if (!cart.length || placing) return;
    setPlacing(true); setMsg('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const { data: o, error } = await supabase.rpc('place_order', {
        p_payment_method: payment,
        p_items: cart.map(x => ({ product_id: x.product.id, qty: x.qty })),
        p_covers: Math.max(1, Number(covers) || 1),
        p_notes: notes,
        p_discount_id: selectedDiscount?.id ?? null,
        p_custom_discount_type: selectedDiscount ? null : (customValue ? customType : null),
        p_custom_discount_value: selectedDiscount ? null : (customValue ? Number(customValue) : null),
        p_cash_received: payment === 'cash' && f.cashChange && cashReceived ? Number(cashReceived) : null,
      });
      if (error) throw error;
      const order = Array.isArray(o) ? o[0] : o;
      setLast({ ...order, items: cart.map(x => ({ product_name: x.product.name, qty: x.qty, price: x.product.price })) });
      setCart([]); setDiscountId(''); setCustomValue(''); setNotes(''); setCovers('1'); setCashReceived('');
      setMsg('Order sent to kitchen');
      void sessionData;
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not place order'); }
    finally { setPlacing(false); }
  }
  function printReceipt() {
    if (!last || !f.printing) return;
    const html = `<!doctype html><html><head><title>Order #${last.order_no}</title><style>body{font-family:Arial,sans-serif;width:300px;margin:20px auto}.center{text-align:center}hr{border:0;border-top:1px dashed #000}div{display:flex;justify-content:space-between;margin:7px 0}</style></head><body><h2 class="center">${settings.event_name}</h2><div><b>Order #${last.order_no}</b><span>${new Date(last.created_at).toLocaleString()}</span></div><p>Covers: ${last.covers ?? 1}</p>${last.items.map((i: any) => `<div><span>${i.qty} × ${i.product_name}</span><span>${money(i.price * i.qty, settings.currency_symbol)}</span></div>`).join('')}<hr><div><span>Subtotal</span><b>${money(last.subtotal, settings.currency_symbol)}</b></div>${last.discount_amount ? `<div><span>Discount</span><b>-${money(last.discount_amount, settings.currency_symbol)}</b></div>` : ''}<div><b>Total</b><b>${money(last.total, settings.currency_symbol)}</b></div><p>Payment: ${(last.payment_method ?? payment).toUpperCase()}</p>${last.cash_received ? `<p>Cash: ${money(last.cash_received, settings.currency_symbol)}<br>Change: ${money(last.change_due ?? 0, settings.currency_symbol)}</p>` : ''}<p>${last.notes ?? ''}</p><p class="center">Thank you!</p></body></html>`;
    const w = window.open('', '_blank', 'width=360,height=640');
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }


  return <main className="container">
    <div className="rolebar"><div><span>Cashier</span><p className="hint">Tap products, apply an offer and send the order.</p></div><div className="live">● LIVE</div></div>
    <div className="grid cashierGrid">
      <section className="card"><div className="sectionHead"><h2>Menu</h2><span className="muted">{products.length} items</span></div><div className="products">{products.map(p => <button className="product" key={p.id} onClick={() => add(p)}><strong>{p.name}</strong><small className="station">{p.station}</small><span>{money(p.price, settings.currency_symbol)}</span></button>)}</div></section>
      <aside className="card cart"><div className="sectionHead"><h2>Current Order</h2>{cart.length > 0 && <button className="iconBtn" title="Clear order" onClick={() => setCart([])}><Trash2 size={17}/></button>}</div>
        {cart.length === 0 ? <div className="emptyMini"><p>No items yet</p><small>Tap a menu item to begin.</small></div> : cart.map(x => <div className="cartline" key={x.product.id}><div><b>{x.product.name}</b><div className="muted">{money(x.product.price, settings.currency_symbol)} × {x.qty}</div></div><div className="qty"><button onClick={() => change(x.product.id, -1)}><Minus size={15}/></button><b>{x.qty}</b><button onClick={() => change(x.product.id, 1)}><Plus size={15}/></button></div></div>)}
        <div className="orderMeta"><label>Covers<input value={covers} min="1" onChange={e => setCovers(e.target.value)} type="number" /></label><label className="grow">Kitchen note<input maxLength={120} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Less spicy, extra sauce…" /></label></div>
        {f.discounts && <div className="discountBox"><div className="sectionHead"><b>Discount</b>{(selectedDiscount || customValue) && <button className="linkBtn" onClick={resetDiscount}>Remove</button>}</div><select value={selectedDiscount ? discountId : ''} onChange={e => selectDiscount(e.target.value)}><option value="">No discount</option>{activeDiscounts.map(d => <option key={d.id} value={d.id}>{d.name} • {d.type === 'percent' ? `${d.value}%` : money(d.value, settings.currency_symbol)}{d.min_order_amount ? ` • min ${money(d.min_order_amount, settings.currency_symbol)}` : ''}</option>)}</select>{f.customDiscount && !selectedDiscount && <div className="inlineForm"><select value={customType} onChange={e => setCustomType(e.target.value as any)}><option value="percent">%</option><option value="fixed">₹</option></select><input inputMode="numeric" value={customValue} onChange={e => setCustomValue(e.target.value.replace(/\D/g,''))} placeholder={`Custom (max ${settings.max_custom_discount_percent}% if %)`}/></div>}</div>}
        {discountAmount > 0 && <div className="summaryLine discount"><span>Discount</span><b>-{money(discountAmount, settings.currency_symbol)}</b></div>}
        <div className="payment"><b>Payment</b><div>{availablePayments.map(p => <button key={p} className={'choice '+(payment===p?'selected':'')} onClick={() => setPayment(p)}>{p === 'pos' ? 'POS' : p.toUpperCase()}</button>)}</div></div>
        {payment === 'cash' && f.cashChange && <div className="orderMeta"><label className="grow">Cash received<input inputMode="numeric" value={cashReceived} onChange={e => setCashReceived(e.target.value.replace(/\D/g,''))} placeholder={money(total, settings.currency_symbol)} /></label><div className="changeBox"><span>Change</span><b>{money(change, settings.currency_symbol)}</b></div></div>}
        <div className="summaryLine"><span>Subtotal</span><b>{money(subtotal, settings.currency_symbol)}</b></div><div className="total"><span>Total</span><b>{money(total, settings.currency_symbol)}</b></div>
        <button className="primary bigbtn" disabled={placing || !cart.length} onClick={place}><Check size={18}/> {placing ? 'Sending…' : 'PLACE ORDER'}</button>
        {last && <div className="ticket"><div>ORDER <b>#{last.order_no}</b></div><small>{last.payment_method?.toUpperCase()} • {money(last.total, settings.currency_symbol)}</small>{f.printing && <button className="secondary bigbtn" onClick={printReceipt}><Printer size={17}/> PRINT RECEIPT</button>}</div>}
        {msg && <p className={msg.toLowerCase().includes('sent') ? 'successText' : 'error'}>{msg}</p>}
      </aside>
    </div>
  </main>;
}
