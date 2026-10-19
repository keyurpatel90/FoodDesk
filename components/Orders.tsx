'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { enqueue, saveLocalOrder, syncNow, updateLocalItem, updateLocalOrderStatus } from '@/lib/offline';
import { loadOrdersWithItems, orderDisplayNo } from '@/lib/order-data';
import { canonicalRole } from '@/lib/types';
import type { AppSettings, Order, OrderItem, Profile } from '@/lib/types';
import { formatQty, invoiceItemText, lineAmount, money, unitLabel } from '@/lib/format';

export default function Orders({ settings, profile }: { settings: AppSettings; profile: Profile }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    void load();
    const ch = supabase.channel('orders-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load).subscribe();
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    window.addEventListener('online', onSync);
    return () => { supabase.removeChannel(ch); window.removeEventListener('fooddesk-sync', onSync); window.removeEventListener('online', onSync); };
  }, []);

  async function load() { setLoading(true); setOrders(await loadOrdersWithItems(undefined, 150)); setLoading(false); }
  const visibleOrders = canonicalRole(profile.role) === 'cashier' ? orders.filter(order => order.created_by === profile.id) : orders;
  const filtered = useMemo(() => visibleOrders.filter(order => (status === 'all' || order.status === status) && (!search || orderDisplayNo(order).toLowerCase().includes(search.toLowerCase()) || (order.token_no ?? '').toLowerCase().includes(search.toLowerCase()) || order.items.some(item => item.product_name.toLowerCase().includes(search.toLowerCase())))), [orders, status, search]);

  async function cancelLine(item: OrderItem, order: Order) {
    const reason = window.prompt('Reason for cancelling this line?', 'Mis-tap');
    if (reason === null) return;
    setBusy(item.id);
    const localId = order.localId ?? order.id;
    if ((order.syncStatus ?? 'SYNCED') !== 'SYNCED' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await updateLocalItem(localId, item.id, { status: 'cancelled', cancel_reason: reason });
      await enqueue({ type: 'cancel_order_item', localId, payload: { local_item_id: item.id, server_item_id: item.serverId ?? (item.id === localId ? null : item.id), product_id: item.product_id, reason } });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('cancel_order_item', { p_item_id: item.serverId ?? item.id, p_reason: reason });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  async function cancelOrder(order: Order) {
    if (canonicalRole(profile.role) === 'cashier' && order.created_by !== profile.id && order.syncStatus === 'SYNCED') {
      alert('Cashiers can only correct their own orders.'); return;
    }
    const reason = window.prompt(`Cancel order #${orderDisplayNo(order)}? Reason:`, 'Customer cancelled');
    if (reason === null) return;
    setBusy(order.id);
    const localId = order.localId ?? order.id;
    if ((order.syncStatus ?? 'SYNCED') !== 'SYNCED' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      await updateLocalOrderStatus(localId, 'cancelled');
      await enqueue({ type: 'cancel_order', localId, payload: { reason } });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: order.serverId ?? order.id, p_reason: reason });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  function print(order: Order) {
    const html = `<!doctype html><html><head><title>Order #${orderDisplayNo(order)}</title><style>body{font-family:Arial;width:330px;margin:20px auto}div{display:flex;justify-content:space-between;margin:7px 0}.c{text-align:center}hr{border:0;border-top:1px dashed #000}</style></head><body><h2 class="c">${settings.business_name}</h2><div><b>ORDER #${orderDisplayNo(order)}</b><span>${new Date(order.created_at).toLocaleTimeString()}</span></div>${order.token_no ? `<p style="font-size:22px;font-weight:bold;border:2px solid #000;padding:6px;text-align:center">TOKEN ${order.token_no}</p>` : ''}<p>Covers: ${order.covers}</p>${order.items.filter(item => item.status !== 'cancelled').map(item => `<div><span>${invoiceItemText(item.product_name, item.qty, item.price, item.unit_type, settings.currency_symbol)}</span><span>${money(lineAmount(item.price, item.qty), settings.currency_symbol)}</span></div>`).join('')}<hr>${order.discount_amount ? `<div><span>Discount</span><b>-${money(order.discount_amount, settings.currency_symbol)}</b></div>` : ''}<div><b>Total</b><b>${money(order.total, settings.currency_symbol)}</b></div><p>Payment: ${order.payment_method.toUpperCase()}</p><p>${order.notes ?? ''}</p></body></html>`;
    const w = window.open('', '_blank', 'width=380,height=640');
    if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }

  return <main className="container"><div className="rolebar"><div><span>Order Management</span><p className="hint">Search, correct, cancel and reprint without losing history.</p></div></div><div className="toolbar"><input className="search" placeholder="Search order #, token or item" value={search} onChange={e => setSearch(e.target.value)} />{['all', 'new', 'preparing', 'ready', 'delivered', 'cancelled'].map(value => <button key={value} className={'choice ' + (status === value ? 'selected' : '')} onClick={() => setStatus(value)}>{value.toUpperCase()}</button>)}</div>
    <section className="orderList sectionSpace">{loading && <div className="card">Loading orders…</div>}{!loading && !filtered.length && <div className="card empty"><h2>No matching orders</h2></div>}{filtered.map(order => <article className={'card orderDetail ' + (order.status === 'cancelled' ? 'cancelled ' : '') + (order.token_no ? 'hasToken' : '')} key={order.localId ?? order.id}><div className="orderhead"><div><h2>#{orderDisplayNo(order)}{order.token_no && <span className="tokenBadge">TOKEN {order.token_no}</span>}</h2><small>{new Date(order.created_at).toLocaleString()} • {order.covers} cover{order.covers !== 1 ? 's' : ''}{order.syncStatus !== 'SYNCED' ? ' • local' : ''}</small></div><div className="orderActions"><span className={'status ' + order.status}>{order.status}</span>{settings.features.printing && <button className="secondary" onClick={() => print(order)}><Printer size={16}/></button>}{order.status !== 'cancelled' && order.status !== 'delivered' && <button className="dangerBtn" disabled={busy === order.id} onClick={() => void cancelOrder(order)}><XCircle size={16}/> Cancel</button>}</div></div>{order.syncStatus === 'FAILED' && <div className="delayNotice">Sync issue: {order.syncError ?? 'Retrying automatically.'}</div>}{order.notes && <div className="note">📝 {order.notes}</div>}{order.items.map(item => <div className={'itemrow ' + (item.status === 'cancelled' ? 'completed' : '')} key={item.id}><span>{formatQty(item.qty, item.unit_type)} × <b>{item.product_name}</b><small>{money(item.price, settings.currency_symbol)} / {unitLabel(item.unit_type)} • line {money(lineAmount(item.price, item.qty), settings.currency_symbol)}</small></span><span>{item.status === 'cancelled' ? <span className="status cancelledTxt">CANCELLED</span> : order.status !== 'cancelled' && <button className="linkDanger" disabled={busy === item.id} onClick={() => void cancelLine(item, order)}>Cancel line</button>}</span></div>)}<div className="summaryLine"><span>{order.discount_amount ? 'Subtotal / Discount / Total' : 'Total'}</span><b>{order.discount_amount ? `${money(order.subtotal, settings.currency_symbol)} / -${money(order.discount_amount, settings.currency_symbol)} / ${money(order.total, settings.currency_symbol)}` : money(order.total, settings.currency_symbol)}</b></div></article>)}</section>
  </main>;
}
