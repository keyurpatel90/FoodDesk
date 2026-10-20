import { SubscriptionState, SubscriptionTierId, TierConfig, UserRole, PaymentInvoice } from '@/lib/subscription-types';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';

const STORAGE_KEY = 'fooddesk_subscription_state_v1';
const INVOICES_KEY = 'fooddesk_billing_invoices_v1';

const DEFAULT_STATE: SubscriptionState = {
  tier: 'starter',
  status: 'inactive',
  planName: 'No active plan',
  amount: 0,
  startDate: new Date().toISOString(),
  expiryDate: new Date(0).toISOString(),
  isTrial: false,
  autoRenew: false,
};

const INITIAL_INVOICES: PaymentInvoice[] = [];

export const subscriptionService = {
  getSubscription(): SubscriptionState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SubscriptionState;
        // Reject legacy/demo activations created by the old mock Razorpay checkout.
        if (parsed.razorpayPaymentId?.startsWith('pay_FD_') ||
            parsed.razorpayPaymentId === 'trial_free_activation' ||
            parsed.razorpayOrderId?.startsWith('order_FD_')) {
          return DEFAULT_STATE;
        }
        return parsed;
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
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed as PaymentInvoice[] : [];
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

  activateTier(tierId: SubscriptionTierId, paymentId: string, orderId: string, method = 'Razorpay Checkout', verifiedExpiryDate?: string): void {
    const tier = SUBSCRIPTION_TIERS[tierId];
    const newState: SubscriptionState = {
      tier: tierId,
      status: 'active',
      planName: tier.name,
      amount: tier.priceMonthly,
      startDate: new Date().toISOString(),
      expiryDate: verifiedExpiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
      receiptNumber: `FD-${new Date().getUTCFullYear()}-${paymentId.slice(-8).toUpperCase()}`,
    };
    this.addInvoice(newInvoice);


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

};
