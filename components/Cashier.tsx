'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CloudOff, Minus, Plus, Printer, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cacheSnapshot, enqueue, getCachedDiscounts, getCachedProducts, getDeviceId, saveLocalOrder, syncNow } from '@/lib/offline';
import type { AppSettings, CartItem, Discount, Order, PaymentMethod, Product } from '@/lib/types';
import { formatQty, fromDisplayQty, inputUnit, invoiceItemText, isMeasuredUnit, lineAmount, money, toDisplayQty, unitLabel } from '@/lib/format';
import QtyPicker from '@/components/QtyPicker';

function makeServiceDay(cutoffHour: number): string {
  return new Date(Date.now() - cutoffHour * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function withUnit(product: Product): Product {
  return { ...product, unit_type: product.unit_type || 'piece' };
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const [tokenNo, setTokenNo] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [placing, setPlacing] = useState(false);
  const [last, setLast] = useState<Order | null>(null);
  const [msg, setMsg] = useState('');
  const [picking, setPicking] = useState<Product | null>(null);
  const [pickQty, setPickQty] = useState('200');

  const f = settings.features;
  const activeDiscounts = discounts.filter(d => d.active);
  const availablePayments: PaymentMethod[] = ['cash', ...(f.upiPayment ? ['upi'] : []), ...(f.posPayment ? ['pos'] : [])] as PaymentMethod[];
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + lineAmount(item.product.price, item.qty), 0), [cart]);
  const selectedDiscount = activeDiscounts.find(d => d.id === discountId) ?? null;
  const customAmount = customValue
    ? Math.max(0, customType === 'percent' ? Math.round(subtotal * Number(customValue) / 100) : Math.min(subtotal, Number(customValue)))
    : 0;
  const discountAmount = selectedDiscount
    ? selectedDiscount.type === 'percent'
      ? Math.min(selectedDiscount.max_discount_amount ?? Infinity, Math.round(subtotal * selectedDiscount.value / 100))
      : Math.min(subtotal, selectedDiscount.value)
    : customAmount;
  const total = Math.max(0, subtotal - discountAmount);
  const change = payment === 'cash' && cashReceived ? Math.max(0, Number(cashReceived) - total) : 0;
  const localOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  useEffect(() => {
    void load();
    void loadDiscounts();
  }, []);
  useEffect(() => {
    if (!availablePayments.includes(payment)) setPayment(availablePayments[0] ?? 'cash');
  }, [availablePayments.join(','), payment]);
  useEffect(() => { void loadDiscounts(); }, [f.discounts]);
  useEffect(() => {
    const productChannel = supabase.channel('cashier-products-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, load).subscribe();
    const discountChannel = supabase.channel('cashier-discounts-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'discounts' }, loadDiscounts).subscribe();
    const update = () => { void load(); void loadDiscounts(); };
    window.addEventListener('online', update);
    return () => { supabase.removeChannel(productChannel); supabase.removeChannel(discountChannel); window.removeEventListener('online', update); };
  }, []);

  async function load() {
    const cached = await getCachedProducts();
    if (cached.length) setProducts(cached.map(withUnit));
    const { data } = await supabase.from('products').select('*').eq('active', true).order('category').order('sort_order').order('created_at');
    if (data?.length) {
      const rows = (data as Product[]).map(withUnit);
      setProducts(rows);
      await cacheSnapshot({ products: rows });
    }
  }

  async function loadDiscounts() {
    if (!f.discounts) { setDiscounts([]); return; }
    const cached = await getCachedDiscounts();
    if (cached.length) setDiscounts(cached);
    const { data } = await supabase.from('discounts').select('*').eq('active', true).order('created_at');
    if (data) {
      const rows = data as Discount[];
      setDiscounts(rows);
      await cacheSnapshot({ discounts: rows });
    }
  }

  function addQty(product: Product, qty: number) {
    if (qty <= 0) return;
    setCart(current => {
      const found = current.find(item => item.product.id === product.id);
      return found
        ? current.map(item => item.product.id === product.id ? { ...item, qty: Number((item.qty + qty).toFixed(3)) } : item)
        : [...current, { product, qty }];
    });
  }

  function add(product: Product) {
    const item = withUnit(product);
    if (isMeasuredUnit(item.unit_type)) {
      setPicking(item);
      setPickQty('200');
      return;
    }
    addQty(item, 1);
  }

  function confirmPickedQty() {
    if (!picking) return;
    const qty = fromDisplayQty(Number(pickQty), picking.unit_type);
    addQty(picking, qty);
    setPicking(null);
  }

  function changeQty(id: string, delta: number) {
    setCart(current => current.map(item => {
      if (item.product.id !== id) return item;
      const step = isMeasuredUnit(item.product.unit_type) ? 0.05 : 1;
      return { ...item, qty: Math.max(0, Number((item.qty + delta * step).toFixed(3))) };
    }).filter(item => item.qty > 0));
  }

  function setQuantityFromDisplay(id: string, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    setCart(current => current.map(item => item.product.id === id ? { ...item, qty: fromDisplayQty(value, item.product.unit_type) } : item).filter(item => item.qty > 0));
  }

  function selectDiscount(id: string) { setDiscountId(id); if (id) setCustomValue(''); }
  function resetDiscount() { setDiscountId(''); setCustomValue(''); }

  async function place() {
    if (!cart.length || placing) return;
    if (localOffline && payment !== 'cash') {
      setMsg('Offline mode only allows cash orders. UPI / card payment status cannot be verified without a connection.');
      return;
    }
    if (selectedDiscount && subtotal < selectedDiscount.min_order_amount) {
      setMsg(`This offer requires a minimum order of ${money(selectedDiscount.min_order_amount, settings.currency_symbol)}.`);
      return;
    }
    if (payment === 'cash' && f.cashChange && settings.require_cash_received && (!cashReceived || Number(cashReceived) < total)) {
      setMsg(`Cash received must cover ${money(total, settings.currency_symbol)}.`);
      return;
    }

    setPlacing(true);
    setMsg('');
    const localId = uid();
    const deviceId = await getDeviceId();
    const { data: sessionData } = await supabase.auth.getSession();
    const createdBy = sessionData.session?.user.id ?? null;
    const now = new Date().toISOString();
    const localOrder: Order = {
      id: localId,
      localId,
      serverId: null,
      client_order_id: localId,
      device_id: deviceId,
      order_no: -Date.now(),
      service_day: makeServiceDay(settings.service_day_cutoff_hour),
      status: 'new',
      subtotal,
      discount_amount: discountAmount,
      discount_name: selectedDiscount?.name ?? (customValue ? 'Custom discount' : null),
      discount_type: selectedDiscount?.type ?? (customValue ? customType : null),
      discount_value: selectedDiscount?.value ?? (customValue ? Number(customValue) : null),
      total,
      payment_method: payment,
      covers: Math.max(1, Number(covers) || 1),
      token_no: tokenNo.trim() || null,
      notes: notes.trim() || null,
      cash_received: payment === 'cash' && f.cashChange && cashReceived ? Number(cashReceived) : null,
      change_due: payment === 'cash' && f.cashChange && cashReceived ? change : null,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      version: 1,
      syncStatus: 'PENDING',
      items: cart.map(item => ({
        id: uid(), order_id: localId, product_id: item.product.id, product_name: item.product.name,
        qty: item.qty, price: item.product.price, food_cost: item.product.food_cost, unit_type: item.product.unit_type, status: 'new', serverId: null,
      })),
    };
    try {
      await saveLocalOrder(localOrder);
      await enqueue({
        type: 'create_order',
        localId,
        payload: {
          payment_method: payment,
          items: cart.map(item => ({ product_id: item.product.id, qty: item.qty })),
          covers: localOrder.covers,
          notes: localOrder.notes,
          discount_id: selectedDiscount?.id ?? null,
          custom_discount_type: selectedDiscount ? null : (customValue ? customType : null),
          custom_discount_value: selectedDiscount ? null : (customValue ? Number(customValue) : null),
          cash_received: localOrder.cash_received,
          token_no: localOrder.token_no,
        },
      });
      setLast(localOrder);
      setCart([]); setDiscountId(''); setCustomValue(''); setNotes(''); setTokenNo(''); setCovers('1'); setCashReceived('');
      setMsg(localOffline ? 'Order saved on this device. Waiting for synchronization.' : 'Order saved locally and synchronization started.');
      void syncNow();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Could not save order locally');
    } finally {
      setPlacing(false);
    }
  }

  function printReceipt() {
    if (!last || !f.printing) return;
    const number = last.order_no < 0 ? `LOCAL-${Math.abs(last.order_no)}` : `${last.order_no}`;
    const html = `<!doctype html><html><head><title>Order ${number}</title><style>body{font-family:Arial,sans-serif;width:300px;margin:20px auto}.center{text-align:center}hr{border:0;border-top:1px dashed #000}div{display:flex;justify-content:space-between;margin:7px 0}</style></head><body><h2 class="center">${settings.business_name}</h2><div><b>Order #${number}</b><span>${new Date(last.created_at).toLocaleString()}</span></div>${last.token_no ? `<p style="font-size:22px;font-weight:bold;border:2px solid #000;padding:6px;text-align:center">TOKEN ${last.token_no}</p>` : ''}<p>Covers: ${last.covers}</p>${last.items.map(item => `<div><span>${invoiceItemText(item.product_name, item.qty, item.price, item.unit_type, settings.currency_symbol)}</span><span>${money(lineAmount(item.price, item.qty), settings.currency_symbol)}</span></div>`).join('')}<hr><div><span>Subtotal</span><b>${money(last.subtotal, settings.currency_symbol)}</b></div>${last.discount_amount ? `<div><span>Discount</span><b>-${money(last.discount_amount, settings.currency_symbol)}</b></div>` : ''}<div><b>Total</b><b>${money(last.total, settings.currency_symbol)}</b></div><p>Payment: ${last.payment_method.toUpperCase()}</p>${last.cash_received ? `<p>Cash: ${money(last.cash_received, settings.currency_symbol)}<br>Change: ${money(last.change_due ?? 0, settings.currency_symbol)}</p>` : ''}<p>${last.notes ?? ''}</p><p class="center">Thank you!</p></body></html>`;
    const w = window.open('', '_blank', 'width=360,height=640');
    if (!w) return;
    w.document.write(html); w.document.close(); w.focus(); w.print();
  }

  return <main className="container">
    <div className="rolebar"><div><span>Express POS</span><p className="hint">Tap products → take payment → kitchen gets the order.</p></div><div className="live">{localOffline ? <><CloudOff size={14}/> OFFLINE</> : <>● READY</>}</div></div>
    <div className="grid cashierGrid">
      <section className="card"><div className="sectionHead"><h2>Menu</h2><span className="muted">{products.length} items • touch friendly</span></div><div className="products">{products.map(product => <button className="product" key={product.id} onClick={() => add(product)}><strong>{product.name}</strong><small className="station">{product.category || ''}</small><span>{money(product.price, settings.currency_symbol)} / {unitLabel(product.unit_type)}</span></button>)}</div>{!products.length && <div className="emptyMini"><p>No cached menu available</p><small>Connect once to download the menu for offline use.</small></div>}</section>
      <aside className="card cart"><div className="sectionHead"><h2>Current Order</h2>{cart.length > 0 && <button className="iconBtn" title="Clear order" onClick={() => setCart([])}><Trash2 size={17}/></button>}</div>
        {cart.length === 0 ? <div className="emptyMini"><p>No items yet</p><small>Tap a menu item, then enter grams, ml, or pieces.</small></div> : cart.map(item => <div className="cartline" key={item.product.id}><div><b>{item.product.name}</b><div className="muted">{money(item.product.price, settings.currency_symbol)} / {unitLabel(item.product.unit_type)} × {formatQty(item.qty, item.product.unit_type)} = {money(lineAmount(item.product.price, item.qty), settings.currency_symbol)}</div></div><div className="qty"><button onClick={() => changeQty(item.product.id, -1)}><Minus size={15}/></button><input className="qtyInput" aria-label="Quantity" type="number" min="1" step="1" value={toDisplayQty(item.qty, item.product.unit_type)} onChange={e => setQuantityFromDisplay(item.product.id, e.target.value)}/><small>{inputUnit(item.product.unit_type)}</small><button onClick={() => changeQty(item.product.id, 1)}><Plus size={15}/></button></div></div>)}
        <div className="orderMeta tokenRow"><label className="grow">Token number<input className="tokenInput" maxLength={10} value={tokenNo} onChange={e => setTokenNo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} placeholder="e.g. 42" /></label></div>
        <div className="orderMeta"><label>Covers<input value={covers} min="1" onChange={e => setCovers(e.target.value)} type="number" /></label><label className="grow">Kitchen note<input maxLength={120} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Less spicy, extra sauce…" /></label></div>
        {f.discounts && <div className="discountBox"><div className="sectionHead"><b>Discount</b>{(selectedDiscount || customValue) && <button className="linkBtn" onClick={resetDiscount}>Remove</button>}</div><select value={selectedDiscount ? discountId : ''} onChange={e => selectDiscount(e.target.value)}><option value="">No discount</option>{activeDiscounts.map(discount => <option key={discount.id} value={discount.id}>{discount.name} • {discount.type === 'percent' ? `${discount.value}%` : money(discount.value, settings.currency_symbol)}{discount.min_order_amount ? ` • min ${money(discount.min_order_amount, settings.currency_symbol)}` : ''}</option>)}</select>{f.customDiscount && !selectedDiscount && <div className="inlineForm"><select value={customType} onChange={e => setCustomType(e.target.value as 'percent' | 'fixed')}><option value="percent">%</option><option value="fixed">₹</option></select><input inputMode="numeric" value={customValue} onChange={e => setCustomValue(e.target.value.replace(/\D/g, ''))} placeholder={`Custom (max ${settings.max_custom_discount_percent}% if %)`}/></div>}</div>}
        {discountAmount > 0 && <div className="summaryLine discount"><span>Discount</span><b>-{money(discountAmount, settings.currency_symbol)}</b></div>}
        <div className="payment"><b>Payment</b><div>{availablePayments.map(method => <button key={method} className={'choice ' + (payment === method ? 'selected' : '') + (localOffline && method !== 'cash' ? ' disabledChoice' : '')} onClick={() => setPayment(method)} disabled={localOffline && method !== 'cash'}>{method === 'pos' ? 'CARD' : method.toUpperCase()}</button>)}</div></div>
        {payment === 'cash' && f.cashChange && <div className="orderMeta"><label className="grow">Cash received<input inputMode="numeric" value={cashReceived} onChange={e => setCashReceived(e.target.value.replace(/\D/g, ''))} placeholder={money(total, settings.currency_symbol)} /></label><div className="changeBox"><span>Change</span><b>{money(change, settings.currency_symbol)}</b></div></div>}
        <div className="summaryLine"><span>Subtotal</span><b>{money(subtotal, settings.currency_symbol)}</b></div><div className="total"><span>Total</span><b>{money(total, settings.currency_symbol)}</b></div>
        <button className="primary bigbtn" disabled={placing || !cart.length} onClick={() => void place()}><Check size={18}/> {placing ? 'Saving…' : 'PLACE ORDER'}</button>
        {last && <div className="ticket"><div>ORDER <b>#{last.order_no < 0 ? `LOCAL-${Math.abs(last.order_no)}` : last.order_no}</b></div>{last.token_no && <div className="tokenBadge big">TOKEN {last.token_no}</div>}{last.items.map(item => <div className="ticketLine" key={item.id}><span>{invoiceItemText(item.product_name, item.qty, item.price, item.unit_type, settings.currency_symbol)}</span><b>{money(lineAmount(item.price, item.qty), settings.currency_symbol)}</b></div>)}<small>{last.syncStatus === 'SYNCED' ? 'SYNCED' : 'LOCAL'} • {last.payment_method.toUpperCase()} • {money(last.total, settings.currency_symbol)}</small>{f.printing && <button className="secondary bigbtn" onClick={printReceipt}><Printer size={17}/> PRINT RECEIPT</button>}</div>}
        {msg && <p className={msg.includes('saved') || msg.includes('started') ? 'successText' : 'error'}>{msg}</p>}
      </aside>
    </div>
    {picking && <QtyPicker product={picking} currency={settings.currency_symbol} qty={pickQty} onQty={setPickQty} onCancel={() => setPicking(null)} onConfirm={confirmPickedQty} />}
  </main>;
}
