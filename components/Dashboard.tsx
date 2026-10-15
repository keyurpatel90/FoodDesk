'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getLocalOrders } from '@/lib/offline';
import { mergeOrders } from '@/lib/order-merge';
import type { AppSettings, Order } from '@/lib/types';
import { csvEscape, money } from '@/lib/format';

export default function Dashboard({ settings }: { settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceDay, setServiceDay] = useState('');

  useEffect(() => {
    void load();
    const ch = supabase.channel('dashboard-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load)
      .subscribe();
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    window.addEventListener('online', onSync);
    return () => { supabase.removeChannel(ch); window.removeEventListener('fooddesk-sync', onSync); window.removeEventListener('online', onSync); };
  }, [serviceDay]);

  async function load() {
    setLoading(true);
    try {
      let query = supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (serviceDay) query = query.eq('service_day', serviceDay) as typeof query;
      const { data: remoteOrders, error } = await query;
      if (error) throw error;
      const rows = (remoteOrders ?? []) as Order[];
      const ids = rows.map(order => order.id);
      const { data: remoteItems } = ids.length ? await supabase.from('order_items').select('*').in('order_id', ids) : { data: [] as unknown[] };
      const withItems = rows.map(order => ({ ...order, items: (remoteItems ?? []).filter((item: { order_id: string }) => item.order_id === order.id) })) as Order[];
      const local = await getLocalOrders();
      setOrders(mergeOrders(withItems, local));
    } catch {
      const local = await getLocalOrders();
      setOrders(local.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally {
      setLoading(false);
    }
  }

  const filtered = serviceDay ? orders.filter(order => order.service_day === serviceDay) : orders;
  const active = filtered.filter(order => order.status !== 'cancelled');
  const revenue = active.reduce((sum, order) => sum + Number(order.total), 0);
  const foodCost = active.reduce((sum, order) => sum + order.items.filter(item => item.status !== 'cancelled').reduce((inner, item) => inner + Number(item.food_cost ?? 0) * Number(item.qty), 0), 0);
  const grossProfit = Math.max(0, revenue - foodCost);
  const margin = revenue ? (grossProfit / revenue) * 100 : 0;
  const covers = active.reduce((sum, order) => sum + Number(order.covers || 1), 0);
  const pending = active.filter(order => order.status === 'new').length;
  const preparing = active.filter(order => order.status === 'preparing').length;
  const ready = active.filter(order => order.status === 'ready').length;
  const delivered = active.filter(order => order.status === 'delivered' || order.status === 'completed').length;
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    active.forEach(order => order.items.forEach(item => {
      if (item.status !== 'cancelled') counts[item.product_name] = (counts[item.product_name] ?? 0) + Number(item.qty);
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [active]);
  const payment = useMemo(() => {
    const totals: Record<string, number> = {};
    active.forEach(order => totals[order.payment_method] = (totals[order.payment_method] ?? 0) + Number(order.total));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [active]);

  function exportCsv() {
    const rows: string[][] = [['Order', 'Service Day', 'Status', 'Subtotal', 'Discount', 'Total', 'Food Cost', 'Gross Profit', 'Payment', 'Covers', 'Token', 'Created At']];
    filtered.forEach(order => {
      const cost = order.items.filter(item => item.status !== 'cancelled').reduce((sum, item) => sum + item.food_cost * item.qty, 0);
      rows.push([`#${order.order_no}`, order.service_day, order.status, String(order.subtotal), String(order.discount_amount), String(order.total), String(cost), String(order.total - cost), order.payment_method, String(order.covers || 1), order.token_no ?? '', new Date(order.created_at).toLocaleString()]);
    });
    const csv = rows.map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `fooddesk-${serviceDay || 'orders'}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="container">
    <div className="rolebar"><div><span>{settings.event_mode ? 'Event Dashboard' : 'Business Dashboard'}</span><p className="hint">{settings.event_name}{settings.event_location ? ` • ${settings.event_location}` : ''}</p></div><div className="toolbar"><input type="date" value={serviceDay} onChange={e => setServiceDay(e.target.value)} /><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button>{settings.features.reports && <button className="secondary" onClick={exportCsv}><Download size={16}/> CSV</button>}</div></div>
    {settings.event_mode && <section className="eventStrip"><b>{settings.event_name}</b><span>{settings.expected_visitors ? `Expected ${settings.expected_visitors.toLocaleString()} visitors` : 'Visitor target not set'}</span><span>{settings.number_stalls} stall{settings.number_stalls !== 1 ? 's' : ''}</span><span>{settings.number_cashiers} cashier{settings.number_cashiers !== 1 ? 's' : ''}</span><span>{settings.number_kitchen_stations} kitchen station{settings.number_kitchen_stations !== 1 ? 's' : ''}</span></section>}
    <div className="stats"><div className="stat"><span>Sales</span><b>{money(revenue, settings.currency_symbol)}</b></div><div className="stat"><span>Orders</span><b>{active.length}</b></div><div className="stat"><span>Gross Profit</span><b>{money(grossProfit, settings.currency_symbol)}</b></div><div className="stat"><span>Gross Margin</span><b>{margin.toFixed(1)}%</b></div></div>
    <div className="stats smallStats sectionSpace"><div className="stat"><span>Food Cost</span><b>{money(foodCost, settings.currency_symbol)}</b></div><div className="stat"><span>Avg / Cover</span><b>{money(covers ? Math.round(revenue / covers) : 0, settings.currency_symbol)}</b></div><div className="stat"><span>Pending / Preparing</span><b>{pending} / {preparing}</b></div><div className="stat"><span>Ready / Delivered</span><b>{ready} / {delivered}</b></div></div>
    <div className="twocol sectionSpace"><section className="card"><h3>Payment Mix</h3>{payment.map(([method, total]) => <div className="salesline" key={method}><b>{method.toUpperCase()}</b><span>{money(total, settings.currency_symbol)}</span></div>)}{ready > 0 && <div className="callout successBg">{ready} order{ready === 1 ? '' : 's'} ready for pickup.</div>}</section><section className="card"><h3>Top Items</h3>{itemCounts.slice(0, 12).map(([name, qty]) => <div className="salesline" key={name}><b>{name}</b><span>{qty}</span></div>)}{!itemCounts.length && <div className="emptyMini">No sales yet.</div>}</section></div>
    <section className="card"><div className="sectionHead"><h3>Recent Orders</h3><span className="muted">{loading ? 'Loading…' : `${filtered.length} in view`}</span></div>{filtered.slice(0, 30).map(order => <div className="cartline" key={order.localId ?? order.id}><div><b>#{order.order_no < 0 ? `LOCAL-${Math.abs(order.order_no)}` : order.order_no}</b><small>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {order.covers || 1} cover{(order.covers || 1) !== 1 ? 's' : ''}</small></div><span>{money(order.total, settings.currency_symbol)}</span><span className={'status ' + order.status}>{order.status}</span></div>)}</section>
  </main>;
}
