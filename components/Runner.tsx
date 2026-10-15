'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getLocalOrders, saveLocalOrder, enqueue, syncNow, updateLocalOrderStatus } from '@/lib/offline';
import { mergeOrders, normalizedRemoteOrder } from '@/lib/order-merge';
import type { AppSettings, Order } from '@/lib/types';
import { formatQty } from '@/lib/format';

export default function Runner({ settings }: { settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const ch = supabase.channel('runner-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    window.addEventListener('online', onSync);
    return () => { supabase.removeChannel(ch); window.removeEventListener('fooddesk-sync', onSync); window.removeEventListener('online', onSync); };
  }, []);

  async function load() {
    const { data } = await supabase.from('orders').select('*').eq('status', 'ready').order('created_at', { ascending: true });
    const remote = (data ?? []) as Order[];
    const local = await getLocalOrders();
    setOrders(mergeOrders(remote, local).filter(order => order.status === 'ready'));
    for (const order of remote) await saveLocalOrder(normalizedRemoteOrder(order));
  }

  async function deliver(order: Order) {
    setBusy(order.id);
    const localId = order.localId ?? order.id;
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || order.syncStatus !== 'SYNCED') {
      await updateLocalOrderStatus(localId, 'delivered');
      await enqueue({ type: 'deliver_order', localId, payload: {} });
      setBusy(null);
      await load();
      return;
    }
    const serverId = order.serverId ?? order.id;
    const { error } = await supabase.rpc('deliver_order', { p_order_id: serverId });
    if (!error) {
      void syncNow();
    } else {
      alert(error.message);
    }
    setBusy(null);
    await load();
  }

  return <main className="container"><div className="rolebar"><div><span>Runner / Pickup</span><p className="hint">Hand over ready orders and keep the handoff queue moving.</p></div></div>
    <div className="ordergrid">{orders.map(order => <article className={'order ' + (order.token_no ? 'hasToken' : '')} key={order.localId ?? order.id}>
      <div className="orderhead"><div><h2>#{order.order_no < 0 ? `LOCAL-${Math.abs(order.order_no)}` : order.order_no}</h2>{order.token_no && <span className="tokenBadge">TOKEN {order.token_no}</span>}</div><span className="ageBadge"><Clock3 size={14}/> {Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000))}m</span></div>
      <div className="station">{order.covers} cover{order.covers !== 1 ? 's' : ''} • {order.payment_method.toUpperCase()}</div>
      {order.items.filter(item => item.status !== 'cancelled').map(item => <div className="itemrow" key={item.id}><span>{formatQty(item.qty, item.unit_type)} × <b>{item.product_name}</b></span><CheckCircle2 size={17}/></div>)}
      <button className="success bigbtn" disabled={busy === order.id} onClick={() => void deliver(order)}>{busy === order.id ? '...' : 'MARK DELIVERED'}</button>
    </article>)}{!orders.length && <div className="card empty"><h2>No ready orders</h2><p>Kitchen handoffs will appear here.</p></div>}</div>
  </main>;
}
