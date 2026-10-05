'use client';
import {useEffect,useState} from 'react';
import Cashier from '@/components/Cashier';
import Kitchen from '@/components/Kitchen';
import Dashboard from '@/components/Dashboard';
import Admin from '@/components/Admin';
import Station from '@/components/Station';

type Mode='cashier'|'kitchen'|'dashboard'|'admin'|'waffle'|'chole'|'pav';
const modes:[Mode,string][]=[['cashier','Cashier'],['kitchen','Kitchen'],['waffle','Waffle'],['chole','Chole'],['pav','Pav'],['dashboard','Dashboard'],['admin','Admin']];
export default function Home(){
 const params=typeof window!=='undefined'?new URLSearchParams(location.search):null;
 const initial=(params?.get('mode') as Mode)||'cashier';
 const [mode,setMode]=useState<Mode>(modes.some(x=>x[0]===initial)?initial:'cashier');
 useEffect(()=>{document.title=`Food Event Desk • ${mode}`},[mode]);
 const content=mode==='cashier'?<Cashier/>:mode==='kitchen'?<Kitchen/>:mode==='dashboard'?<Dashboard/>:mode==='admin'?<Admin/>:<Station station={mode}/>;
 return <div className="app"><header className="topbar"><div><div className="brand">🍴 Food Event Desk</div><div className="subtitle">Fast counter ordering • live kitchen</div></div><nav className="tabs top-tabs">{modes.map(([k,v])=><button key={k} className={'tab '+(mode===k?'active':'')} onClick={()=>setMode(k)}>{v}</button>)}</nav></header>{content}</div>
}
