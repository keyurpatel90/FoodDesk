import { SubscriptionState, SubscriptionTierId, TierConfig, UserRole, PaymentInvoice } from '@/lib/subscription-types';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';

const STORAGE_KEY = 'fooddesk_subscription_state_v1';
const INVOICES_KEY = 'fooddesk_billing_invoices_v1';

const DEFAULT_STATE: SubscriptionState = {
  tier: 'professional',
  status: 'active',
  planName: 'Professional',
  amount: 799,
  startDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  isTrial: false,
  autoRenew: true,
  razorpayPaymentId: 'pay_FD_init_982341',
  razorpayOrderId: 'order_FD_init_4421',
};

const INITIAL_INVOICES: PaymentInvoice[] = [
  {
    id: 'inv-101',
    paymentId: 'pay_FD_init_982341',
    orderId: 'order_FD_init_4421',
    tierId: 'professional',
    tierName: 'Professional Plan (Monthly)',
    amount: 799,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    status: 'captured',
    method: 'Razorpay UPI (Google Pay)',
    receiptNumber: 'RCP-2026-0891',
  },
];

export const subscriptionService = {
  getSubscription(): SubscriptionState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return DEFAULT_STATE;
  },

  saveSubscription(state: SubscriptionState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('fooddesk_subscription_changed', { detail: state }));
    } catch {
      // ignore
    }
  },

  getTierConfig(tierId: SubscriptionTierId): TierConfig {
    return SUBSCRIPTION_TIERS[tierId] || SUBSCRIPTION_TIERS.professional;
  },

  getCurrentTierConfig(): TierConfig {
    const sub = this.getSubscription();
    return this.getTierConfig(sub.tier);
  },

  isSubscriptionActive(): boolean {
    const sub = this.getSubscription();
    if (sub.status === 'inactive') return false;
    // Check expiry
    const exp = new Date(sub.expiryDate).getTime();
    if (Date.now() > exp) return false;
    return true;
  },

  canRoleAccessApp(role: UserRole): { allowed: boolean; reason?: string } {
    const isActive = this.isSubscriptionActive();
    if (!isActive) {
      if (role === 'admin') {
        return { allowed: true, reason: 'Admin can access subscription renewal dashboard.' };
      }
      return {
        allowed: false,
        reason: 'Restaurant subscription is inactive or expired. All operational POS and Kitchen staff access is locked until an administrator renews the FoodDesk plan.',
      };
    }
    return { allowed: true };
  },

  hasFeature(feature: keyof TierConfig['limits']): boolean {
    if (!this.isSubscriptionActive()) return false;
    const config = this.getCurrentTierConfig();
    return !!config.limits[feature];
  },

  getTableLimit(): number {
    if (!this.isSubscriptionActive()) return 0;
    const config = this.getCurrentTierConfig();
    return config.limits.maxTables;
  },

  getStaffLimit(): number {
    if (!this.isSubscriptionActive()) return 0;
    const config = this.getCurrentTierConfig();
    return config.limits.maxStaff;
  },

  getInvoices(): PaymentInvoice[] {
    try {
      const stored = localStorage.getItem(INVOICES_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return INITIAL_INVOICES;
  },

  addInvoice(invoice: PaymentInvoice): void {
    const invoices = this.getInvoices();
    invoices.unshift(invoice);
    try {
      localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
    } catch {
      // ignore
    }
  },

  activateTier(tierId: SubscriptionTierId, paymentId: string, orderId: string, method = 'Razorpay Checkout'): void {
    const tier = SUBSCRIPTION_TIERS[tierId];
    const newState: SubscriptionState = {
      tier: tierId,
      status: 'active',
      planName: tier.name,
      amount: tier.priceMonthly,
      startDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isTrial: false,
      autoRenew: true,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
    };
    this.saveSubscription(newState);

    // Record invoice locally
    const newInvoice: PaymentInvoice = {
      id: `inv-${Date.now()}`,
      paymentId,
      orderId,
      tierId,
      tierName: `${tier.name} Plan (Monthly)`,
      amount: tier.priceMonthly,
      date: new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      status: 'captured',
      method,
      receiptNumber: `RCP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    };
    this.addInvoice(newInvoice);

    // Sync to backend database endpoint if server is available
    try {
      fetch('/api/subscription/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: 'org_fooddesk_default',
          tierId,
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: `sig_verified_${Date.now()}`,
          payment_method: method,
        }),
      }).catch((err) => {
        console.warn('Backend sync attempted; stored persistently in local database:', err);
      });
    } catch {
      // offline / standalone mode fallback
    }
  },

  startFreeTrial(): void {
    const tier = SUBSCRIPTION_TIERS.professional;
    const newState: SubscriptionState = {
      tier: 'professional',
      status: 'trial',
      planName: 'Professional (14-Day Free Trial)',
      amount: 0,
      startDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      isTrial: true,
      trialDaysRemaining: 14,
      autoRenew: false,
      razorpayPaymentId: 'trial_free_activation',
      razorpayOrderId: 'order_trial_14d',
    };
    this.saveSubscription(newState);
  },

  expireSubscription(): void {
    const current = this.getSubscription();
    this.saveSubscription({
      ...current,
      status: 'inactive',
      expiryDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
  },

  reactivateDefault(): void {
    this.saveSubscription(DEFAULT_STATE);
  },

  setTierDirectly(tierId: SubscriptionTierId): void {
    const tier = SUBSCRIPTION_TIERS[tierId];
    const current = this.getSubscription();
    this.saveSubscription({
      ...current,
      tier: tierId,
      status: 'active',
      planName: tier.name,
      amount: tier.priceMonthly,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  },
};
