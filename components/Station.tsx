'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings, Order, OrderItem, Station as StationType } from '@/lib/types';

const names:{[key:string]:string}={waffle:'Waffle Station',chole:'Chole Kulche Station',pav:'Pav Bataka Station'};
export default function Station({station,settings}:{station:StationType;settings:AppSettings}){const [orders,setOrders]=useState<Order[]>([]);const [busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{load();const ch=supabase.channel(`station-v2-${station}`).on('postgres_changes',{event:'*',schema:'public',table:'order_items'},load).on('postgres_changes',{event:'*',schema:'public',table:'orders'},load).subscribe();return()=>{supabase.removeChannel(ch)}},[station]);
 async function load(){const {data:o}=await supabase.from('orders').select('*').in('status',['new','preparing']).order('created_at',{ascending:true});if(!o){setOrders([]);return}const ids=o.map(x=>x.id);const {data:i}=ids.length?await supabase.from('order_items').select('*').in('order_id',ids).eq('station',station):{data:[]};setOrders(o.map(x=>({...x,items:(i??[]).filter(y=>y.order_id===x.id)})).filter((x:Order)=>x.items.some((i:OrderItem)=>i.status!=='cancelled')) as Order[])}
 async function done(id:string){setBusy(id);const {error}=await supabase.rpc('complete_order_item',{p_item_id:id});if(error)alert(error.message);setBusy(null);load()}
 return <main className="container stationpage"><div className="rolebar"><div><span>{names[station]}</span><p className="hint">Only {station} dishes are shown.</p></div><span className="live">● LIVE</span></div><div className="ordergrid">{orders.map(o=><article className={'order '+(o.token_no?'hasToken':'')} key={o.id}><div className="orderhead"><div><h2>#{o.order_no}</h2>{o.token_no&&<span className="tokenBadge">TOKEN {o.token_no}</span>}</div><span className="station">{new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>{o.notes&&<div className="note">📝 {o.notes}</div>}{o.items.filter(i=>i.status!=='cancelled').map(i=><div className="stationitem" key={i.id}><b>{i.qty} × {i.product_name}</b>{i.status==='done'?<span className="successText"><CheckCircle2 size={18}/> DONE</span>:<button className="success small" disabled={busy===i.id} onClick={()=>done(i.id)}>READY</button>}</div>)}</article>)}{!orders.length&&<div className="card empty"><h2>All clear 🎉</h2><p>Waiting for new orders.</p></div>}</div></main>
}
