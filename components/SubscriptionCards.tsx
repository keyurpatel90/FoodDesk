'use client';

import React, { useState } from 'react';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import { TierConfig, SubscriptionState } from '@/lib/subscription-types';
import { RazorpayModal } from './RazorpayModal';
import { getPlanAction, subscriptionService } from '@/lib/subscription';
import { Check, Sparkles, Shield, ArrowUpRight } from 'lucide-react';

interface SubscriptionCardsProps {
  currentSubscription: SubscriptionState;
  onSubscriptionUpdated: () => void;
}

export const SubscriptionCards: React.FC<SubscriptionCardsProps> = ({
  currentSubscription,
  onSubscriptionUpdated,
}) => {
  const [selectedTierForPayment, setSelectedTierForPayment] = useState<TierConfig | null>(null);

  const loaded = subscriptionService.isLoaded();
  const actions = {
    starter: getPlanAction(currentSubscription, 'starter', loaded),
    professional: getPlanAction(currentSubscription, 'professional', loaded),
    enterprise: getPlanAction(currentSubscription, 'enterprise', loaded),
  };

  // The service has already stored the server-confirmed subscription by the time this runs.
  const handleRazorpaySuccess = () => {
    onSubscriptionUpdated();
  };

  const trialDays = currentSubscription.isTrial ? currentSubscription.trialDaysRemaining ?? currentSubscription.daysRemaining : undefined;

  return (
    <div className="w-full">
      {/* 3 Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch max-w-6xl mx-auto pt-4">
        {/* Card 1: Starter */}
        <div className="relative flex flex-col justify-between p-8 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          {currentSubscription.tier === 'starter' && currentSubscription.status === 'active' && (
            <div className="absolute top-4 right-4 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              Current Plan
            </div>
          )}

          <div>
            <h3 className="text-2xl font-bold text-slate-900">Starter</h3>
            <p className="text-sm text-slate-500 mt-1.5 min-h-[40px]">
              Perfect for small cafes and food stalls.
            </p>

            <div className="mt-6 mb-8 flex items-baseline">
              <span className="text-4xl font-extrabold text-slate-900 tabular-nums">₹300</span>
              <span className="text-slate-500 text-sm ml-1 font-medium">/month</span>
            </div>

            <ul className="space-y-3.5 mb-8">
              {SUBSCRIPTION_TIERS.starter.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                  <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => setSelectedTierForPayment(SUBSCRIPTION_TIERS.starter)}
              disabled={actions.starter.disabled}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
            >
              <span>{actions.starter.label}</span>
              {!actions.starter.disabled && <ArrowUpRight className="w-4 h-4 text-slate-500" />}
            </button>
            <div className="text-center text-[11px] text-slate-400 mt-2">{actions.starter.hint ?? 'Instant Razorpay Checkout'}</div>
          </div>
        </div>

        {/* Card 2: Professional (MOST POPULAR - Highlighted Purple) */}
        <div className="relative flex flex-col justify-between p-8 bg-[#6c5ce7] text-white rounded-2xl shadow-xl ring-2 ring-[#5b4cdb] md:-translate-y-2">
          {/* Top Golden Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#f9ca24] text-slate-900 font-extrabold text-[11px] tracking-wider uppercase px-4 py-1 rounded-full shadow-sm flex items-center gap-1">
            <Sparkles className="w-3 h-3 fill-slate-900" />
            <span>MOST POPULAR</span>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Professional</h3>
              {currentSubscription.tier === 'professional' && currentSubscription.status === 'active' && (
                <span className="text-[11px] font-bold text-violet-900 bg-white/90 px-2.5 py-0.5 rounded-full">
                  Current Plan
                </span>
              )}
              {currentSubscription.tier === 'professional' && currentSubscription.isTrial && (
                <span className="text-[11px] font-bold text-violet-900 bg-white/90 px-2.5 py-0.5 rounded-full">
                  Free trial{trialDays !== undefined ? ` · ${trialDays} day${trialDays === 1 ? '' : 's'} left` : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-violet-100 mt-1.5 min-h-[40px]">
              Everything you need for growing restaurants.
            </p>

            <div className="mt-6 mb-8 flex items-baseline">
              <span className="text-4xl font-extrabold text-white tabular-nums">₹799</span>
              <span className="text-violet-200 text-sm ml-1 font-medium">/month</span>
            </div>

            <ul className="space-y-3.5 mb-8">
              {SUBSCRIPTION_TIERS.professional.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-white">
                  <div className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span className="font-medium">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-white/20 space-y-2">
            <button
              onClick={() => setSelectedTierForPayment(SUBSCRIPTION_TIERS.professional)}
              disabled={actions.professional.disabled}
              className="w-full py-3 px-4 bg-white hover:bg-violet-50 text-[#6c5ce7] rounded-xl font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <span>{actions.professional.label}</span>
              {!actions.professional.disabled && <Shield className="w-4 h-4" />}
            </button>
            {actions.professional.hint && (
              <div className="text-center text-[11px] text-violet-100">{actions.professional.hint}</div>
            )}
          </div>
        </div>

        {/* Card 3: Enterprise */}
        <div className="relative flex flex-col justify-between p-8 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          {currentSubscription.tier === 'enterprise' && currentSubscription.status === 'active' && (
            <div className="absolute top-4 right-4 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              Current Plan
            </div>
          )}

          <div>
            <h3 className="text-2xl font-bold text-slate-900">Enterprise</h3>
            <p className="text-sm text-slate-500 mt-1.5 min-h-[40px]">
              For large restaurant chains & groups.
            </p>

            <div className="mt-6 mb-8 flex items-baseline">
              <span className="text-4xl font-extrabold text-slate-900 tabular-nums">₹1,199</span>
              <span className="text-slate-500 text-sm ml-1 font-medium">/month</span>
            </div>

            <ul className="space-y-3.5 mb-8">
              {SUBSCRIPTION_TIERS.enterprise.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-700">
                  <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => setSelectedTierForPayment(SUBSCRIPTION_TIERS.enterprise)}
              disabled={actions.enterprise.disabled}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{actions.enterprise.label}</span>
              {!actions.enterprise.disabled && <ArrowUpRight className="w-4 h-4 text-slate-400" />}
            </button>
            <div className="text-center text-[11px] text-slate-400 mt-2">{actions.enterprise.hint ?? 'Unlimited Outlets & Tables'}</div>
          </div>
        </div>
      </div>

      {/* Razorpay Checkout Modal */}
      {selectedTierForPayment && (
        <RazorpayModal
          tier={selectedTierForPayment}
          isOpen={!!selectedTierForPayment}
          onClose={() => setSelectedTierForPayment(null)}
          onSuccess={handleRazorpaySuccess}
        />
      )}
    </div>
  );
};
