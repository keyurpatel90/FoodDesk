import { NextResponse } from 'next/server';
import { authorizeOrganization, isPlanId, PLAN_PRICES, razorpayRequest } from '@/lib/subscription-server';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isPlanId(body?.tierId)) return NextResponse.json({ error: 'Invalid subscription plan.' }, { status: 400 });
    const auth = await authorizeOrganization(req, body?.organizationId);
    const plan = PLAN_PRICES[body.tierId];
    const order = await razorpayRequest('orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: plan.amountPaise, currency: 'INR', receipt: `fd_${Date.now()}_${auth.organizationId.slice(0, 8)}`,
        notes: { organizationId: auth.organizationId, tierId: body.tierId, userId: auth.userId },
      }),
    });
    if (!order?.id || Number(order.amount) !== plan.amountPaise || order.currency !== 'INR') {
      return NextResponse.json({ error: 'Razorpay returned an invalid order.' }, { status: 502 });
    }
    return NextResponse.json({
      success: true, orderId: order.id, amount: order.amount, currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, tierName: plan.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create payment order.';
    const status = /sign in|session|owner|administrator|organizationId|ownership/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
