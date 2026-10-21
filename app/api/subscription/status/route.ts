import { NextResponse } from 'next/server';
import { handle } from '@/lib/server/http';
import { requireOrg } from '@/lib/server/auth';
import { buildSubscriptionState, listPayments, loadOrganization, toInvoice } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Current subscription for the caller's restaurant, read from the database.
 * Any signed-in member can read the status (staff need it to see the "expired" screen);
 * payment history is only returned to admins.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const ctx = await requireOrg(req);
    const org = await loadOrganization(ctx.organizationId);
    const payments = await listPayments(ctx.organizationId);
    const latestCaptured = payments.find((p) => p.status === 'captured');

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      isAdmin: ctx.isAdmin,
      subscription: buildSubscriptionState(org, latestCaptured),
      invoices: ctx.isAdmin ? payments.map(toInvoice) : [],
      serverTime: new Date().toISOString(),
    });
  });
}
