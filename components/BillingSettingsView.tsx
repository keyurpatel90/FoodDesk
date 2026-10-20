import React, { useState } from 'react';
import { SubscriptionState, PaymentInvoice } from '@/lib/subscription-types';
import { subscriptionService } from '@/lib/subscription';
import { razorpayService } from '@/lib/razorpay';
import { SubscriptionCards } from './SubscriptionCards';
import { CreditCard, ShieldCheck, Key, RefreshCw, Calendar, CheckCircle2 } from 'lucide-react';

interface BillingSettingsViewProps {
  subscription: SubscriptionState;
  onSubscriptionUpdated: () => void;
}

export const BillingSettingsView: React.FC<BillingSettingsViewProps> = ({
  subscription,
  onSubscriptionUpdated,
}) => {
  const [razorpayKey, setRazorpayKey] = useState(razorpayService.getKeyId());
  const [saveSuccess, setSaveSuccess] = useState(false);
  const invoices: PaymentInvoice[] = subscriptionService.getInvoices();

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    razorpayService.setKeyId(razorpayKey);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const isActive = subscriptionService.isSubscriptionActive();

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
              <div className="text-2xl font-black capitalize text-slate-900">{subscription.planName}</div>
              <div className="text-xs text-slate-500 tabular-nums">
                ₹{subscription.amount} / month {subscription.isTrial && '(14-Day Free Trial)'}
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
              {new Date(subscription.expiryDate).toLocaleDateString('en-IN', {
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
              {subscription.razorpayPaymentId || 'N/A'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-slate-500 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-Renewal</span>
            </div>
            <div className="font-bold text-emerald-700 mt-1">
              {subscription.autoRenew ? 'Enabled via Razorpay Subscriptions' : 'Manual Renewal'}
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
          currentSubscription={subscription}
          onSubscriptionUpdated={onSubscriptionUpdated}
        />
      </div>

      {/* Razorpay Gateway Configuration */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-lg bg-[#0c2340] text-[#3395ff] flex items-center justify-center font-bold">
            <Key className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Razorpay Payment Gateway Credentials</h3>
            <p className="text-xs text-slate-500">Configure your Razorpay Key ID for processing subscriptions</p>
          </div>
        </div>

        <form onSubmit={handleSaveKey} className="max-w-xl space-y-3 mt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Razorpay Key ID (Test or Live)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={razorpayKey}
                onChange={(e) => setRazorpayKey(e.target.value)}
                placeholder="rzp_test_..."
                className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Save Key
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Safe fallback test gateway is enabled so you can test complete end-to-end payment flows with instant verification!
            </p>
          </div>

          {saveSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Razorpay Key ID updated successfully!</span>
            </div>
          )}
        </form>
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
