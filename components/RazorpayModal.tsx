'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckoutOrder, TierConfig } from '@/lib/subscription-types';
import { razorpayService } from '@/lib/razorpay';
import { BillingApiError, subscriptionService } from '@/lib/subscription';
import { ShieldCheck, CheckCircle2, X, Loader2, ArrowRight, AlertCircle, Info } from 'lucide-react';

interface RazorpayModalProps {
  tier: TierConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentId: string, orderId: string) => void;
}

type Step = 'preparing' | 'review' | 'checkout' | 'verifying' | 'success' | 'error';

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const KIND_TEXT: Record<CheckoutOrder['kind'], string> = {
  new: 'Starts today and runs for 30 days.',
  renew: 'Adds 30 days after your current plan ends. Nothing is lost.',
  upgrade: 'Starts today for 30 days. Unused days on your current plan are credited.',
  blocked_downgrade: '',
};

/**
 * Plan checkout. Flow:
 *   1. server creates a real Razorpay order (and prices renewals / upgrades)
 *   2. the owner reviews the amount, then the real Razorpay Checkout popup opens
 *   3. on success the server verifies the signature with Razorpay and activates the plan
 */
export const RazorpayModal: React.FC<RazorpayModalProps> = ({ tier, isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<Step>('preparing');
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryStep, setRetryStep] = useState<'preparing' | 'review'>('preparing');
  const [result, setResult] = useState<{ paymentId: string; orderId: string } | null>(null);

  const startedRef = useRef(false);
  const paidRef = useRef(false);
  const lastFailureRef = useRef<string | null>(null);

  const prepare = useCallback(async () => {
    setStep('preparing');
    setError(null);
    try {
      const created = await subscriptionService.createOrder(tier.id);
      setOrder(created);
      setStep('review');
    } catch (err) {
      setError(err instanceof BillingApiError || err instanceof Error ? err.message : 'Could not start checkout.');
      setRetryStep('preparing');
      setStep('error');
    }
  }, [tier.id]);

  useEffect(() => {
    if (!isOpen || startedRef.current) return;
    startedRef.current = true;
    void prepare();
  }, [isOpen, prepare]);

  if (!isOpen) return null;

  const handlePay = async () => {
    if (!order) return;
    setError(null);
    lastFailureRef.current = null;
    paidRef.current = false;

    const loaded = await razorpayService.loadScript();
    if (!loaded) {
      setError('Could not load Razorpay checkout. Check your internet connection and try again.');
      setRetryStep('review');
      setStep('error');
      return;
    }

    setStep('checkout');
    try {
      razorpayService.openCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: `${order.tierName} plan – 1 month`,
        prefill: order.prefill,
        onSuccess: async (response) => {
          paidRef.current = true;
          setStep('verifying');
          try {
            await subscriptionService.verifyPayment(response);
            setResult({ paymentId: response.razorpay_payment_id, orderId: response.razorpay_order_id });
            setStep('success');
          } catch {
            // Money was taken, but our verify call did not complete (network?). The webhook will activate
            // the plan; wait for it briefly before telling the owner anything alarming.
            const activated = await subscriptionService.waitForActivation(response.razorpay_order_id);
            if (activated) {
              setResult({ paymentId: response.razorpay_payment_id, orderId: response.razorpay_order_id });
              setStep('success');
            } else {
              setResult({ paymentId: response.razorpay_payment_id, orderId: response.razorpay_order_id });
              setError(
                `Your payment was received (ID: ${response.razorpay_payment_id}) but activation is taking longer than usual. ` +
                  'It will be applied automatically within a few minutes. Refresh this page shortly, and contact support with this payment ID if your plan is still not active.'
              );
              setRetryStep('review');
              setStep('error');
            }
          }
        },
        onFailure: (failure) => {
          // Razorpay keeps its popup open so the owner can retry another method; just remember why.
          lastFailureRef.current = failure.error?.description || 'Payment failed. Please try again.';
        },
        onDismiss: () => {
          if (paidRef.current) return; // popup closes itself after a successful payment
          if (lastFailureRef.current) setError(lastFailureRef.current);
          setStep('review');
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Razorpay checkout.');
      setRetryStep('review');
      setStep('error');
    }
  };

  const handleFinish = () => {
    if (result) onSuccess(result.paymentId, result.orderId);
    onClose();
  };

  const canClose = step !== 'checkout' && step !== 'verifying';
  const isTestMode = order?.keyId.startsWith('rzp_test_');
  const displayAmount = order ? rupees(order.amountPaise) : rupees(tier.priceMonthly * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-200">
        {/* Header */}
        <div className="bg-[#0c2340] text-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#3395ff] flex items-center justify-center font-black text-white text-sm tracking-wider">
                R
              </div>
              <div>
                <div className="text-xs font-semibold tracking-wider text-slate-300 uppercase">Secure payment by Razorpay</div>
                <div className="text-base font-bold text-white tracking-tight">FoodDesk Restaurant POS</div>
              </div>
            </div>
            {canClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex items-end justify-between pt-2 border-t border-slate-700/60">
            <div>
              <div className="text-xs text-slate-300">
                {order?.kind === 'renew' ? 'Plan Renewal' : order?.kind === 'upgrade' ? 'Plan Upgrade' : 'Subscription'}
              </div>
              <div className="text-sm font-medium text-slate-100">{tier.name} Plan (1 Month)</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">Amount Due</div>
              <div className="text-2xl font-bold text-white tabular-nums">{displayAmount}</div>
            </div>
          </div>
        </div>

        {/* Preparing */}
        {step === 'preparing' && (
          <div className="p-10 text-center flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#3395ff] animate-spin mb-4" />
            <p className="text-sm text-slate-600">Preparing your secure checkout…</p>
          </div>
        )}

        {/* Review */}
        {step === 'review' && order && (
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <div className="flex justify-between p-3">
                <span className="text-slate-600">{order.tierName} plan · 30 days</span>
                <span className="font-semibold text-slate-900 tabular-nums">{rupees(order.listPricePaise)}</span>
              </div>
              {order.creditPaise > 0 && (
                <div className="flex justify-between p-3">
                  <span className="text-emerald-700">Credit for unused days on your current plan</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">−{rupees(order.creditPaise)}</span>
                </div>
              )}
              <div className="flex justify-between p-3 bg-slate-50">
                <span className="font-semibold text-slate-900">Total today</span>
                <span className="font-bold text-slate-900 tabular-nums">{rupees(order.amountPaise)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{KIND_TEXT[order.kind]}</p>

            {isTestMode && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Test mode: no real money is charged. Use UPI <span className="font-mono">success@razorpay</span> or card{' '}
                  <span className="font-mono">4111 1111 1111 1111</span> (any future expiry, any CVV).
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handlePay}
              className="mt-5 w-full py-3 px-4 bg-[#3395ff] hover:bg-[#2082ec] text-white rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Pay {rupees(order.amountPaise)} via Razorpay</span>
            </button>
            <div className="text-center text-[11px] text-slate-400 mt-3">
              UPI · Cards · Netbanking · Wallets · Instant activation
            </div>
          </div>
        )}

        {/* Razorpay popup is open */}
        {step === 'checkout' && (
          <div className="p-10 text-center flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-[#3395ff] animate-spin mb-4" />
            <p className="text-sm text-slate-600">Complete the payment in the Razorpay window…</p>
          </div>
        )}

        {/* Verifying */}
        {step === 'verifying' && (
          <div className="p-10 text-center flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-[#3395ff] animate-spin mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-1">Confirming your payment</h3>
            <p className="text-sm text-slate-600 max-w-xs">Please don’t close this window. This only takes a moment.</p>
          </div>
        )}

        {/* Success */}
        {step === 'success' && result && (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Subscription Activated!</h3>
            <p className="text-sm text-slate-600 mb-6">
              Your restaurant is on the <span className="font-semibold text-slate-900">{tier.name}</span> plan until{' '}
              <span className="font-semibold text-slate-900">
                {new Date(subscriptionService.getSubscription().expiryDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              .
            </p>
            <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-500">Razorpay Payment ID:</span>
                <span className="font-mono font-medium text-slate-800">{result.paymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order ID:</span>
                <span className="font-mono font-medium text-slate-800">{result.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Paid:</span>
                <span className="font-semibold text-slate-900 tabular-nums">{displayAmount}</span>
              </div>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-3 px-4 bg-[#0c2340] text-white rounded-xl font-semibold hover:bg-[#163b69] transition-colors flex items-center justify-center gap-2 text-sm shadow-sm cursor-pointer"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {result ? 'Payment received' : 'We couldn’t start the payment'}
            </h3>
            <p className="text-sm text-slate-600 mb-6 max-w-sm">{error}</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Close
              </button>
              {!result && (
                <button
                  onClick={() => (retryStep === 'review' ? setStep('review') : void prepare())}
                  className="flex-1 py-2.5 px-4 bg-[#3395ff] hover:bg-[#2082ec] text-white rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
