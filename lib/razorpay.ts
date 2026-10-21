/**
 * Browser-side Razorpay Standard Checkout wrapper.
 *
 * The Key ID is NOT configured here any more: it comes back from
 * POST /api/subscription/create-order (server env RAZORPAY_KEY_ID), so the
 * browser can never be pointed at a different account via localStorage.
 */

export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error: {
    code?: string;
    description?: string;
    reason?: string;
    step?: string;
    source?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}

export interface RazorpayOptions {
  key: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayPaymentSuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    backdropclose?: boolean;
    confirm_close?: boolean;
  };
}

export interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: 'payment.failed', cb: (response: RazorpayFailureResponse) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise: Promise<boolean> | null = null;

export interface OpenCheckoutArgs {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  onSuccess: (response: RazorpayPaymentSuccessResponse) => void;
  onFailure?: (response: RazorpayFailureResponse) => void;
  onDismiss?: () => void;
}

export const razorpayService = {
  isSDKLoaded(): boolean {
    return typeof window !== 'undefined' && typeof window.Razorpay === 'function';
  },

  /** Loads checkout.js once. Resolves false if it could not be loaded (offline, blocked, etc). */
  loadScript(): Promise<boolean> {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (this.isSDKLoaded()) return Promise.resolve(true);
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => resolve(razorpayService.isSDKLoaded());
      script.onerror = () => {
        script.remove();
        scriptPromise = null; // allow a retry
        resolve(false);
      };
      document.body.appendChild(script);
    });
    return scriptPromise;
  },

  /** Opens the real Razorpay Checkout popup for an order that was created on the server. */
  openCheckout(args: OpenCheckoutArgs): void {
    if (!this.isSDKLoaded() || !window.Razorpay) {
      throw new Error('Razorpay checkout is not loaded yet');
    }

    const rzp = new window.Razorpay({
      key: args.keyId,
      order_id: args.orderId,
      amount: args.amountPaise,
      currency: args.currency,
      name: 'FoodDesk',
      description: args.description,
      prefill: args.prefill,
      notes: args.notes,
      theme: { color: '#6c5ce7' },
      handler: args.onSuccess,
      modal: {
        ondismiss: args.onDismiss,
        escape: false, // avoid closing a payment in progress by accident
        confirm_close: true,
      },
    });

    rzp.on('payment.failed', (response) => args.onFailure?.(response));
    rzp.open();
  },
};
