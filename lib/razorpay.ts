export interface RazorpayPaymentSuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export const razorpayService = {
  isSDKLoaded(): boolean {
    return typeof window !== 'undefined' &&
      typeof (window as unknown as { Razorpay?: unknown }).Razorpay === 'function';
  },
  loadScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isSDKLoaded()) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(this.isSDKLoaded());
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },
};
