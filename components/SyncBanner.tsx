'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { getSyncStatuses, syncLabel, syncNow } from '@/lib/offline';

type Label = ReturnType<typeof syncLabel>;

export default function SyncBanner() {
  const [label, setLabel] = useState<Label>('ALL DATA SYNCED ✓');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setLabel(syncLabel(await getSyncStatuses()));
    } catch {
      setLabel(typeof navigator !== 'undefined' && navigator.onLine ? 'SYNCING' : 'OFFLINE');
    }
  }

  async function sync() {
    setBusy(true);
    await syncNow();
    await refresh();
    setBusy(false);
  }

  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('fooddesk-sync', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('fooddesk-sync', update);
    };
  }, []);

  return <div className={'syncBanner ' + (label === 'OFFLINE' ? 'offline' : label.includes('SYNC') ? 'syncing' : 'synced')}>
    {label === 'OFFLINE' ? <CloudOff size={15} /> : <span className="syncDot">●</span>}
    <span>{label}</span>
    {(label === 'SYNCING' || label === 'OFFLINE') && <button className="syncBtn" onClick={() => void sync()} disabled={busy} title="Retry synchronization"><RefreshCw size={14} className={busy ? 'spin' : ''} /></button>}
  </div>;
}
