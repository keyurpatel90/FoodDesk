import React from 'react';
import { UserRole, SubscriptionState, SubscriptionTierId } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { Users, CreditCard, Shield, PlusCircle, AlertCircle } from 'lucide-react';

interface DemoControlBarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  subscription: SubscriptionState;
  onSubscriptionChange: () => void;
  onOpenUpgradeModal: () => void;
  onAddSampleOrder: () => void;
}

export const DemoControlBar: React.FC<DemoControlBarProps> = ({
  currentRole,
  onRoleChange,
  subscription,
  onSubscriptionChange,
  onOpenUpgradeModal,
  onAddSampleOrder,
}) => {
  const roles: { id: UserRole; label: string; icon: string }[] = [
    { id: 'admin', label: 'Admin / Owner', icon: '👑' },
    { id: 'waiter', label: 'Waiter (POS)', icon: '🛎️' },
    { id: 'kitchen', label: 'Kitchen (KDS)', icon: '👨‍🍳' },
    { id: 'cashier', label: 'Cashier Desk', icon: '💳' },
    { id: 'runner', label: 'Food Runner', icon: '🏃' },
    { id: 'customer', label: 'Customer QR', icon: '📱' },
  ];

  const handleSetTier = (tier: SubscriptionTierId | 'inactive') => {
    if (tier === 'inactive') {
      subscriptionService.expireSubscription();
    } else {
      // Plan changes must go through verified Razorpay checkout, never a demo/local switch.
      onOpenUpgradeModal();
      return;
    }
    onSubscriptionChange();
  };

  const isActive = subscriptionService.isSubscriptionActive();

  return (
    <div className="bg-slate-900 text-slate-100 border-b border-slate-800 text-xs px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Role Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Active Role:</span>
          </div>
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => onRoleChange(r.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  currentRole === r.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <span>{r.icon}</span>
                <span className="hidden sm:inline">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subscription Simulator Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Subscription Test:</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => handleSetTier('inactive')}
              title="Test role lockout when subscription expires"
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                !isActive
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-slate-400 hover:text-rose-300 hover:bg-slate-700/60'
              }`}
            >
              <AlertCircle className="w-3 h-3" />
              <span>Inactive</span>
            </button>

            <button
              onClick={() => handleSetTier('starter')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                isActive && subscription.tier === 'starter'
                  ? 'bg-violet-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              Starter (₹300)
            </button>

            <button
              onClick={() => handleSetTier('professional')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                isActive && subscription.tier === 'professional'
                  ? 'bg-[#6c5ce7] text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              Pro (₹799)
            </button>

            <button
              onClick={() => handleSetTier('enterprise')}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                isActive && subscription.tier === 'enterprise'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              Enterprise (₹1,199)
            </button>
          </div>

          {/* Quick Pay / Upgrade Button */}
          <button
            onClick={onOpenUpgradeModal}
            className="px-2.5 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-md shadow-xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Razorpay Checkout</span>
            <span className="md:hidden">Pay</span>
          </button>

          {/* Download Next.js Codebase ZIP Export */}
          <a
            href="/fooddesk-subscription-nextjs.zip"
            download="fooddesk-subscription-nextjs.zip"
            title="Download complete Next.js ready code package"
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md shadow-xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span className="text-xs">⬇️</span>
            <span className="hidden sm:inline">Export Next.js ZIP</span>
            <span className="sm:hidden">ZIP</span>
          </a>

          {/* Quick Mock Order for KDS testing */}
          <button
            onClick={onAddSampleOrder}
            title="Create a test order to see live KDS ticket updates"
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap text-[11px]"
          >
            <PlusCircle className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Add Order</span>
          </button>
        </div>
      </div>
    </div>
  );
};
