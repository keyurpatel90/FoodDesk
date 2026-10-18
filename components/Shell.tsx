'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, ChefHat, ClipboardList, Cookie, HandPlatter, LayoutDashboard, LogOut, Menu, Sandwich, Settings, ShoppingCart, Soup, UtensilsCrossed, X, type LucideIcon } from 'lucide-react';
import SyncBanner from '@/components/SyncBanner';

type NavItem = { label: string; icon: LucideIcon; group: string };

const NAV: Record<string, NavItem> = {
  cashier: { label: 'Cashier', icon: ShoppingCart, group: 'Front of house' },
  orders: { label: 'Orders', icon: ClipboardList, group: 'Front of house' },
  runner: { label: 'Runner', icon: HandPlatter, group: 'Front of house' },
  kitchen: { label: 'Kitchen', icon: ChefHat, group: 'Kitchen' },
  waffle: { label: 'Waffle', icon: Cookie, group: 'Kitchen' },
  chole: { label: 'Chole', icon: Soup, group: 'Kitchen' },
  pav: { label: 'Pav', icon: Sandwich, group: 'Kitchen' },
  dashboard: { label: 'Dashboard', icon: LayoutDashboard, group: 'Insights' },
  admin: { label: 'Manage', icon: Settings, group: 'Admin' },
  organizations: { label: 'Organizations', icon: Building2, group: 'Admin' },
};
const GROUPS = ['Front of house', 'Kitchen', 'Insights', 'Admin'];

export default function Shell({ brand, roleLabel, userName, modes, mode, onMode, onSignOut, children }: {
  brand: string;
  roleLabel: string;
  userName: string;
  modes: string[];
  mode: string;
  onMode: (mode: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const acct = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (acct.current && !acct.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setDrawer(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  const info = (k: string): NavItem => NAV[k] ?? { label: k.charAt(0).toUpperCase() + k.slice(1), icon: UtensilsCrossed, group: 'Admin' };
  const current = info(mode);

  return <div className="shell">
    <aside className={'sidebar' + (drawer ? ' open' : '')} aria-label="Sidebar">
      <div className="sbBrand">
        <span className="logo"><UtensilsCrossed size={20} /></span>
        <div className="sbName"><b>{brand}</b><small>POS that just works</small></div>
        <button className="iconBtn sbClose" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></button>
      </div>
      <nav className="sbNav" aria-label="Main">
        {GROUPS.map(g => {
          const list = modes.filter(k => info(k).group === g);
          if (!list.length) return null;
          return <div className="navGroup" key={g}>
            <div className="navHead">{g}</div>
            {list.map(k => { const I = info(k).icon; return <button key={k} className={'navItem' + (mode === k ? ' active' : '')} aria-current={mode === k ? 'page' : undefined} onClick={() => { onMode(k); setDrawer(false); }}><I size={20} /><span>{info(k).label}</span></button>; })}
          </div>;
        })}
      </nav>
    </aside>
    <div className={'scrim' + (drawer ? ' show' : '')} onClick={() => setDrawer(false)} />

    <div className="shellMain">
      <header className="navbar">
        <button className="iconBtn navToggle" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu size={20} /></button>
        <div className="navTitle">{current.label}</div>
        <div className="navRight">
          <SyncBanner />
          <div className="acct" ref={acct}>
            <button className="avatar" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu(v => !v)}>{userName.slice(0, 1).toUpperCase()}</button>
            {menu && <div className="acctMenu" role="menu">
              <div className="acctWho"><b>{userName}</b><small>{roleLabel}</small></div>
              <button className="acctItem" role="menuitem" onClick={onSignOut}><LogOut size={16} /> Sign out</button>
            </div>}
          </div>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
