import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import type { PaymentInvoice, SubscriptionState, SubscriptionTierId } from '@/lib/subscription-types';
import { HttpError } from '@/lib/server/http';
import { getSupabaseAdmin } from '@/lib/server/supabase-admin';
import {
  describePaymentMethod,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  waitForCapturedPayment,
} from '@/lib/server/razorpay-server';
import {
  DAY_MS,
  DbSubscriptionStatus,
  OrgSubscriptionRow,
  PERIOD_DAYS,
  effectiveEnd,
  isRunning,
  isTierId,
} from '@/lib/server/pricing';

const ORG_COLUMNS =
  'id, name, subscription_tier, subscription_status, trial_ends_at, subscription_start_date, subscription_end_date, auto_renew';

interface OrgRecord {
  id: string;
  name: string | null;
  subscription_tier: SubscriptionTierId;
  subscription_status: DbSubscriptionStatus;
  trial_ends_at: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  auto_renew: boolean | null;
}

export async function loadOrganization(organizationId: string): Promise<OrgRecord> {
  const { data, error } = await getSupabaseAdmin().from('organizations').select(ORG_COLUMNS).eq('id', organizationId).maybeSingle();
  if (error) {
    console.error('[billing] failed to load organization:', error.message);
    throw new HttpError(500, 'Could not load subscription details.', 'ORG_LOAD_FAILED');
  }
  if (!data) throw new HttpError(404, 'Restaurant not found.', 'ORG_NOT_FOUND');
  return data as OrgRecord;
}

export const toPricingRow = (org: OrgRecord): OrgSubscriptionRow => ({
  tier: isTierId(org.subscription_tier) ? org.subscription_tier : 'starter',
  status: org.subscription_status,
  subscriptionEndDate: org.subscription_end_date,
  trialEndsAt: org.trial_ends_at,
});

interface PaymentRecord {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  amount: number | string;
  status: 'captured' | 'failed' | 'refunded' | 'pending';
  payment_method: string | null;
  receipt_number: string;
  created_at: string;
  billing_subscriptions?: { tier: SubscriptionTierId } | { tier: SubscriptionTierId }[] | null;
}

const PAYMENT_COLUMNS =
  'id, razorpay_order_id, razorpay_payment_id, amount, status, payment_method, receipt_number, created_at, billing_subscriptions(tier)';

export async function listPayments(organizationId: string, limit = 24): Promise<PaymentRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('billing_payments')
    .select(PAYMENT_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[billing] failed to load payments:', error.message);
    return [];
  }
  return (data ?? []) as unknown as PaymentRecord[];
}

export function toInvoice(p: PaymentRecord): PaymentInvoice {
  const sub = Array.isArray(p.billing_subscriptions) ? p.billing_subscriptions[0] : p.billing_subscriptions;
  const tierId: SubscriptionTierId = sub && isTierId(sub.tier) ? sub.tier : 'starter';
  return {
    id: p.id,
    paymentId: p.razorpay_payment_id,
    orderId: p.razorpay_order_id,
    tierId,
    tierName: `${SUBSCRIPTION_TIERS[tierId].name} Plan (Monthly)`,
    amount: Number(p.amount),
    date: new Date(p.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
    status: p.status === 'pending' ? 'failed' : p.status,
    method: p.payment_method || 'Razorpay',
    receiptNumber: p.receipt_number,
  };
}

/** Turns the database row into the SubscriptionState shape the UI already understands. */
export function buildSubscriptionState(org: OrgRecord, latest?: PaymentRecord, now: Date = new Date()): SubscriptionState {
  const row = toPricingRow(org);
  const cfg = SUBSCRIPTION_TIERS[row.tier];
  const running = isRunning(row, now);
  const end = effectiveEnd(row);
  const isTrial = running && row.status === 'trial';

  return {
    tier: row.tier,
    status: running ? (isTrial ? 'trial' : 'active') : 'inactive',
    planName: isTrial ? `${cfg.name} (14-Day Free Trial)` : cfg.name,
    amount: isTrial ? 0 : cfg.priceMonthly,
    startDate: org.subscription_start_date ?? new Date(0).toISOString(),
    expiryDate: (end ?? new Date(0)).toISOString(),
    isTrial,
    trialDaysRemaining: isTrial && end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)) : undefined,
    daysRemaining: running && end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)) : 0,
    autoRenew: false, // one-time monthly Razorpay payments; the owner renews manually
    razorpayPaymentId: latest?.razorpay_payment_id,
    razorpayOrderId: latest?.razorpay_order_id,
  };
}

export class NotOurOrderError extends HttpError {
  constructor() {
    super(422, 'This Razorpay order was not created by FoodDesk.', 'NOT_OUR_ORDER');
  }
}

export interface FinalizeResult {
  alreadyProcessed: boolean;
  organizationId: string;
  subscription: SubscriptionState;
  invoice?: PaymentInvoice;
}

/**
 * The ONE place a plan gets activated. Called by /verify-payment (browser, after Checkout) and by the
 * webhook (Razorpay, server-to-server). It never trusts the caller: everything is re-read from Razorpay.
 * It is idempotent, so the browser call and the webhook can both run for the same payment.
 *
 *  1. Fetch the order from Razorpay -> tier + organization come from notes WE wrote at create-order.
 *  2. Fetch the payment from Razorpay -> must belong to that order, be captured, and match amount/currency.
 *  3. Activate in Postgres through activate_organization_subscription() (row-locked, de-duplicated).
 */
export async function finalizePayment(args: {
  orderId: string;
  paymentId: string;
  signature?: string | null;
  /** When set (browser path), the order must belong to this organization. */
  expectedOrganizationId?: string;
}): Promise<FinalizeResult> {
  const order = await fetchRazorpayOrder(args.orderId);
  const notes = (Array.isArray(order.notes) ? {} : order.notes ?? {}) as Record<string, string>;
  const organizationId = notes.organization_id;
  const tierId = notes.tier_id;
  if (!organizationId || !isTierId(tierId)) throw new NotOurOrderError();

  if (args.expectedOrganizationId && args.expectedOrganizationId !== organizationId) {
    throw new HttpError(403, 'This payment belongs to a different restaurant.', 'ORG_MISMATCH');
  }

  const initial = await fetchRazorpayPayment(args.paymentId);
  if (initial.order_id !== order.id) {
    throw new HttpError(400, 'Payment does not belong to this order.', 'PAYMENT_ORDER_MISMATCH');
  }
  const payment = initial.status === 'captured' ? initial : await waitForCapturedPayment(initial.id, order.amount);
  if (payment.status !== 'captured') {
    throw new HttpError(402, `Payment is not completed yet (status: ${payment.status}).`, 'PAYMENT_NOT_CAPTURED');
  }
  if (payment.amount !== order.amount || payment.currency !== 'INR' || order.currency !== 'INR') {
    console.error('[billing] amount/currency mismatch', { order, payment });
    throw new HttpError(400, 'Payment amount does not match the order.', 'AMOUNT_MISMATCH');
  }

  const { data, error } = await getSupabaseAdmin().rpc('activate_organization_subscription', {
    p_org_id: organizationId,
    p_tier: tierId,
    p_amount: order.amount / 100,
    p_razorpay_order_id: order.id,
    p_razorpay_payment_id: payment.id,
    p_razorpay_signature: args.signature ?? null,
    p_payment_method: describePaymentMethod(payment),
    p_period_days: PERIOD_DAYS,
  });
  if (error) {
    const reason = [error.code, error.message, error.hint].filter(Boolean).join(' | ');
    console.error('[billing] activate_organization_subscription failed:', reason);
    throw new HttpError(
      500,
      'Payment received but activation failed. It will be retried automatically.',
      'ACTIVATION_FAILED',
      reason
    );
  }

  const [org, payments] = await Promise.all([loadOrganization(organizationId), listPayments(organizationId, 1)]);
  const latest = payments[0];
  return {
    alreadyProcessed: !!(data as { already_processed?: boolean } | null)?.already_processed,
    organizationId,
    subscription: buildSubscriptionState(org, latest),
    invoice: latest ? toInvoice(latest) : undefined,
  };
}
