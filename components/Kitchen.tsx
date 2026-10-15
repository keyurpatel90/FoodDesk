'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, CloudOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { enqueue, syncNow, updateLocalItem, updateLocalOrderStatus } from '@/lib/offline';
import { loadOrdersWithItems, orderDisplayNo } from '@/lib/order-data';
import type { AppSettings, Order, OrderItem, Station } from '@/lib/types';
import { formatQty } from '@/lib/format';

const stations: [Station | 'all', string][] = [['all', 'All'], ['waffle', 'Waffle'], ['chole', 'Chole Kulche'], ['pav', 'Pav Bataka']];

export default function Kitchen({ settings }: { settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<Station | 'all'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void load();
    const ch = supabase.channel('kitchen-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load).subscribe();
    const timer = window.setInterval(() => { setNow(Date.now()); void load(); }, 15000);
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    window.addEventListener('online', onSync);
    return () => { supabase.removeChannel(ch); window.clearInterval(timer); window.removeEventListener('fooddesk-sync', onSync); window.removeEventListener('online', onSync); };
  }, []);

  async function load() {
    const rows = await loadOrdersWithItems(['new', 'preparing'], undefined, 150);
    setOrders(rows);
  }

  const visible = useMemo(() => orders.filter(order => order.items.some(item => item.status !== 'cancelled' && (station === 'all' || item.station === station))), [orders, station]);

  async function start(order: Order) {
    setBusy(order.id);
    const localId = order.localId ?? order.id;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline || order.syncStatus !== 'SYNCED') {
      await updateLocalOrderStatus(localId, 'preparing');
      await enqueue({ type: 'start_order', localId, payload: {} });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('start_order', { p_order_id: order.serverId ?? order.id });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  async function done(order: Order, item: OrderItem) {
    setBusy(item.id);
    const localId = order.localId ?? order.id;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline || order.syncStatus !== 'SYNCED') {
      await updateLocalItem(localId, item.id, { status: 'done' });
      await enqueue({ type: 'complete_order_item', localId, payload: { local_item_id: item.id, server_item_id: item.serverId ?? (order.syncStatus === 'SYNCED' ? item.id : null) } });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('complete_order_item', { p_item_id: item.serverId ?? item.id });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  const age = (created: string) => Math.max(0, Math.floor((now - new Date(created).getTime()) / 60000));

  return <main className="container"><div className="rolebar"><div><span>Kitchen Display System</span><p className="hint">Live multi-station queue • each station can finish its own items.</p></div><span className="live">{typeof navigator !== 'undefined' && !navigator.onLine ? <><CloudOff size={14}/> OFFLINE</> : '● LIVE'}</span></div><div className="tabs stationtabs">{stations.map(([key, name]) => <button key={key} className={'tab ' + (station === key ? 'active' : '')} onClick={() => setStation(key)}>{name}</button>)}</div><div className="ordergrid">
    {visible.map(order => { const mins = age(order.created_at); const delayed = mins >= settings.kitchen_delay_minutes; const items = order.items.filter(item => item.status !== 'cancelled' && (station === 'all' || item.station === station)); return <article className={'order kitchenOrder ' + (delayed ? 'delayed ' : '') + (order.token_no ? 'hasToken' : '')} key={order.localId ?? order.id}><div className="orderhead"><div><h2>#{orderDisplayNo(order)}</h2>{order.token_no && <span className="tokenBadge">TOKEN {order.token_no}</span>}<span className="muted">{order.covers} cover{order.covers !== 1 ? 's' : ''}</span></div><span className={delayed ? 'delayBadge' : 'ageBadge'}><Clock3 size={14}/> {mins}m</span></div>{delayed && <div className="delayNotice">{mins >= settings.kitchen_delay_minutes * 2 ? 'CRITICAL' : 'WARNING'} • waiting longer than {settings.kitchen_delay_minutes} minutes.</div>}{order.notes && <div className="note">📝 {order.notes}</div>}<div className="orderitems">{items.map(item => <div className={'itemrow ' + (item.status === 'done' ? 'completed' : '')} key={item.id}><span><b>{formatQty(item.qty, item.unit_type)} × {item.product_name}</b><small>{item.station}</small></span>{item.status === 'done' ? <b className="successText"><CheckCircle2 size={18}/> DONE</b> : <button className="success small" disabled={busy === item.id} onClick={() => void done(order, item)}>{busy === item.id ? '…' : 'READY'}</button>}</div>)}</div>{order.status === 'new' && <button className="primary bigbtn" disabled={busy === order.id} onClick={() => void start(order)}>{busy === order.id ? '…' : 'START ORDER'}</button>}</article>; })}
    {!visible.length && <div className="card empty"><h2>No pending orders 🎉</h2><p>Waiting for new orders.</p></div>}
  </div></main>;
}
