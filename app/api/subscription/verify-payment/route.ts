import { NextResponse } from 'next/server';
import { handle, HttpError } from '@/lib/server/http';
import { requireOrg } from '@/lib/server/auth';
import { finalizePayment } from '@/lib/server/billing';
import { verifyCheckoutSignature } from '@/lib/server/razorpay-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Step 3 of paying: Razorpay Checkout succeeded in the browser and hands us
 * { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
 * We verify the signature (mandatory), re-check the payment with Razorpay, then activate the plan in the DB.
 * The tier and amount are NOT taken from the browser; they come from the order we created.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireOrg(req, { admin: true });

    const body = await req.json().catch(() => ({}));
    const orderId = body?.razorpay_order_id;
    const paymentId = body?.razorpay_payment_id;
    const signature = body?.razorpay_signature;
    if (![orderId, paymentId, signature].every((v) => typeof v === 'string' && v.length > 0)) {
      throw new HttpError(400, 'Missing payment details.', 'MISSING_FIELDS');
    }

    if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
      throw new HttpError(400, 'Payment signature could not be verified.', 'INVALID_SIGNATURE');
    }

    const result = await finalizePayment({
      orderId,
      paymentId,
      signature,
      expectedOrganizationId: ctx.organizationId,
    });

    return NextResponse.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      subscription: result.subscription,
      invoice: result.invoice,
    });
  });
}
