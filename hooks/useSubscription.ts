'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscriptionService, SUBSCRIPTION_CHANGED_EVENT } from '@/lib/subscription';
import type { SubscriptionState, PaymentInvoice } from '@/lib/subscription-types';

interface Snapshot {
  subscription: SubscriptionState;
  invoices: PaymentInvoice[];
  loading: boolean;
  error: string | null;
}

const read = (): Snapshot => ({
  subscription: subscriptionService.getSubscription(),
  invoices: subscriptionService.getInvoices(),
  loading: !subscriptionService.isLoaded(),
  error: subscriptionService.getLastError(),
});

/**
 * Loads the restaurant's subscription from the server and keeps it fresh
 * (on mount, when the tab regains focus, and every 5 minutes).
 * Pass `enabled = false` until the user is signed in so it does not call the API too early.
 * Use `loading` to show a spinner instead of flashing the "expired" lockout screen.
 */
export function useSubscription(enabled = true) {
  const [snap, setSnap] = useState<Snapshot>(read);

  useEffect(() => {
    const sync = () => setSnap(read());
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, sync);
    sync();
    if (!enabled) {
      return () => window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, sync);
    }

    const refresh = () => {
      void subscriptionService.refresh();
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(refresh, 5 * 60 * 1000);

    return () => {
      window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, sync);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [enabled]);

  const refresh = useCallback(() => subscriptionService.refresh(), []);
  return { ...snap, refresh };
}
