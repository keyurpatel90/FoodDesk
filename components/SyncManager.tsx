'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cloud, RefreshCw } from 'lucide-react';
import { queueCount, syncNow } from '@/lib/offline';

export default function SyncManager() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setCount(await queueCount());
    } catch {
      setCount(0);
    }
  }, []);

  const sync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOnline(false);
      await refreshCount();
      return;
    }

    setSyncing(true);

    try {
      await syncNow();
    } catch (error) {
      console.error('FoodDesk synchronization failed:', error);
    } finally {
      await refreshCount();
      setSyncing(false);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('fooddesk-sync'));
      }
    }
  }, [refreshCount]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void sync();
    };

    const onOffline = () => {
      setOnline(false);
      void refreshCount();
    };

    const onSync = () => {
      void refreshCount();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('fooddesk-sync', onSync);

    void refreshCount();
    if (navigator.onLine) void sync();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('fooddesk-sync', onSync);
    };
  }, [refreshCount, sync]);

  return (
    <div
      className={
        'syncBanner ' +
        (online ? (syncing ? 'syncing' : 'synced') : 'offline')
      }
    >
      <span className="syncDot">●</span>

      {online
        ? syncing
          ? 'SYNCING'
          : 'ALL DATA SYNCED'
        : 'OFFLINE'}

      {online && (
        <button
          className="syncBtn"
          onClick={() => void sync()}
          title="Sync"
          disabled={syncing}
        >
          <RefreshCw
            size={13}
            className={syncing ? 'spin' : ''}
          />
        </button>
      )}

      <Cloud size={13} />

      {count > 0 && <b>{count}</b>}
    </div>
  );
}