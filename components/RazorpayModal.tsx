'use client';
import React, { useState } from 'react';
import { TierConfig } from '@/lib/subscription-types';
import { razorpayService, RazorpayPaymentSuccessResponse } from '@/lib/razorpay';
import { getFoodDeskOrganizationId, getSupabaseAccessToken } from '@/lib/subscription-client';
import { ShieldCheck, X, Loader2, CreditCard } from 'lucide-react';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, callback: (error: unknown) => void) => void };
  }
}
interface RazorpayModalProps {
  tier: TierConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentId: string, orderId: string, expiryDate?: string) => void;
}
export const RazorpayModal: React.FC<RazorpayModalProps> = ({ tier, isOpen, onClose, onSuccess }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  if (!isOpen) return null;

  const handlePayNow = async () => {
    setError('');
    setIsProcessing(true);
    try {
      const organizationId = getFoodDeskOrganizationId();
      const accessToken = getSupabaseAccessToken();
      if (!organizationId) throw new Error('Restaurant organization is not selected. Sign in again or ask your administrator to set the restaurant organization.');
      if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

      const loaded = await razorpayService.loadScript();
      if (!loaded || !window.Razorpay) throw new Error('Could not load Razorpay Checkout. Check your internet connection and retry.');

      const orderResponse = await fetch('/api/subscription/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ organizationId, tierId: tier.id }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok || !order.success || !order.orderId || !order.keyId) {
        throw new Error(order.error || 'Could not start Razorpay checkout. Check server Razorpay configuration.');
      }

      const checkout = new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency || 'INR',
        name: 'FoodDesk', description: `${tier.name} subscription - 1 month`, order_id: order.orderId,
        theme: { color: '#7367f0' },
        notes: { organizationId, tierId: tier.id },
        handler: async (response: RazorpayPaymentSuccessResponse) => {
          try {
            const verifyResponse = await fetch('/api/subscription/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                organizationId, tierId: tier.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verified = await verifyResponse.json();
            if (!verifyResponse.ok || !verified.success) throw new Error(verified.error || 'Payment could not be verified.');
            onSuccess(response.razorpay_payment_id, response.razorpay_order_id, verified.subscription?.expires_at);
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Payment verification failed. Do not retry payment until you check the payment status.');
          } finally { setIsProcessing(false); }
        },
        modal: { ondismiss: () => setIsProcessing(false), escape: true, backdropclose: false },
      });
      checkout.on('payment.failed', (event: unknown) => {
        const description = (event as { error?: { description?: string } })?.error?.description;
        setError(description || 'Payment failed. Please try again.');
        setIsProcessing(false);
      });
      checkout.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start payment.');
      setIsProcessing(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-200">
      <div className="bg-[#0c2340] text-white p-5 flex items-start justify-between">
        <div><div className="text-xs uppercase tracking-wider text-slate-300">Secure payment</div>
          <h2 className="text-lg font-bold mt-1">FoodDesk {tier.name} plan</h2>
          <p className="text-sm text-slate-300 mt-1">One month subscription</p></div>
        <button onClick={onClose} disabled={isProcessing} aria-label="Close" className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5"><span className="text-sm text-slate-600">Amount payable</span>
          <span className="text-3xl font-extrabold text-slate-900">₹{tier.priceMonthly.toLocaleString('en-IN')}</span></div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex gap-3 items-start mb-5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">Payment is processed by Razorpay. Your subscription is activated only after the server verifies the captured payment.</p>
        </div>
        {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 p-3 text-sm">{error}</div>}
        <button onClick={handlePayNow} disabled={isProcessing} className="w-full py-3 px-4 bg-[#7367f0] hover:bg-[#6257d9] disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
          {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><CreditCard className="w-4 h-4" /> Continue to Razorpay</>}
        </button>
        <p className="text-[11px] text-center text-slate-400 mt-3">No simulated payments. Test mode requires your own Razorpay test keys.</p>
      </div>
    </div>
  </div>;
};
