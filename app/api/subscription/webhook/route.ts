import { NextResponse } from 'next/server';
import { finalizePayment, NotOurOrderError } from '@/lib/server/billing';
import { verifyWebhookSignature } from '@/lib/server/razorpay-server';
import { HttpError } from '@/lib/server/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Razorpay -> FoodDesk safety net. If the owner pays but closes the tab (or loses network) before
 * /verify-payment runs, this still activates the plan. Same idempotent code path as /verify-payment.
 *
 * Dashboard setup: Settings -> Webhooks -> URL https://<your-domain>/api/subscription/webhook,
 * secret = RAZORPAY_WEBHOOK_SECRET, events: order.paid, payment.captured, payment.failed.
 */
export async function POST(req: Request) {
  const rawBody = await req.text(); // must be the exact raw body for the signature check
  if (!verifyWebhookSignature(rawBody, req.headers.get('x-razorpay-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let event: {
    event?: string;
    payload?: {
      order?: { entity?: { id?: string } };
      payment?: { entity?: { id?: string; order_id?: string; error_description?: string } };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    switch (event.event) {
      case 'order.paid':
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        const orderId = event.payload?.order?.entity?.id ?? payment?.order_id;
        if (!orderId || !payment?.id) break;
        const result = await finalizePayment({ orderId, paymentId: payment.id });
        console.log(
          `[razorpay webhook] ${event.event}: payment ${payment.id} ${result.alreadyProcessed ? 'already processed' : 'activated'} for org ${result.organizationId}`
        );
        break;
      }
      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        console.warn(`[razorpay webhook] payment failed: ${payment?.id} - ${payment?.error_description}`);
        break;
      }
      default:
        // Other events (refunds, etc.) are acknowledged but not acted on.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Orders created by some other app on the same Razorpay account: acknowledge so Razorpay stops retrying.
    if (err instanceof NotOurOrderError) return NextResponse.json({ received: true, ignored: true });
    console.error('[razorpay webhook] processing failed:', err);
    // Non-2xx makes Razorpay retry, which is what we want for transient failures.
    const status = err instanceof HttpError && err.status < 500 && err.status !== 402 ? 200 : 500;
    return NextResponse.json({ error: 'Webhook processing failed' }, { status });
  }
}
