export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number; // in paise (e.g., 79900 for ₹799)
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
  handler?: (response: RazorpayPaymentSuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
    escape?: boolean;
    backdropclose?: boolean;
  };
}

const RAZORPAY_CONFIG_KEY = 'fooddesk_razorpay_key_id';
const DEFAULT_KEY_ID = 'rzp_test_fooddesk_pos_2026';

export const razorpayService = {
  getKeyId(): string {
    try {
      const stored = localStorage.getItem(RAZORPAY_CONFIG_KEY);
      if (stored) return stored;
    } catch {
      // ignore
    }
    return DEFAULT_KEY_ID;
  },

  setKeyId(keyId: string): void {
    try {
      localStorage.setItem(RAZORPAY_CONFIG_KEY, keyId);
    } catch {
      // ignore
    }
  },

  isSDKLoaded(): boolean {
    return typeof window !== 'undefined' && typeof (window as unknown as { Razorpay?: unknown }).Razorpay === 'function';
  },

  loadScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isSDKLoaded()) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  generateMockOrder(amountInRupees: number): { orderId: string; amountInPaise: number } {
    const timestamp = Date.now().toString().slice(-6);
    return {
      orderId: `order_FD_${timestamp}`,
      amountInPaise: Math.round(amountInRupees * 100),
    };
  },

  generateMockPaymentSuccess(orderId: string): RazorpayPaymentSuccessResponse {
    const randomHex = Math.random().toString(36).substring(2, 9).toUpperCase();
    return {
      razorpay_payment_id: `pay_FD_${randomHex}`,
      razorpay_order_id: orderId,
      razorpay_signature: `sig_FD_${Math.random().toString(36).substring(2, 15)}`,
    };
  },
};
