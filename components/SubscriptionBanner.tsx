'use client';

import React from 'react';
import type { SubscriptionState } from '@/lib/subscription-types';
import { CreditCard } from 'lucide-react';

interface SubscriptionBannerProps {
  subscription: SubscriptionState;
  onManage: () => void;
}

/**
 * Slim status strip for restaurant owners: which plan, until when, and a "Manage plan" button
 * (renew / upgrade / invoices). Turns amber on a free trial or in the last 7 days.
 */
export const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({ subscription, onManage }) => {
  const days = subscription.daysRemaining ?? 0;
  const warn = subscription.isTrial || days <= 7;
  const date = new Date(subscription.expiryDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const plural = days === 1 ? '' : 's';
  const text = subscription.isTrial
    ? `Free trial · ${days} day${plural} left`
    : days <= 7
    ? `${subscription.planName} plan ends in ${days} day${plural} (${date})`
    : `${subscription.planName} plan · active until ${date}`;

  return (
    <div className="fd-billing">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-2 text-xs border-b ${
          warn ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <span className="flex items-center gap-2 font-medium">
          <CreditCard className="w-3.5 h-3.5" />
          {text}
        </span>
        <button
          onClick={onManage}
          className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
            warn ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {warn ? 'Renew / Upgrade' : 'Manage plan'}
        </button>
      </div>
    </div>
  );
};
