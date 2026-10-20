import { NextResponse } from 'next/server';
import { authorizeOrganization } from '@/lib/subscription-server';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('orgId');
    const auth = await authorizeOrganization(req, orgId);
    const query = new URL(`${auth.supabaseUrl}/rest/v1/organizations`);
    query.searchParams.set('id', `eq.${auth.organizationId}`);
    query.searchParams.set('select', 'id,name,subscription_tier,subscription_status,subscription_start_date,subscription_end_date,trial_ends_at,max_tables_limit,max_staff_limit,features_enabled,auto_renew');
    query.searchParams.set('limit', '1');
    const response = await fetch(query, {
      headers: { apikey: auth.serviceKey, Authorization: `Bearer ${auth.serviceKey}` }, cache: 'no-store',
    });
    const rows = await response.json();
    if (!response.ok) return NextResponse.json({ error: 'Could not read subscription status.' }, { status: 502 });
    const org = rows?.[0];
    if (!org) return NextResponse.json({ error: 'Restaurant organization not found.' }, { status: 404 });
    const end = org.subscription_status === 'trial' ? org.trial_ends_at : org.subscription_end_date;
    const expired = !end || new Date(end).getTime() <= Date.now();
    const status = expired && ['active', 'trial'].includes(org.subscription_status) ? 'inactive' : org.subscription_status;
    return NextResponse.json({
      success: true, organizationId: org.id, tier: org.subscription_tier, status,
      planName: org.subscription_tier, startDate: org.subscription_start_date,
      expiryDate: end, maxTables: org.max_tables_limit, maxStaff: org.max_staff_limit,
      featuresEnabled: org.features_enabled || {}, autoRenew: !!org.auto_renew,
      isTrial: status === 'trial',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscription status.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
