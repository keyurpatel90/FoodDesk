'use client';

import React from 'react';
import { UserRole, SubscriptionState } from '@/lib/subscription-types';
import { SubscriptionCards } from './SubscriptionCards';
import { Lock, ShieldAlert, ArrowRight, UserCheck } from 'lucide-react';

interface SubscriptionLockoutProps {
  currentRole: UserRole;
  subscription: SubscriptionState;
  onSwitchRole: (role: UserRole) => void;
  onSubscriptionUpdated: () => void;
}

export const SubscriptionLockout: React.FC<SubscriptionLockoutProps> = ({
  currentRole,
  subscription,
  onSwitchRole,
  onSubscriptionUpdated,
}) => {
  const isAdmin = currentRole === 'admin';

  if (isAdmin) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold mb-4">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span>Subscription Inactive / Expired</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Activate FoodDesk for Your Restaurant
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Your restaurant subscription is currently paused. Operational roles (Waitstaff, Cashier, Kitchen KDS, and Runners) are restricted until a plan is activated via Razorpay. Choose a tier below to instantly unlock operations.
          </p>
        </div>

        {/* Pricing Cards */}
        <SubscriptionCards
          currentSubscription={subscription}
          onSubscriptionUpdated={onSubscriptionUpdated}
        />
      </div>
    );
  }

  // Non-admin roles view
  const roleNames: Record<UserRole, string> = {
    admin: 'Administrator',
    kitchen: 'Kitchen Head / Chef (KDS)',
    waiter: 'Waiter / Floor Captain',
    cashier: 'Cashier / Billing Counter',
    runner: 'Food Runner & Dispatch',
    customer: 'Customer QR Dine-in',
  };

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-5 shadow-xs">
        <Lock className="w-8 h-8 stroke-[1.8]" />
      </div>

      <div className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100/60 px-3 py-1 rounded-md mb-3">
        Access Paused · Role: {roleNames[currentRole]}
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        Restaurant Subscription Inactive
      </h2>

      <p className="text-sm text-slate-600 mb-6 leading-relaxed">
        FoodDesk POS and Kitchen Display operations are temporarily locked for non-administrative accounts because the restaurant subscription is expired or inactive.
      </p>

      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2 mb-6">
        <div className="flex justify-between">
          <span className="text-slate-500">Active Role:</span>
          <span className="font-semibold text-slate-800">{roleNames[currentRole]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Subscription Status:</span>
          <span className="font-semibold text-rose-600">INACTIVE / EXPIRED</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Action Required:</span>
          <span className="text-slate-700">Contact owner to renew plan via Razorpay</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <button
          onClick={() => onSwitchRole('admin')}
          className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span>Switch to Admin to Renew</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
