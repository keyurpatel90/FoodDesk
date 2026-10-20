import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      organizationId,
      tierId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      payment_method,
    } = body;

    if (!organizationId || !tierId || !razorpay_order_id || !razorpay_payment_id) {
      return NextResponse.json({ error: 'Missing required payment verification fields' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // 1. Signature Verification
    if (keySecret && razorpay_signature) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return NextResponse.json({ error: 'Invalid payment signature. Verification failed.' }, { status: 400 });
      }
    }

    // 2. Compute Tier Limits & Features to save to Database
    const tierLimits = {
      starter: { maxTables: 10, maxStaff: 5, price: 300 },
      professional: { maxTables: 30, maxStaff: 15, price: 799 },
      enterprise: { maxTables: 9999, maxStaff: 9999, price: 1199 },
    }[tierId as 'starter' | 'professional' | 'enterprise'] || { maxTables: 10, maxStaff: 5, price: 300 };

    const featuresEnabled = {
      kds_audio_alerts: tierId === 'professional' || tierId === 'enterprise',
      whatsapp_invoices: tierId === 'professional' || tierId === 'enterprise',
      loyalty_program: tierId === 'professional' || tierId === 'enterprise',
      advanced_analytics: tierId === 'professional' || tierId === 'enterprise',
      multi_outlet: tierId === 'enterprise',
      white_label: tierId === 'enterprise',
      multi_station_kds: tierId === 'enterprise',
    };

    const startDate = new Date();
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const receiptNumber = `RCP-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Database Execution
    // If Supabase client or DB is configured, execute SQL query or stored procedure:
    // e.g., await supabase.rpc('activate_organization_subscription', { ... })
    // Or direct table updates:
    // await supabase.from('organizations').update({ ... }).eq('id', organizationId);
    // await supabase.from('payments').insert({ ... });

    const updatedSubscription = {
      organizationId,
      tier: tierId,
      status: 'active',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      maxTables: tierLimits.maxTables,
      maxStaff: tierLimits.maxStaff,
      featuresEnabled,
      payment: {
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount: tierLimits.price,
        receiptNumber,
        status: 'captured',
        method: payment_method || 'Razorpay UPI/Card',
        date: startDate.toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      },
    };

    return NextResponse.json({
      success: true,
      message: `Organization successfully upgraded to ${tierId.toUpperCase()} tier!`,
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json({ error: 'Server error during payment verification' }, { status: 500 });
  }
}
