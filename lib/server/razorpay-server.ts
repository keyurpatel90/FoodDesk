import crypto from 'crypto';
import { HttpError } from '@/lib/server/http';

/**
 * Server-side Razorpay REST helpers. Uses Razorpay's HTTP API directly (no SDK dependency).
 * There is deliberately NO simulated/fallback mode: if Razorpay is not configured or the API call
 * fails, the request fails loudly instead of pretending a payment happened.
 */

const API_BASE = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

export function getRazorpayConfig(): RazorpayConfig {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error('[razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
    throw new HttpError(503, 'Online payments are not configured yet. Please contact support.', 'RAZORPAY_NOT_CONFIGURED');
  }
  return { keyId, keySecret };
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid';
  receipt?: string;
  notes?: Record<string, string> | unknown[];
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  card?: { network?: string; last4?: string } | null;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { keyId, keySecret } = getRazorpayConfig();
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[razorpay] network error calling', path, err);
    throw new HttpError(502, 'Could not reach Razorpay. Please try again in a moment.', 'RAZORPAY_UNREACHABLE');
  }

  const data = (await res.json().catch(() => ({}))) as { error?: { description?: string; code?: string } };
  if (!res.ok) {
    console.error('[razorpay] API error', res.status, path, JSON.stringify(data));
    if (res.status === 401) {
      throw new HttpError(503, 'Razorpay rejected our credentials. Please contact support.', 'RAZORPAY_AUTH_FAILED');
    }
    throw new HttpError(
      res.status === 400 || res.status === 404 ? 400 : 502,
      data?.error?.description || 'Razorpay request failed',
      'RAZORPAY_API_ERROR'
    );
  }
  return data as T;
}

export const createRazorpayOrder = (args: {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}) =>
  call<RazorpayOrder>('/orders', {
    method: 'POST',
    body: { amount: args.amountPaise, currency: 'INR', receipt: args.receipt, notes: args.notes },
  });

export const fetchRazorpayOrder = (orderId: string) => call<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);

export const fetchRazorpayPayment = (paymentId: string) =>
  call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);

/** Only needed if the Razorpay account is NOT set to auto-capture; harmless otherwise. */
export const captureRazorpayPayment = (paymentId: string, amountPaise: number) =>
  call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    body: { amount: amountPaise, currency: 'INR' },
  });

function safeHexEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verifies the signature Razorpay Checkout hands to the browser: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret } = getRazorpayConfig();
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeHexEqual(expected, signature);
}

/** Verifies a webhook: HMAC_SHA256(raw_body, webhook_secret). The secret is mandatory. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[razorpay] RAZORPAY_WEBHOOK_SECRET is not set; rejecting webhook');
    return false;
  }
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeHexEqual(expected, signature);
}

/** Human-readable payment method for the invoice table, taken from Razorpay (not from the browser). */
export function describePaymentMethod(p: RazorpayPayment): string {
  switch (p.method) {
    case 'upi':
      return 'Razorpay UPI';
    case 'card':
      return `Razorpay Card${p.card?.network ? ` (${p.card.network}${p.card.last4 ? ` •••• ${p.card.last4}` : ''})` : ''}`;
    case 'netbanking':
      return `Razorpay Netbanking${p.bank ? ` (${p.bank})` : ''}`;
    case 'wallet':
      return `Razorpay Wallet${p.wallet ? ` (${p.wallet})` : ''}`;
    default:
      return 'Razorpay';
  }
}
