'use client';

/**
 * REFERENCE ONLY: shows how your existing app/page.tsx (not included in the zip) should talk to the new
 * subscription code. Copy the highlighted parts into your real page.
 */
import React, { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { subscriptionService } from '@/lib/subscription';
import { setAccessTokenProvider } from '@/lib/billing-auth';
import type { UserRole } from '@/lib/subscription-types';
import { Navbar } from '@/components/Navbar';
import { PricingModal } from '@/components/PricingModal';
import { SubscriptionLockout } from '@/components/SubscriptionLockout';
import { BillingSettingsView } from '@/components/BillingSettingsView';

// (1) Tell the billing code how to get the signed-in user's Supabase token. Use YOUR existing client:
//
//   import { supabase } from '@/lib/supabase';
//   setAccessTokenProvider(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
//
// (If you skip this, a fallback reads supabase-js's default localStorage session.)
void setAccessTokenProvider;

export default function Page() {
  // (2) Replace `useState(subscriptionService.getSubscription())` + localStorage listeners with this hook.
  //     It loads from the server, and refreshes on focus / every 5 minutes.
  const { subscription, loading, error, refresh } = useSubscription();

  // In the real app the role comes from the signed-in user's profile, not from a switcher.
  const [role, setRole] = useState<UserRole>('admin');
  const [tab, setTab] = useState('billing');
  const [pricingOpen, setPricingOpen] = useState(false);

  // (3) Never render the app (or the "expired" lockout) until the first server response has arrived.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        {error ? (
          <div className="text-center">
            <p className="mb-3">Couldn’t load your subscription: {error}</p>
            <button onClick={() => void refresh()} className="px-4 py-2 rounded-lg bg-slate-900 text-white">
              Retry
            </button>
          </div>
        ) : (
          'Loading…'
        )}
      </div>
    );
  }

  // (4) Expired / inactive: admin sees the plan cards (Renew / Upgrade), staff see the lock screen.
  if (!subscriptionService.isSubscriptionActive()) {
    return (
      <SubscriptionLockout
        currentRole={role}
        subscription={subscription}
        onSwitchRole={setRole}
        onSubscriptionUpdated={() => void refresh()}
      />
    );
  }

  return (
    <>
      <Navbar
        activeTab={tab}
        onTabChange={setTab}
        subscription={subscription}
        currentRole={role}
        onOpenPricing={() => setPricingOpen(true)}
        restaurantName="Your Restaurant"
      />
      {tab === 'billing' && (
        <BillingSettingsView subscription={subscription} onSubscriptionUpdated={() => void refresh()} />
      )}
      {/* ...your other tabs (orders, kitchen, cashier, ...) unchanged ... */}
      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        subscription={subscription}
        onSubscriptionUpdated={() => void refresh()}
      />
    </>
  );
}
