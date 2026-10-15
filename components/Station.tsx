'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CloudOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { enqueue, syncNow, updateLocalItem } from '@/lib/offline';
import { loadOrdersWithItems, orderDisplayNo } from '@/lib/order-data';
import type { AppSettings, Order, Station as StationType } from '@/lib/types';
import { formatQty } from '@/lib/format';

const names: Record<StationType, string> = { waffle: 'Waffle Station', chole: 'Chole Kulche Station', pav: 'Pav Bataka Station' };

export default function Station({ station, settings }: { station: StationType; settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void load();
    const ch = supabase.channel(`station-v3-${station}`).on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe();
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    return () => { supabase.removeChannel(ch); window.removeEventListener('fooddesk-sync', onSync); };
  }, [station]);

  async function load() { setOrders(await loadOrdersWithItems(['new', 'preparing'], station)); }

  async function done(order: Order, itemId: string) {
    setBusy(itemId);
    const localId = order.localId ?? order.id;
    const item = order.items.find(row => row.id === itemId);
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (item && (offline || order.syncStatus !== 'SYNCED')) {
      await updateLocalItem(localId, itemId, { status: 'done' });
      await enqueue({ type: 'complete_order_item', localId, payload: { local_item_id: itemId, server_item_id: item.serverId ?? null } });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('complete_order_item', { p_item_id: item?.serverId ?? itemId });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  return <main className="container stationpage"><div className="rolebar"><div><span>{names[station]}</span><p className="hint">Only {station} dishes are shown; finish items independently.</p></div><span className="live">{typeof navigator !== 'undefined' && !navigator.onLine ? <><CloudOff size={14}/> OFFLINE</> : '● LIVE'}</span></div><div className="ordergrid">{orders.map(order => <article className={'order ' + (order.token_no ? 'hasToken' : '')} key={order.localId ?? order.id}><div className="orderhead"><div><h2>#{orderDisplayNo(order)}</h2>{order.token_no && <span className="tokenBadge">TOKEN {order.token_no}</span>}</div><span className="station">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>{order.notes && <div className="note">📝 {order.notes}</div>}{order.items.filter(item => item.status !== 'cancelled' && item.station === station).map(item => <div className="stationitem" key={item.id}><b>{formatQty(item.qty, item.unit_type)} × {item.product_name}</b>{item.status === 'done' ? <span className="successText"><CheckCircle2 size={18}/> DONE</span> : <button className="success small" disabled={busy === item.id} onClick={() => void done(order, item.id)}>READY</button>}</div>)}</article>)}{!orders.length && <div className="card empty"><h2>All clear 🎉</h2><p>Waiting for new orders.</p></div>}</div></main>;
}
