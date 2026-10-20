import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { authorizeOrganization, isPlanId, PLAN_PRICES, razorpayRequest, requiredEnv, timingSafeEqualHex } from '@/lib/subscription-server';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { organizationId, tierId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body ?? {};
    if (!isPlanId(tierId) || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing or invalid payment verification fields.' }, { status: 400 });
    }
    const auth = await authorizeOrganization(req, organizationId);
    const secret = requiredEnv('RAZORPAY_KEY_SECRET');
    const expected = crypto.createHmac('sha256', secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (!timingSafeEqualHex(expected, String(razorpay_signature))) {
      return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
    }

    // Verify the order and payment directly with Razorpay; never activate from client claims alone.
    const [order, payment] = await Promise.all([
      razorpayRequest(`orders/${encodeURIComponent(razorpay_order_id)}`),
      razorpayRequest(`payments/${encodeURIComponent(razorpay_payment_id)}`),
    ]);
    const plan = PLAN_PRICES[tierId];
    if (order.id !== razorpay_order_id || order.status === 'created' && payment.status !== 'captured') {
      return NextResponse.json({ error: 'Payment has not been captured yet.' }, { status: 409 });
    }
    if (Number(order.amount) !== plan.amountPaise || Number(payment.amount) !== plan.amountPaise ||
        payment.order_id !== razorpay_order_id || payment.currency !== 'INR' ||
        order.notes?.organizationId !== auth.organizationId || order.notes?.tierId !== tierId ||
        payment.status !== 'captured') {
      return NextResponse.json({ error: 'Payment details do not match this restaurant and plan.' }, { status: 400 });
    }

    const receiptNumber = `FD-${new Date().getUTCFullYear()}-${razorpay_payment_id.slice(-8).toUpperCase()}`;
    const rpcRes = await fetch(`${auth.supabaseUrl}/rest/v1/rpc/activate_organization_subscription`, {
      method: 'POST',
      headers: {
        apikey: auth.serviceKey, Authorization: `Bearer ${auth.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_org_id: auth.organizationId, p_tier: tierId, p_amount: plan.amountRupees,
        p_razorpay_order_id: razorpay_order_id, p_razorpay_payment_id: razorpay_payment_id,
        p_razorpay_signature: razorpay_signature, p_payment_method: payment.method || 'Razorpay Checkout',
        p_receipt_number: receiptNumber,
      }),
      cache: 'no-store',
    });
    const rpcData = await rpcRes.json().catch(() => null);
    if (!rpcRes.ok || !rpcData?.success) {
      console.error('Subscription activation RPC failed', rpcData);
      return NextResponse.json({ error: 'Payment is captured, but subscription activation failed. Contact support with payment ID ' + razorpay_payment_id }, { status: 502 });
    }
    return NextResponse.json({ success: true, message: `Your restaurant is now subscribed to ${plan.name}.`, subscription: rpcData });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment verification failed.';
    const status = /sign in|session|owner|administrator|organizationId|ownership/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
