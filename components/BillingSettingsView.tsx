import React, { useEffect, useState } from 'react';
import { SubscriptionState, PaymentInvoice } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { SubscriptionCards } from './SubscriptionCards';
import { getFoodDeskOrganizationId, getSupabaseAccessToken } from '@/lib/subscription-client';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import { CreditCard, ShieldCheck, RefreshCw, Calendar, CheckCircle2 } from 'lucide-react';

interface BillingSettingsViewProps {
  subscription: SubscriptionState;
  onSubscriptionUpdated: () => void;
}

export const BillingSettingsView: React.FC<BillingSettingsViewProps> = ({
  subscription,
  onSubscriptionUpdated,
}) => {
  const [currentSubscription, setCurrentSubscription] = useState(subscription);
  const invoices: PaymentInvoice[] = subscriptionService.getInvoices();

  useEffect(() => { setCurrentSubscription(subscription); }, [subscription]);

  useEffect(() => {
    let cancelled = false;
    const organizationId = getFoodDeskOrganizationId();
    const accessToken = getSupabaseAccessToken();
    if (!organizationId || !accessToken) return;
    fetch(`/api/subscription/status?orgId=${encodeURIComponent(organizationId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success || cancelled) return;
      const tier = typeof data.tier === 'string' && Object.prototype.hasOwnProperty.call(SUBSCRIPTION_TIERS, data.tier) ? data.tier : 'starter';
      const normalized = {
        ...subscriptionService.getSubscription(),
        tier,
        status: ['active', 'trial'].includes(data.status) ? data.status : 'inactive',
        planName: data.planName || SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS].name,
        amount: data.isTrial ? 0 : SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS].priceMonthly,
        startDate: data.startDate || new Date(0).toISOString(),
        expiryDate: data.expiryDate || new Date(0).toISOString(),
        isTrial: !!data.isTrial,
        autoRenew: !!data.autoRenew,
      } as const;
      subscriptionService.saveSubscription(normalized);
      setCurrentSubscription(normalized);
    }).catch((error) => console.error('Could not refresh subscription from server:', error));
    return () => { cancelled = true; };
  }, []);

  const isActive = currentSubscription.status !== 'inactive' &&
    new Date(currentSubscription.expiryDate).getTime() > Date.now();

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Current Subscription Status Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Subscription & Billing Management</h2>
              {isActive ? (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Active</span>
                </span>
              ) : (
                <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                  Inactive / Expired
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              FoodDesk POS & Kitchen Display System licensing powered by Razorpay Payments.
            </p>
          </div>

          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <div className="text-xs text-slate-500">Current Active Tier</div>
              <div className="text-2xl font-black capitalize text-slate-900">{currentSubscription.planName}</div>
              <div className="text-xs text-slate-500 tabular-nums">
                ₹{currentSubscription.amount} / month {currentSubscription.isTrial && '(14-Day Free Trial)'}
              </div>
            </div>

            <a
              href="/fooddesk-subscription-nextjs.zip"
              download="fooddesk-subscription-nextjs.zip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
            >
              <span>⬇️ Download Next.js Codebase ZIP</span>
            </a>
          </div>
        </div>

        {/* Subscription Meta Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-slate-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Next Renewal / Expiry</span>
            </div>
            <div className="font-bold text-slate-900 mt-1">
              {new Date(currentSubscription.expiryDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-slate-500 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Razorpay Transaction ID</span>
            </div>
            <div className="font-mono font-bold text-slate-900 mt-1 truncate">
              {currentSubscription.razorpayPaymentId || 'N/A'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-slate-500 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-Renewal</span>
            </div>
            <div className="font-bold text-emerald-700 mt-1">
              {currentSubscription.autoRenew ? 'Enabled via Razorpay Subscriptions' : 'Manual Renewal'}
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Cards Selection (From Screenshot) */}
      <div className="space-y-4">
        <div className="text-center max-w-xl mx-auto">
          <h3 className="text-lg font-bold text-slate-900">Change or Upgrade Subscription Plan</h3>
          <p className="text-xs text-slate-500 mt-1">
            Upgrading immediately unlocks the corresponding tier limits and feature modules.
          </p>
        </div>

        <SubscriptionCards
          currentSubscription={currentSubscription}
          onSubscriptionUpdated={onSubscriptionUpdated}
        />
      </div>

      {/* Razorpay configuration is server-only; never collect secrets in the browser. */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#0c2340] text-[#3395ff] flex items-center justify-center font-bold">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Secure Razorpay configuration</h3>
            <p className="text-xs text-slate-500">Payment credentials are configured by the FoodDesk deployment administrator.</p>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Configure <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code>, and <code>RAZORPAY_WEBHOOK_SECRET</code>
          in your server deployment environment. Do not enter API credentials in this browser or expose the secret key to restaurant users.
        </p>
      </div>

      {/* Invoices & Receipts History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Razorpay Billing History & Tax Receipts</h3>
            <p className="text-xs text-slate-500">Official GST receipts generated for subscription payments</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Razorpay Verified</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Receipt #</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Plan Subscribed</th>
                <th className="py-2.5 px-3">Payment ID</th>
                <th className="py-2.5 px-3 text-right">Amount (INR)</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Payment Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-mono font-bold text-slate-900">{inv.receiptNumber}</td>
                  <td className="py-3 px-3 text-slate-500">{inv.date}</td>
                  <td className="py-3 px-3 font-medium text-slate-800">{inv.tierName}</td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{inv.paymentId}</td>
                  <td className="py-3 px-3 text-right font-black text-slate-900 tabular-nums">
                    ₹{inv.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      CAPTURED
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">{inv.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
