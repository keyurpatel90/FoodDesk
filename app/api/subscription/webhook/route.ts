import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PLAN_PRICES, isPlanId, requiredEnv, razorpayRequest, timingSafeEqualHex } from '@/lib/subscription-server';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const webhookSecret = requiredEnv('RAZORPAY_WEBHOOK_SECRET');
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!timingSafeEqualHex(expected, signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
    }
    const event = JSON.parse(rawBody);
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id || payment.status !== 'captured') {
        return NextResponse.json({ received: true, ignored: true });
      }
      const order = await razorpayRequest(`orders/${encodeURIComponent(payment.order_id)}`);
      const organizationId = order.notes?.organizationId;
      const tierId = order.notes?.tierId;
      if (!organizationId || !isPlanId(tierId)) {
        console.error('Captured payment missing FoodDesk order metadata', payment.id);
        return NextResponse.json({ received: true, ignored: true });
      }
      const plan = PLAN_PRICES[tierId];
      if (Number(payment.amount) !== plan.amountPaise || Number(order.amount) !== plan.amountPaise || payment.currency !== 'INR') {
        return NextResponse.json({ error: 'Captured payment amount does not match plan.' }, { status: 400 });
      }
      const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
      const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
      const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/activate_organization_subscription`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_org_id: organizationId, p_tier: tierId, p_amount: plan.amountRupees,
          p_razorpay_order_id: payment.order_id, p_razorpay_payment_id: payment.id,
          p_razorpay_signature: null, p_payment_method: payment.method || 'Razorpay Checkout',
          p_receipt_number: `FD-${new Date().getUTCFullYear()}-${payment.id.slice(-8).toUpperCase()}`,
        }),
        cache: 'no-store',
      });
      if (!rpc.ok) {
        console.error('Failed to activate subscription from Razorpay webhook', await rpc.text());
        return NextResponse.json({ error: 'Could not apply captured payment.' }, { status: 502 });
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    console.error('Razorpay webhook error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
