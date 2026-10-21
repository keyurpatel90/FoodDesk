import React from 'react';
import { SubscriptionState, UserRole } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { UtensilsCrossed, Sparkles } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  subscription: SubscriptionState;
  currentRole: UserRole;
  onOpenPricing: () => void;
  restaurantName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  subscription,
  currentRole,
  onOpenPricing,
  restaurantName,
}) => {
  const isActive = subscriptionService.isSubscriptionActive();
  const isStarter = subscription.tier === 'starter';
  const isPro = subscription.tier === 'professional';
  const isEnterprise = subscription.tier === 'enterprise';

  // Navigation tabs based on active tier and role
  const navItems = [
    { id: 'orders', label: 'Tables & Orders', roleMin: 'all' },
    { id: 'kitchen', label: 'Kitchen (KDS)', roleMin: 'all' },
    { id: 'cashier', label: 'Cashier & Billing', roleMin: 'all' },
    {
      id: 'loyalty',
      label: 'Loyalty Rewards',
      roleMin: 'admin',
      locked: isStarter || !isActive,
      lockedBadge: 'Pro Plan',
    },
    {
      id: 'analytics',
      label: 'Analytics Hub',
      roleMin: 'admin',
      locked: isStarter || !isActive,
      lockedBadge: 'Pro Plan',
    },
    {
      id: 'outlets',
      label: 'Multi-Outlet',
      roleMin: 'admin',
      locked: !isEnterprise || !isActive,
      lockedBadge: 'Enterprise',
    },
    { id: 'billing', label: 'Plan & Billing', roleMin: 'all' },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-8 h-16">
        {/* Zone 1: Wordmark / Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#6c5ce7] text-white flex items-center justify-center shadow-xs">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-900 leading-none">
              {restaurantName || 'FoodDesk POS'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span>Smart Kitchen & Table Management</span>
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const isCurrent = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  isCurrent
                    ? 'bg-slate-100 text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
                {item.locked && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-600">
                    {item.lockedBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action & Tier Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            onClick={onOpenPricing}
            className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Current Plan</div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                {isActive ? (
                  <>
                    <span className="capitalize">{subscription.tier}</span>
                    {subscription.isTrial && <span className="text-[10px] text-amber-600 font-normal">(Trial)</span>}
                  </>
                ) : (
                  <span className="text-rose-600">Inactive</span>
                )}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenPricing();
              }}
              className={`p-1.5 rounded-md text-xs font-bold transition-all shadow-xs flex items-center gap-1 ${
                isEnterprise
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : isPro
                  ? 'bg-[#6c5ce7] text-white hover:bg-[#5b4cdb]'
                  : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs">Upgrade</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Tab Scroll for small screens */}
      <div className="lg:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-100 gap-1 scrollbar-none bg-slate-50/50">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === item.id
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>{item.label}</span>
            {item.locked && (
              <span className="text-[9px] bg-slate-200 px-1 py-0.2 rounded text-slate-600">
                {item.lockedBadge}
              </span>
            )}
          </button>
        ))}
      </div>
    </header>
  );
};
