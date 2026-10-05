'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings, Order } from '@/lib/types';
import { csvEscape, money } from '@/lib/format';

export default function Dashboard({ settings }: { settings: AppSettings }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceDay, setServiceDay] = useState('');

  useEffect(() => { load(); const ch=supabase.channel('dashboard-v2').on('postgres_changes',{event:'*',schema:'public',table:'orders'},load).on('postgres_changes',{event:'*',schema:'public',table:'order_items'},load).subscribe(); return()=>{supabase.removeChannel(ch)}; }, [serviceDay]);
  async function load() {
    setLoading(true);
    let oq = supabase.from('orders').select('*').order('created_at',{ascending:false});
    if (serviceDay) oq = oq.eq('service_day', serviceDay) as any;
    const [{data:o},{data:i}] = await Promise.all([oq, supabase.from('order_items').select('*')]);
    setOrders((o??[]) as Order[]); setItems(i??[]); setLoading(false);
  }
  const active = orders.filter(o => o.status !== 'cancelled');
  const revenue = active.reduce((s,o)=>s+Number(o.total),0);
  const covers = active.reduce((s,o)=>s+Number(o.covers||1),0);
  const ready = active.filter(o=>o.status==='ready').length;
  const itemCounts = useMemo(()=>{const m:Record<string,number>={};items.forEach(i=>{if(i.status!=='cancelled')m[i.product_name]=(m[i.product_name]||0)+Number(i.qty)});return Object.entries(m).sort((a,b)=>b[1]-a[1])},[items]);
  const payment = useMemo(()=>{const m:Record<string,number>={};active.forEach(o=>m[o.payment_method]=(m[o.payment_method]||0)+Number(o.total));return Object.entries(m).sort((a,b)=>b[1]-a[1])},[active]);

  function exportCsv() {
    const rows = [['Order','Service Day','Status','Subtotal','Discount','Total','Payment','Covers','Notes','Created At']];
    orders.forEach(o=>rows.push([`#${o.order_no}`,o.service_day,o.status,String(o.subtotal),String(o.discount_amount),String(o.total),o.payment_method,String(o.covers||1),o.notes||'',new Date(o.created_at).toLocaleString()]));
    const csv=rows.map(r=>r.map(csvEscape).join(';')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`fooddesk-${serviceDay||'all-orders'}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="container"><div className="rolebar"><div><span>Event Dashboard</span><p className="hint">Revenue, covers, payment mix and item sales.</p></div><div className="toolbar"><input type="date" value={serviceDay} onChange={e=>setServiceDay(e.target.value)}/><button className="secondary" onClick={load}><RefreshCw size={16}/> Refresh</button>{settings.features.reports&&<button className="secondary" onClick={exportCsv}><Download size={16}/> CSV</button>}</div></div>
    <div className="stats"><div className="stat"><span>Orders</span><b>{active.length}</b></div><div className="stat"><span>Revenue</span><b>{money(revenue,settings.currency_symbol)}</b></div><div className="stat"><span>Covers</span><b>{covers}</b></div><div className="stat"><span>Avg / Cover</span><b>{money(covers?Math.round(revenue/covers):0,settings.currency_symbol)}</b></div></div>
    <div className="twocol sectionSpace"><section className="card"><h3>Payment Mix</h3>{payment.map(([method,total])=><div className="salesline" key={method}><b>{method.toUpperCase()}</b><span>{money(total,settings.currency_symbol)}</span></div>)}{ready>0&&<div className="callout successBg">{ready} order{ready===1?'':'s'} ready for pickup.</div>}</section><section className="card"><h3>Top Items</h3>{itemCounts.slice(0,12).map(([name,q])=><div className="salesline" key={name}><b>{name}</b><span>{q}</span></div>)}</section></div>
    <section className="card"><div className="sectionHead"><h3>Recent Orders</h3><span className="muted">{loading?'Loading…':`${orders.length} in view`}</span></div>{orders.slice(0,30).map(o=><div className="cartline" key={o.id}><div><b>#{o.order_no}</b><small>{new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} • {o.covers||1} cover{(o.covers||1)!==1?'s':''}</small></div><span>{money(o.total,settings.currency_symbol)}</span><span className={'status '+o.status}>{o.status}</span></div>)}</section>
  </main>;
}
