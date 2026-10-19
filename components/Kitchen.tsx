'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChefHat, Clock3, CloudOff, Layers, LayoutGrid, PackageCheck, Printer, RefreshCw, Hourglass } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { enqueue, syncNow, updateLocalItem, updateLocalOrderStatus } from '@/lib/offline';
import { loadOrdersWithItems, orderDisplayNo } from '@/lib/order-data';
import { printKitchenTicket } from '@/lib/print';
import type { AppSettings, Order, OrderItem } from '@/lib/types';
import { formatQty } from '@/lib/format';

type Col = 'new' | 'cooking' | 'ready';
type View = 'items' | 'orders';
type Card = { key: string; order: Order; item: OrderItem; col: Col };

const COLS: { key: Col; title: string; tone: string; icon: typeof Clock3; empty: string }[] = [
  { key: 'new', title: 'New items', tone: 't-warning', icon: Clock3, empty: 'No pending items' },
  { key: 'cooking', title: 'Cooking', tone: 't-info', icon: ChefHat, empty: 'Nothing cooking' },
  { key: 'ready', title: 'Ready for pickup', tone: 't-success', icon: CheckCircle2, empty: 'No items ready' },
];
const READY_LIMIT = 20;
const PRINT_KEY = 'fooddesk-kitchen-autoprint';

const orderKey = (o: Order) => o.client_order_id ?? o.localId ?? o.id;
const orderCol = (o: Order): Col => (o.status === 'new' ? 'new' : o.status === 'ready' ? 'ready' : 'cooking');

export default function Kitchen({ settings }: { settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('items');
  const [mobileCol, setMobileCol] = useState<Col>('new');
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [autoPrint, setAutoPrint] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const canPrint = settings.features.printing !== false;

  useEffect(() => {
    try { setAutoPrint(window.localStorage.getItem(PRINT_KEY) === 'on'); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel('kitchen-board').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, load).subscribe();
    const timer = window.setInterval(() => { setNow(Date.now()); void load(); }, 15000);
    const onSync = () => { void load(); };
    window.addEventListener('fooddesk-sync', onSync);
    window.addEventListener('online', onSync);
    return () => { supabase.removeChannel(ch); window.clearInterval(timer); window.removeEventListener('fooddesk-sync', onSync); window.removeEventListener('online', onSync); };
  }, []);

  async function load() {
    setOrders(await loadOrdersWithItems(['new', 'preparing', 'ready'], 200));
    setLoaded(true);
  }

  // Auto-print: print each order that appears after the board first loaded (never the backlog).
  useEffect(() => {
    if (!loaded) return;
    if (seen.current === null) { seen.current = new Set(orders.map(orderKey)); return; }
    for (const o of orders) {
      const k = orderKey(o);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (autoPrint && canPrint && o.status === 'new') printKitchenTicket(o, settings.business_name);
    }
  }, [orders, loaded, autoPrint, canPrint, settings.business_name]);

  function toggleAutoPrint() {
    const next = !autoPrint;
    setAutoPrint(next);
    try { window.localStorage.setItem(PRINT_KEY, next ? 'on' : 'off'); } catch { /* storage unavailable */ }
  }

  const age = (created: string) => Math.max(0, Math.floor((now - new Date(created).getTime()) / 60000));
  const offlineNow = () => typeof navigator !== 'undefined' && !navigator.onLine;

  async function start(order: Order) {
    setBusy(order.id);
    const localId = order.localId ?? order.id;
    if (offlineNow() || order.syncStatus !== 'SYNCED') {
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
    if (offlineNow() || order.syncStatus !== 'SYNCED') {
      await updateLocalItem(localId, item.id, { status: 'done' });
      await enqueue({ type: 'complete_order_item', localId, payload: { local_item_id: item.id, server_item_id: item.serverId ?? (order.syncStatus === 'SYNCED' ? item.id : null) } });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('complete_order_item', { p_item_id: item.serverId ?? item.id });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  async function handOver(order: Order) {
    setBusy(order.id);
    const localId = order.localId ?? order.id;
    if (offlineNow() || order.syncStatus !== 'SYNCED') {
      await updateLocalOrderStatus(localId, 'delivered');
      await enqueue({ type: 'deliver_order', localId, payload: {} });
      void syncNow();
    } else {
      const { error } = await supabase.rpc('deliver_order', { p_order_id: order.serverId ?? order.id });
      if (error) alert(error.message);
    }
    setBusy(null); await load();
  }

  async function syncAll() {
    setSyncing(true);
    try { await syncNow(); } finally { await load(); setSyncing(false); }
  }

  const cards = useMemo<Card[]>(() => orders.flatMap(order => order.items
    .filter(item => item.status !== 'cancelled')
    .map(item => ({ key: `${orderKey(order)}:${item.id}`, order, item, col: (item.status === 'done' ? 'ready' : order.status === 'new' ? 'new' : 'cooking') as Col }))), [orders]);

  const byCol = useMemo(() => {
    const oldest = (a: { order: Order }, b: { order: Order }) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime();
    const items: Record<Col, Card[]> = { new: [], cooking: [], ready: [] };
    cards.forEach(c => items[c.col].push(c));
    items.new.sort(oldest); items.cooking.sort(oldest); items.ready.sort((a, b) => oldest(b, a));
    const tickets: Record<Col, Order[]> = { new: [], cooking: [], ready: [] };
    orders.filter(o => o.items.some(i => i.status !== 'cancelled')).forEach(o => tickets[orderCol(o)].push(o));
    tickets.new.sort((a, b) => oldest({ order: a }, { order: b })); tickets.cooking.sort((a, b) => oldest({ order: a }, { order: b })); tickets.ready.sort((a, b) => oldest({ order: b }, { order: a }));
    return { items, tickets };
  }, [cards, orders]);

  const activeItems = byCol.items.new.length + byCol.items.cooking.length;
  const activeOrders = byCol.tickets.new.length + byCol.tickets.cooking.length;

  const summary = useMemo(() => {
    const m = new Map<string, { name: string; unit: OrderItem['unit_type']; qty: number; orders: Set<string> }>();
    cards.filter(c => c.col !== 'ready').forEach(c => {
      const row = m.get(c.item.product_name) ?? { name: c.item.product_name, unit: c.item.unit_type, qty: 0, orders: new Set<string>() };
      row.qty += Number(c.item.qty); row.orders.add(orderKey(c.order)); m.set(c.item.product_name, row);
    });
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
  }, [cards]);

  const delayed = (o: Order) => o.status !== 'ready' && age(o.created_at) >= settings.kitchen_delay_minutes;
  const countFor = (c: Col) => view === 'items' ? byCol.items[c].length : byCol.tickets[c].length;

  const tokenChip = (o: Order) => o.token_no ? <span className="chip t-warning">Token {o.token_no}</span> : null;
  const ageBadge = (o: Order) => <span className={delayed(o) ? 'delayBadge' : 'ageBadge'} title={delayed(o) ? `Waiting longer than ${settings.kitchen_delay_minutes} minutes` : 'Time since order'}><Clock3 size={14} /> {age(o.created_at)}m</span>;

  function itemCard({ key, order, item, col }: Card) {
    const siblings = order.items.filter(i => i.status !== 'cancelled').length;
    return <article className={'kCard' + (col !== 'ready' && delayed(order) ? ' late' : '') + (col === 'ready' ? ' isReady' : '')} key={key}>
      <div className="kTop"><span className="kQty">{formatQty(item.qty, item.unit_type)}</span>{ageBadge(order)}</div>
      <h4>{item.product_name}</h4>
      <div className="kMeta"><b>#{orderDisplayNo(order)}</b>{tokenChip(order)}<span className="muted">{order.covers} cover{order.covers === 1 ? '' : 's'}</span></div>
      {order.notes && <div className="note">📝 {order.notes}</div>}
      {col === 'new' && <><button type="button" className="primary bigbtn" disabled={busy === order.id} onClick={() => void start(order)}>{busy === order.id ? '…' : 'Start cooking'}</button>{siblings > 1 && <small className="kHint">Starts all {siblings} items in this order</small>}</>}
      {col === 'cooking' && <button type="button" className="success bigbtn" disabled={busy === item.id} onClick={() => void done(order, item)}>{busy === item.id ? '…' : 'Mark ready'}</button>}
      {col === 'ready' && (order.status === 'ready'
        ? <button type="button" className="secondary bigbtn" disabled={busy === order.id} onClick={() => void handOver(order)}><PackageCheck size={16} /> {busy === order.id ? '…' : 'Handed over'}</button>
        : <small className="kHint ok"><CheckCircle2 size={14} /> Waiting for the rest of the order</small>)}
    </article>;
  }

  function ticket(order: Order, col: Col) {
    const items = order.items.filter(i => i.status !== 'cancelled');
    return <article className={'kCard ticket' + (col !== 'ready' && delayed(order) ? ' late' : '') + (col === 'ready' ? ' isReady' : '')} key={orderKey(order)}>
      <div className="kTop"><div className="kMeta"><b className="kNo">#{orderDisplayNo(order)}</b>{tokenChip(order)}</div><div className="kTools">{ageBadge(order)}{canPrint && <button type="button" className="iconBtn" aria-label={`Print ticket for order ${orderDisplayNo(order)}`} title="Print ticket" onClick={() => printKitchenTicket(order, settings.business_name)}><Printer size={16} /></button>}</div></div>
      <small className="muted">{order.covers} cover{order.covers === 1 ? '' : 's'}</small>
      {order.notes && <div className="note">📝 {order.notes}</div>}
      <div className="kLines">{items.map(item => <div className={'itemrow' + (item.status === 'done' ? ' completed' : '')} key={item.id}>
        <span><b>{formatQty(item.qty, item.unit_type)} × {item.product_name}</b></span>
        {item.status === 'done' ? <b className="successText"><CheckCircle2 size={17} /> Done</b>
          : col === 'cooking' ? <button type="button" className="success small" disabled={busy === item.id} onClick={() => void done(order, item)}>{busy === item.id ? '…' : 'Ready'}</button> : null}
      </div>)}</div>
      {col === 'new' && <button type="button" className="primary bigbtn" disabled={busy === order.id} onClick={() => void start(order)}>{busy === order.id ? '…' : 'Start order'}</button>}
      {col === 'ready' && <button type="button" className="secondary bigbtn" disabled={busy === order.id} onClick={() => void handOver(order)}><PackageCheck size={16} /> {busy === order.id ? '…' : 'Handed over'}</button>}
    </article>;
  }

  return <main className="container kitchen">
    <div className="pageHead">
      <div className="kBrand"><span className="logo"><ChefHat size={20} /></span><div><h1>Kitchen</h1><p className="hint">Preparation summary</p></div></div>
      <div className="kBar">
        <div className="seg" role="tablist" aria-label="Board view">
          <button type="button" role="tab" aria-selected={view === 'items'} className={view === 'items' ? 'on' : ''} onClick={() => setView('items')}><LayoutGrid size={15} /> Item cards ({activeItems})</button>
          <button type="button" role="tab" aria-selected={view === 'orders'} className={view === 'orders' ? 'on' : ''} onClick={() => setView('orders')}><Layers size={15} /> Order tickets ({activeOrders})</button>
        </div>
        {canPrint && <button type="button" className={'chipBtn' + (autoPrint ? ' on' : '')} role="switch" aria-checked={autoPrint} onClick={toggleAutoPrint} title="Print a kitchen ticket as soon as a new order arrives"><Printer size={15} /> Auto-print: <b>{autoPrint ? 'On' : 'Off'}</b></button>}
        <button type="button" className="secondary" onClick={() => void syncAll()} disabled={syncing}>{offlineNow() ? <CloudOff size={15} /> : <RefreshCw size={15} className={syncing ? 'spin' : ''} />} Real-time sync</button>
      </div>
    </div>

    <div className="kLayout">
      <aside className="card kSummary" aria-label="Preparation summary">
        <div className="rowBetween"><h3>Active items</h3><span className="countPill">{activeItems}</span></div>
        {summary.length ? <ul className="kSum">{summary.map(s => <li key={s.name}><span className="clip">{s.name}</span><small>{s.orders.size} order{s.orders.size === 1 ? '' : 's'}</small><b>{formatQty(s.qty, s.unit)}</b></li>)}</ul>
          : <div className="emptyMini"><Hourglass size={22} /><p>Everything is prepped</p></div>}
      </aside>

      <section className="kBoard">
        <div className="kTabs" role="tablist" aria-label="Board column">{COLS.map(c => <button type="button" role="tab" aria-selected={mobileCol === c.key} key={c.key} className={(mobileCol === c.key ? 'on ' : '') + c.tone} onClick={() => setMobileCol(c.key)}>{c.title} <span>{countFor(c.key)}</span></button>)}</div>
        <div className="kCols">
          {COLS.map(c => {
            const Icon = c.icon;
            const list = view === 'items' ? byCol.items[c.key] : byCol.tickets[c.key];
            const shown = c.key === 'ready' ? list.slice(0, READY_LIMIT) : list;
            return <div className={'kCol ' + c.tone + (mobileCol === c.key ? ' on' : '')} key={c.key}>
              <div className="kColHead"><span className="tonal sm"><Icon size={17} /></span><h3>{c.title}</h3><span className="countPill">{list.length}</span></div>
              {shown.length
                ? <div className="kStack">{view === 'items' ? (shown as Card[]).map(itemCard) : (shown as Order[]).map(o => ticket(o, c.key))}</div>
                : <div className="kEmpty">{c.empty}</div>}
              {list.length > shown.length && <small className="muted kMore">Showing the latest {READY_LIMIT} of {list.length}</small>}
            </div>;
          })}
        </div>
      </section>
    </div>
  </main>;
}
