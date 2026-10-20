import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature if webhook secret is configured
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }
    }

    const event = JSON.parse(rawBody);
    console.log('[Razorpay Webhook Event]:', event.event);

    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        console.log(`Payment captured: ${payment.id} for amount ${payment.amount / 100} INR`);
        // Update payments table and set organization subscription to active in database
        break;
      }
      case 'subscription.charged': {
        const subscription = event.payload.subscription.entity;
        console.log(`Subscription renewal charged: ${subscription.id}`);
        // Extend subscription end date by 30 days
        break;
      }
      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        console.warn(`Payment failed: ${payment.id}, reason: ${payment.error_description}`);
        // Notify organization admin or set status to past_due
        break;
      }
      case 'subscription.cancelled': {
        console.warn('Subscription was cancelled by user or gateway');
        // Set organization subscription_status = 'canceled'
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
