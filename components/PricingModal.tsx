'use client';

import React from 'react';
import { SubscriptionState } from '@/lib/subscription-types';
import { SubscriptionCards } from './SubscriptionCards';
import { X, ShieldCheck } from 'lucide-react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: SubscriptionState;
  onSubscriptionUpdated: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({
  isOpen,
  onClose,
  subscription,
  onSubscriptionUpdated,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-10 my-8">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center max-w-2xl mx-auto mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-bold mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-violet-600" />
            <span>Razorpay Tiered Subscriptions</span>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Select Your Restaurant Growth Plan
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Unlock tiered feature access for your waitstaff, cashier, and kitchen display system.
          </p>
        </div>

        <SubscriptionCards
          currentSubscription={subscription}
          onSubscriptionUpdated={() => {
            onSubscriptionUpdated();
            onClose();
          }}
        />

        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
          All subscriptions include instant activation, Razorpay invoice receipts, and 256-bit PCI-DSS encrypted payment security.
        </div>
      </div>
    </div>
  );
};
