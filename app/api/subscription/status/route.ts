import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId') || 'default-org-id';

    // In a live Supabase / PostgreSQL setup, fetch from:
    // const { data: org } = await supabase.from('organizations').select('*').eq('id', orgId).single();

    return NextResponse.json({
      success: true,
      organizationId: orgId,
      tier: 'professional',
      status: 'active',
      maxTables: 30,
      maxStaff: 15,
      featuresEnabled: {
        kds_audio_alerts: true,
        whatsapp_invoices: true,
        loyalty_program: true,
        advanced_analytics: true,
        multi_outlet: false,
        white_label: false,
        multi_station_kds: false,
      },
      expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return NextResponse.json({ error: 'Failed to fetch subscription status' }, { status: 500 });
  }
}
