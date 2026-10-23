'use client';

import React from 'react';
import type { SubscriptionState } from '@/lib/subscription-types';
import { BillingSettingsView } from './BillingSettingsView';
import { X } from 'lucide-react';

interface BillingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: SubscriptionState;
  onSubscriptionUpdated: () => void;
}

/** Full-screen overlay with plan cards (renew / upgrade) and the payment history. Owner only. */
export const BillingDrawer: React.FC<BillingDrawerProps> = ({ isOpen, onClose, subscription, onSubscriptionUpdated }) => {
  if (!isOpen) return null;
  return (
    <div className="fd-billing">
      <div className="fixed inset-0 z-[1000] overflow-y-auto bg-slate-50">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Subscription &amp; Billing</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
            aria-label="Close billing"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
        <div className="max-w-6xl mx-auto p-4 sm:p-8">
          <BillingSettingsView subscription={subscription} onSubscriptionUpdated={onSubscriptionUpdated} />
        </div>
      </div>
    </div>
  );
};
