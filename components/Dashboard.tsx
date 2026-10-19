'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, BellRing, CheckCircle2, ChefHat, Clock3, CloudOff, CreditCard, Download, ReceiptText, RefreshCw, Smartphone, TrendingUp, Trophy, Users, Wallet, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getLocalOrders } from '@/lib/offline';
import { mergeOrders } from '@/lib/order-merge';
import type { AppSettings, Order } from '@/lib/types';
import { compact, csvEscape, money } from '@/lib/format';
import { Bars, Donut, Sparkline, TrendChart } from '@/components/Charts';

type Bucket = { key: string; label: string; sales: number; orders: number; profit: number };
type Metric = 'sales' | 'orders' | 'profit';
type NavTarget = 'orders' | 'runner' | 'cashier';

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const dayLabel = (day: string) => {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const orderCost = (o: Order) => o.items.filter(i => i.status !== 'cancelled').reduce((s, i) => s + Number(i.food_cost ?? 0) * Number(i.qty), 0);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PAYMENT: Record<string, { label: string; icon: LucideIcon; color: string; tone: string }> = {
  cash: { label: 'Cash', icon: Banknote, color: '#72e128', tone: 't-success' },
  upi: { label: 'UPI', icon: Smartphone, color: '#666cff', tone: 't-primary' },
  pos: { label: 'Card', icon: CreditCard, color: '#26c6f9', tone: 't-info' },
};
const STATUS_TONE: Record<string, string> = { new: 't-info', preparing: 't-warning', ready: 't-success', delivered: 't-primary', completed: 't-primary', cancelled: 't-danger' };

function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return <span className={'delta ' + (up ? 'up' : 'down')} title="Latest service day vs the day before">{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(Math.round(value))}%</span>;
}

function Kpi({ icon: Icon, tone, label, value, sub, delta, spark }: { icon: LucideIcon; tone: string; label: string; value: string; sub?: string; delta: number | null; spark: number[] }) {
  return <section className={'card kpi ' + tone}>
    <div className="kpiTop"><span className="tonal"><Icon size={20} /></span><Delta value={delta} /></div>
    <div className="kpiValue">{value}</div>
    <div className="kpiLabel">{label}</div>
    {sub && <div className="kpiSub">{sub}</div>}
    <Sparkline values={spark} />
  </section>;
}

export default function Dashboard({ settings, userName, nav }: { settings: AppSettings; userName?: string; nav?: Partial<Record<NavTarget, () => void>> }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceDay, setServiceDay] = useState('');
  const [metric, setMetric] = useState<Metric>('sales');

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

  const sym = settings.currency_symbol;
  const cutoff = settings.service_day_cutoff_hour ?? 5;
  const filtered = useMemo(() => serviceDay ? orders.filter(order => order.service_day === serviceDay) : orders, [orders, serviceDay]);
  const active = useMemo(() => filtered.filter(order => order.status !== 'cancelled'), [filtered]);

  const totals = useMemo(() => {
    const revenue = active.reduce((sum, o) => sum + Number(o.total), 0);
    const foodCost = active.reduce((sum, o) => sum + orderCost(o), 0);
    const grossProfit = Math.max(0, revenue - foodCost);
    const covers = active.reduce((sum, o) => sum + Number(o.covers || 1), 0);
    return { revenue, foodCost, grossProfit, covers, margin: revenue ? (grossProfit / revenue) * 100 : 0 };
  }, [active]);
  const { revenue, foodCost, grossProfit, covers, margin } = totals;

  const pipeline = useMemo(() => {
    const count = (...s: Order['status'][]) => active.filter(o => s.includes(o.status)).length;
    return [
      { key: 'new', label: 'New', tone: 't-info', value: count('new') },
      { key: 'preparing', label: 'Preparing', tone: 't-warning', value: count('preparing') },
      { key: 'ready', label: 'Ready', tone: 't-success', value: count('ready') },
      { key: 'delivered', label: 'Delivered', tone: 't-primary', value: count('delivered', 'completed') },
    ];
  }, [active]);
  const ready = pipeline[2].value;

  const hourly = useMemo<Bucket[]>(() => {
    if (!active.length) return [];
    const per: Record<number, Bucket> = {};
    const blank = (k: number): Bucket => ({ key: String(k), label: hourLabel((k + cutoff) % 24), sales: 0, orders: 0, profit: 0 });
    active.forEach(o => {
      const k = (new Date(o.created_at).getHours() - cutoff + 24) % 24;
      const b = (per[k] ??= blank(k));
      b.sales += Number(o.total); b.orders += 1; b.profit += Number(o.total) - orderCost(o);
    });
    const ks = Object.keys(per).map(Number);
    let lo = Math.min(...ks), hi = Math.max(...ks);
    while (hi - lo + 1 < 6) { if (hi < 23) hi++; else if (lo > 0) lo--; else break; }
    const out: Bucket[] = [];
    for (let k = lo; k <= hi; k++) out.push(per[k] ?? blank(k));
    return out;
  }, [active, cutoff]);

  const daily = useMemo<Bucket[]>(() => {
    const days = Array.from(new Set(active.map(o => o.service_day))).sort().slice(-10);
    return days.map(day => {
      const list = active.filter(o => o.service_day === day);
      const sales = list.reduce((s, o) => s + Number(o.total), 0);
      return { key: day, label: dayLabel(day), sales, orders: list.length, profit: sales - list.reduce((s, o) => s + orderCost(o), 0) };
    });
  }, [active]);

  const byDay = !serviceDay && daily.length >= 2;
  const trend = byDay ? daily : hourly;
  const delta = (pick: (b: Bucket) => number) => {
    if (!byDay) return null;
    const prev = pick(daily[daily.length - 2]);
    return prev ? ((pick(daily[daily.length - 1]) - prev) / prev) * 100 : null;
  };
  const series = (k: Metric) => trend.map(b => b[k]);

  const items = useMemo(() => {
    const stats: Record<string, { qty: number; rev: number }> = {};
    active.forEach(o => o.items.forEach(i => {
      if (i.status === 'cancelled') return;
      const s = (stats[i.product_name] ??= { qty: 0, rev: 0 });
      s.qty += Number(i.qty); s.rev += Number(i.price) * Number(i.qty);
    }));
    return Object.entries(stats).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.rev - a.rev);
  }, [active]);
  const topItem = items[0];
  const itemTotal = items.reduce((s, i) => s + i.rev, 0);

  const payment = useMemo(() => {
    const t: Record<string, number> = {};
    active.forEach(o => { t[o.payment_method] = (t[o.payment_method] ?? 0) + Number(o.total); });
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [active]);

  const queue = useMemo(() => {
    let waiting = 0, cooking = 0, finished = 0;
    active.forEach(o => o.items.forEach(i => {
      if (i.status === 'cancelled') return;
      if (i.status === 'done') finished += 1; else if (o.status === 'new') waiting += 1; else cooking += 1;
    }));
    return { waiting, cooking, finished, total: waiting + cooking + finished };
  }, [active]);

  const peak = hourly.length ? hourly.reduce((a, b) => (b.orders > a.orders ? b : a)) : null;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const first = userName?.trim().split(' ')[0];
  const metricMeta: Record<Metric, { label: string; format: (n: number) => string; axis: (n: number) => string; min: number }> = {
    sales: { label: 'Sales', format: n => money(n, sym), axis: n => `${sym}${compact(n)}`, min: 0 },
    profit: { label: 'Profit', format: n => money(n, sym), axis: n => `${sym}${compact(n)}`, min: 0 },
    orders: { label: 'Orders', format: n => `${Math.round(n)} order${Math.round(n) === 1 ? '' : 's'}`, axis: n => String(Math.round(n)), min: 4 },
  };
  const m = metricMeta[metric];

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

  return <main className="container" aria-busy={loading}>
    <div className="pageHead">
      <div>
        <h1>Dashboard</h1>
        <p className="hint">{settings.business_name} {offline ? <span className="live off"><CloudOff size={13} /> Offline, showing this device</span> : <span className="live">● Live</span>}</p>
      </div>
      <div className="toolbar">
        <input type="date" aria-label="Service day" value={serviceDay} onChange={e => setServiceDay(e.target.value)} />
        <button className="secondary" onClick={() => void load()}><RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh</button>
        {settings.features.reports && <button className="secondary" onClick={exportCsv}><Download size={16} /> CSV</button>}
      </div>
    </div>

    <div className="dash">
      <section className="card hero">
        <div className="heroText">
          {topItem ? <>
            <h3>Great service{first ? `, ${first}` : ''}! 🎉</h3>
            <p className="muted">Best seller {serviceDay ? `on ${dayLabel(serviceDay)}` : 'so far'}</p>
            <div className="heroName">{topItem.name}</div>
            <p className="heroSub">{Number(topItem.qty.toFixed(2))} sold • {itemTotal ? Math.round((topItem.rev / itemTotal) * 100) : 0}% of sales</p>
            {nav?.orders && <button className="primary small" onClick={nav.orders}>View orders</button>}
          </> : <>
            <h3>Ready for service{first ? `, ${first}` : ''}</h3>
            <p className="muted">No sales {serviceDay ? 'on this day' : 'yet'}. New orders appear here the moment they are placed.</p>
            {nav?.cashier && <button className="primary small" onClick={nav.cashier}>Open cashier</button>}
          </>}
        </div>
        <span className="heroTrophy" aria-hidden="true"><Trophy size={46} /></span>
      </section>

      <div className="kpis">
        <Kpi icon={Wallet} tone="t-primary" label="Sales" value={money(revenue, sym)} delta={delta(b => b.sales)} spark={series('sales')} />
        <Kpi icon={ReceiptText} tone="t-info" label="Orders" value={String(active.length)} sub={`${covers} cover${covers === 1 ? '' : 's'}`} delta={delta(b => b.orders)} spark={series('orders')} />
        <Kpi icon={TrendingUp} tone="t-success" label="Gross profit" value={money(grossProfit, sym)} sub={`${margin.toFixed(1)}% margin • food cost ${money(foodCost, sym)}`} delta={delta(b => b.profit)} spark={series('profit')} />
        <Kpi icon={Users} tone="t-warning" label="Average per cover" value={money(covers ? Math.round(revenue / covers) : 0, sym)} sub={active.length ? `${money(Math.round(revenue / active.length), sym)} per order` : undefined} delta={null} spark={trend.map(b => (b.orders ? b.sales / b.orders : 0))} />
      </div>

      <section className="card trend">
        <div className="cardHead">
          <div><h3>{byDay ? 'Sales by day' : 'Sales by hour'}</h3><p className="hint">{byDay ? 'Last 10 service days' : serviceDay ? dayLabel(serviceDay) : 'Across the event so far'}</p></div>
          <div className="pills" role="tablist" aria-label="Chart metric">{(['sales', 'orders', 'profit'] as Metric[]).map(k => <button key={k} role="tab" aria-selected={metric === k} className={'pill' + (metric === k ? ' on' : '')} onClick={() => setMetric(k)}>{metricMeta[k].label}</button>)}</div>
        </div>
        {trend.length ? <TrendChart labels={trend.map(b => b.label)} values={series(metric)} format={m.format} axisFormat={m.axis} minMax={m.min} ariaLabel={`${m.label} ${byDay ? 'by day' : 'by hour'}`} /> : <div className="emptyMini"><p>No sales to chart yet.</p></div>}
      </section>

      <section className="card pipe">
        <div className="cardHead"><div><h3>Order pipeline</h3><p className="hint">{active.length} active order{active.length === 1 ? '' : 's'}</p></div></div>
        <div className="stack100" aria-hidden="true">{active.length ? pipeline.map(p => p.value > 0 && <i key={p.key} className={p.tone} style={{ flexGrow: p.value }} />) : <i className="empty" />}</div>
        <ul className="legend">{pipeline.map(p => <li key={p.key} className={p.tone}><span className="dot" /><span>{p.label}</span><b>{p.value}</b><small>{active.length ? Math.round((p.value / active.length) * 100) : 0}%</small></li>)}</ul>
        {ready > 0 && <div className="readyCall"><BellRing size={18} /><span>{ready} order{ready === 1 ? '' : 's'} ready for pickup</span>{nav?.runner && <button className="linkBtn" onClick={nav.runner}>Open runner</button>}</div>}
      </section>

      <section className="card third">
        <div className="cardHead"><div><h3>Payment mix</h3><p className="hint">Share of sales</p></div></div>
        {payment.length ? <>
          <div className="donutRow"><Donut label="Sales by payment method" segments={payment.map(([k, v]) => ({ label: k, value: v, color: PAYMENT[k]?.color ?? '#6d788d' }))}><b>{money(revenue, sym)}</b><small>total</small></Donut></div>
          <ul className="rows">{payment.map(([k, v]) => { const p = PAYMENT[k] ?? { label: k.toUpperCase(), icon: Wallet, tone: 't-secondary' }; const Icon = p.icon; return <li key={k} className={p.tone}><span className="tonal sm"><Icon size={16} /></span><span className="grow">{p.label}</span><b>{money(v, sym)}</b><small>{revenue ? Math.round((v / revenue) * 100) : 0}%</small></li>; })}</ul>
        </> : <div className="emptyMini"><p>No payments yet.</p></div>}
      </section>

      <section className="card third">
        <div className="cardHead"><div><h3>Peak hours</h3><p className="hint">{peak && peak.orders ? `Busiest at ${peak.label} with ${peak.orders} order${peak.orders === 1 ? '' : 's'}` : 'Orders per hour'}</p></div></div>
        {hourly.length ? <Bars ariaLabel="Orders per hour" items={hourly.map(b => ({ label: b.label, value: b.orders, hint: `${b.label}: ${b.orders} order${b.orders === 1 ? '' : 's'}, ${money(b.sales, sym)}` }))} /> : <div className="emptyMini"><p>Busy hours show up after the first orders.</p></div>}
      </section>

      <section className="card third">
        <div className="cardHead"><div><h3>Kitchen queue</h3><p className="hint">Items by stage</p></div></div>
        {queue.total ? <ul className="rows">{([['New items', queue.waiting, Clock3, 't-warning'], ['Cooking', queue.cooking, ChefHat, 't-info'], ['Done', queue.finished, CheckCircle2, 't-success']] as [string, number, LucideIcon, string][]).map(([label, n, Icon, tone]) => <li key={label} className={'stationRow ' + tone}><span className="tonal sm"><Icon size={16} /></span><div className="grow"><div className="rowBetween"><span>{label}</span><b>{n}</b></div><div className="track" role="progressbar" aria-valuenow={Math.round((n / queue.total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} share of items`}><i style={{ width: `${Math.round((n / queue.total) * 100)}%` }} /></div></div></li>)}</ul> : <div className="emptyMini"><ChefHat size={22} /><p>No kitchen activity yet.</p></div>}
      </section>

      <section className="card recent">
        <div className="cardHead"><div><h3>Recent orders</h3><p className="hint">{loading ? 'Loading…' : `${filtered.length} in view`}</p></div>{nav?.orders && <button className="secondary small" onClick={nav.orders}>View all</button>}</div>
        {filtered.length ? <table className="tbl"><thead><tr><th>Order</th><th className="c-covers">Covers</th><th className="c-pay">Payment</th><th className="num">Total</th><th>Status</th></tr></thead><tbody>
          {filtered.slice(0, 12).map(order => { const pay = PAYMENT[order.payment_method]; return <tr key={order.localId ?? order.id}>
            <td><b>#{order.order_no < 0 ? `LOCAL-${Math.abs(order.order_no)}` : order.order_no}</b>{order.token_no && <span className="chip t-warning tok">Token {order.token_no}</span>}<small className="when">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></td>
            <td className="c-covers">{order.covers || 1}</td>
            <td className="c-pay">{pay ? pay.label : order.payment_method.toUpperCase()}</td>
            <td className="num"><b>{money(order.total, sym)}</b></td>
            <td><span className={'chip ' + (STATUS_TONE[order.status] ?? 't-secondary')}>{cap(order.status)}</span></td>
          </tr>; })}
        </tbody></table> : <div className="emptyMini"><p>No orders yet.</p></div>}
      </section>

      <section className="card top">
        <div className="cardHead"><div><h3>Top items</h3><p className="hint">By sales value</p></div></div>
        {items.length ? <ul className="rows">{items.slice(0, 7).map((it, i) => <li key={it.name} className="topRow t-primary"><span className="rank">{i + 1}</span><div className="grow"><div className="rowBetween"><span className="clip">{it.name}</span><b>{money(it.rev, sym)}</b></div><div className="track" aria-hidden="true"><i style={{ width: `${items[0].rev ? (it.rev / items[0].rev) * 100 : 0}%` }} /></div><small>{Number(it.qty.toFixed(2))} sold</small></div></li>)}</ul> : <div className="emptyMini"><p>No sales yet.</p></div>}
      </section>
    </div>
  </main>;
}
