'use client';
import { useEffect,useState } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
export default function OutletSwitcher({current,onChanged}:{current?:string|null;onChanged:()=>void}){const [rows,setRows]=useState<any[]>([]);useEffect(()=>{supabase.from('outlets').select('id,name,code,active').eq('active',true).order('name').then(({data})=>setRows(data||[]))},[]);if(rows.length<2)return null;async function change(id:string){const {error}=await supabase.rpc('switch_outlet',{p_outlet_id:id});if(error)alert(error.message);else onChanged()}return <label className="outletSwitch"><MapPin size={13}/><select value={current||''} onChange={e=>void change(e.target.value)}>{rows.map(r=><option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}</select></label>}
