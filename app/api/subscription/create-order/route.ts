import { NextResponse } from 'next/server';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription-data';
import type { CheckoutOrder } from '@/lib/subscription-types';
import { handle, HttpError } from '@/lib/server/http';
import { requireOrg } from '@/lib/server/auth';
import { loadOrganization, toPricingRow } from '@/lib/server/billing';
import { isTierId, quoteChange } from '@/lib/server/pricing';
import { createRazorpayOrder, getRazorpayConfig } from '@/lib/server/razorpay-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Step 1 of paying. The browser only says WHICH plan it wants; the server decides the price
 * (new / renew / upgrade-with-credit), creates a real Razorpay order, and tags it with the
 * organization + tier so the payment can be matched safely later.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = await requireOrg(req, { admin: true });

    const body = await req.json().catch(() => ({}));
    const tierId = body?.tierId;
    if (!isTierId(tierId)) throw new HttpError(400, 'Invalid subscription plan selected.', 'INVALID_TIER');

    const org = await loadOrganization(ctx.organizationId);
    const quote = quoteChange(toPricingRow(org), tierId);
    if (quote.kind === 'blocked_downgrade') {
      throw new HttpError(409, quote.blockedReason ?? 'This plan change is not available yet.', 'DOWNGRADE_BLOCKED');
    }

    const { keyId } = getRazorpayConfig();
    const tier = SUBSCRIPTION_TIERS[tierId];
    const order = await createRazorpayOrder({
      amountPaise: quote.amountPaise,
      // Razorpay receipts are limited to 40 characters.
      receipt: `fd_${ctx.organizationId.replace(/-/g, '').slice(0, 8)}_${Date.now().toString(36)}`,
      notes: {
        organization_id: ctx.organizationId,
        tier_id: tierId,
        kind: quote.kind,
        credit_paise: String(quote.creditPaise),
        product: 'fooddesk_subscription',
      },
    });

    const payload: CheckoutOrder = {
      orderId: order.id,
      amountPaise: order.amount,
      currency: 'INR',
      keyId,
      tierId,
      tierName: tier.name,
      kind: quote.kind,
      listPricePaise: quote.listPricePaise,
      creditPaise: quote.creditPaise,
      prefill: { name: ctx.name, email: ctx.email },
    };
    return NextResponse.json({ success: true, order: payload });
  });
}
