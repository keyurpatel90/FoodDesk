import {
  SubscriptionState,
  SubscriptionTierId,
  TierConfig,
  UserRole,
  PaymentInvoice,
  CheckoutOrder,
} from '@/lib/subscription-types';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import { getAccessToken } from '@/lib/billing-auth';
import type { RazorpayPaymentSuccessResponse } from '@/lib/razorpay';

/**
 * Client-side view of the restaurant's subscription.
 *
 * The SOURCE OF TRUTH is the database (organizations / subscriptions / payments),
 * reached through /api/subscription/*. This module only caches what the server
 * said so the existing synchronous helpers (hasFeature, getTableLimit, ...) used
 * by the views keep working. Nothing here can grant a plan: payments are verified
 * and activated on the server.
 */

export const SUBSCRIPTION_CHANGED_EVENT = 'fooddesk_subscription_changed';
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DAY_MS = 24 * 60 * 60 * 1000;
const TIER_RANK: Record<SubscriptionTierId, number> = { starter: 1, professional: 2, enterprise: 3 };

/** Shown until the first /status response arrives (treated as "not loaded", see isLoaded()). */
const PLACEHOLDER_STATE: SubscriptionState = {
  tier: 'starter',
  status: 'inactive',
  planName: 'Loading…',
  amount: 0,
  startDate: new Date(0).toISOString(),
  expiryDate: new Date(0).toISOString(),
  isTrial: false,
  autoRenew: false,
};

export class BillingApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message);
    this.name = 'BillingApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// Last subscription the server confirmed. Used ONLY when the server cannot be reached (offline POS), and the
// expiry date inside it is still enforced. Cleared on sign-out.
const CACHE_KEY = 'fooddesk_subscription_cache_v1';

function readCache(): SubscriptionState | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubscriptionState;
    return parsed && typeof parsed.expiryDate === 'string' && parsed.tier ? parsed : null;
  } catch {
    return null;
  }
}
function writeCache(sub: SubscriptionState): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(CACHE_KEY, JSON.stringify(sub));
  } catch {
    /* storage full or blocked: fine, the cache is only a fallback */
  }
}
function clearCache(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

let current: SubscriptionState | null = null;
let invoices: PaymentInvoice[] = [];
let loaded = false;
let inflight: Promise<boolean> | null = null;
let lastError: string | null = null;

function emit(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, { detail: current }));
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new BillingApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code, data?.detail);
  }
  return data as T;
}

function isRunning(sub: SubscriptionState): boolean {
  if (sub.status === 'inactive') return false;
  return Date.parse(sub.expiryDate) > Date.now();
}

// ---------------------------------------------------------------------------
// What the plan button on each pricing card should say / do
// ---------------------------------------------------------------------------
export interface PlanAction {
  kind: 'new' | 'renew' | 'upgrade' | 'blocked';
  label: string;
  disabled: boolean;
  hint?: string;
}

const DEFAULT_LABELS: Record<SubscriptionTierId, string> = {
  starter: 'Get Started',
  professional: 'Pay ₹799 with Razorpay',
  enterprise: 'Subscribe via Razorpay',
};

/** Mirrors the server rules in lib/server/pricing.ts (the server is still the authority). */
export function getPlanAction(sub: SubscriptionState, tierId: SubscriptionTierId, isLoaded = true): PlanAction {
  const name = SUBSCRIPTION_TIERS[tierId].name;
  if (!isLoaded) return { kind: 'new', label: 'Loading…', disabled: true };

  const paidAndRunning = sub.status === 'active' && isRunning(sub);
  if (paidAndRunning) {
    if (tierId === sub.tier) {
      return { kind: 'renew', label: `Renew ${name}`, disabled: false, hint: 'Adds 30 days to your current plan' };
    }
    if (TIER_RANK[tierId] > TIER_RANK[sub.tier]) {
      return {
        kind: 'upgrade',
        label: `Upgrade to ${name}`,
        disabled: false,
        hint: 'Unused days on your current plan are credited',
      };
    }
    const when = new Date(sub.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return {
      kind: 'blocked',
      label: `Switch after ${when}`,
      disabled: true,
      hint: 'You can move to a lower plan when your current one ends',
    };
  }

  // Trial, expired, or inactive: any plan can be bought, starting today.
  const wasThisPlan = tierId === sub.tier && !sub.isTrial && sub.startDate !== PLACEHOLDER_STATE.startDate;
  return {
    kind: wasThisPlan ? 'renew' : 'new',
    label: wasThisPlan ? `Renew ${name}` : DEFAULT_LABELS[tierId],
    disabled: false,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const subscriptionService = {
  isLoaded(): boolean {
    return loaded;
  },

  getLastError(): string | null {
    return lastError;
  },

  /** Forget everything (call on sign-out so the next person on this browser starts clean). */
  reset(): void {
    current = null;
    invoices = [];
    loaded = false;
    lastError = null;
    clearCache();
    emit();
  },

  getSubscription(): SubscriptionState {
    return current ?? PLACEHOLDER_STATE;
  },

  getInvoices(): PaymentInvoice[] {
    return invoices;
  },

  /** Fetches the latest subscription + payment history from the server. Safe to call often. */
  refresh(): Promise<boolean> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const data = await api<{ subscription: SubscriptionState; invoices?: PaymentInvoice[] }>(
          '/api/subscription/status'
        );
        current = data.subscription;
        invoices = data.invoices ?? [];
        loaded = true;
        lastError = null;
        writeCache(data.subscription);
        emit();
        return true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Could not load subscription';
        // Server unreachable (offline, or a 5xx): keep a paid restaurant running on the last confirmed state.
        // 401/403/404 mean "not allowed / not linked", so no fallback for those.
        const unreachable = !(err instanceof BillingApiError) || err.status >= 500;
        if (unreachable && !loaded) {
          const cached = readCache();
          if (cached) {
            current = cached;
            loaded = true;
          }
        }
        emit();
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  /** Step 1 of paying: the server prices the change and creates the Razorpay order. */
  createOrder(tierId: SubscriptionTierId): Promise<CheckoutOrder> {
    return api<{ order: CheckoutOrder }>('/api/subscription/create-order', {
      method: 'POST',
      body: JSON.stringify({ tierId }),
    }).then((r) => r.order);
  },

  /** Step 3 of paying: the server verifies the signature + payment with Razorpay and activates the plan. */
  async verifyPayment(payment: RazorpayPaymentSuccessResponse): Promise<{ subscription: SubscriptionState; invoice?: PaymentInvoice }> {
    const data = await api<{ subscription: SubscriptionState; invoice?: PaymentInvoice }>(
      '/api/subscription/verify-payment',
      { method: 'POST', body: JSON.stringify(payment) }
    );
    current = data.subscription;
    loaded = true;
    if (data.invoice) {
      invoices = [data.invoice, ...invoices.filter((i) => i.paymentId !== data.invoice!.paymentId)];
    }
    emit();
    return data;
  },

  /**
   * Used when the payment succeeded at Razorpay but our verify call failed (flaky network).
   * The webhook will activate the plan; poll the status for a short while to pick it up.
   */
  async waitForActivation(orderId: string, attempts = 8, delayMs = 2500): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, delayMs));
      const ok = await this.refresh();
      if (ok && current?.razorpayOrderId === orderId) return true;
    }
    return false;
  },

  // --- Synchronous helpers used throughout the views (same API as before) ---------------------
  getTierConfig(tierId: SubscriptionTierId): TierConfig {
    return SUBSCRIPTION_TIERS[tierId] || SUBSCRIPTION_TIERS.professional;
  },

  getCurrentTierConfig(): TierConfig {
    return this.getTierConfig(this.getSubscription().tier);
  },

  isSubscriptionActive(): boolean {
    if (!loaded) return false;
    return isRunning(this.getSubscription());
  },

  canRoleAccessApp(role: UserRole): { allowed: boolean; reason?: string } {
    if (!this.isSubscriptionActive()) {
      if (role === 'admin') {
        return { allowed: true, reason: 'Admin can access subscription renewal dashboard.' };
      }
      return {
        allowed: false,
        reason:
          'Restaurant subscription is inactive or expired. All operational POS and Kitchen staff access is locked until an administrator renews the FoodDesk plan.',
      };
    }
    return { allowed: true };
  },

  hasFeature(feature: keyof TierConfig['limits']): boolean {
    if (!this.isSubscriptionActive()) return false;
    return !!this.getCurrentTierConfig().limits[feature];
  },

  getTableLimit(): number {
    if (!this.isSubscriptionActive()) return 0;
    return this.getCurrentTierConfig().limits.maxTables;
  },

  getStaffLimit(): number {
    if (!this.isSubscriptionActive()) return 0;
    return this.getCurrentTierConfig().limits.maxStaff;
  },

  // --- Demo-only helpers (UI preview; they never touch the server or grant anything real) ------
  setTierDirectly(tierId: SubscriptionTierId): void {
    if (!DEMO_MODE) {
      console.warn('setTierDirectly is disabled: set NEXT_PUBLIC_DEMO_MODE=true to preview tiers locally.');
      return;
    }
    const tier = SUBSCRIPTION_TIERS[tierId];
    const base = this.getSubscription();
    current = {
      ...base,
      tier: tierId,
      status: 'active',
      planName: tier.name,
      amount: tier.priceMonthly,
      isTrial: false,
      expiryDate: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    };
    loaded = true;
    emit();
  },

  expireSubscription(): void {
    if (!DEMO_MODE) {
      console.warn('expireSubscription is disabled: set NEXT_PUBLIC_DEMO_MODE=true to preview the lockout locally.');
      return;
    }
    current = { ...this.getSubscription(), status: 'inactive', expiryDate: new Date(Date.now() - DAY_MS).toISOString() };
    loaded = true;
    emit();
  },
};
