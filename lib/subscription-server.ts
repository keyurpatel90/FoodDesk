import crypto from 'crypto';

export const PLAN_PRICES = {
  starter: { name: 'Starter', amountPaise: 30000, amountRupees: 300 },
  professional: { name: 'Professional', amountPaise: 79900, amountRupees: 799 },
  enterprise: { name: 'Enterprise', amountPaise: 119900, amountRupees: 1199 },
} as const;
export type PlanId = keyof typeof PLAN_PRICES;
export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLAN_PRICES, value);
}
export function timingSafeEqualHex(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
export async function authorizeOrganization(req: Request, organizationId: unknown) {
  if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(organizationId)) {
    throw new Error('A valid organizationId is required.');
  }
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Sign in is required to manage a subscription.');
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!userRes.ok) throw new Error('Your session is invalid or expired. Please sign in again.');
  const user = await userRes.json() as { id?: string };
  if (!user.id) throw new Error('Unable to identify the signed-in user.');
  const membershipUrl = new URL(`${supabaseUrl}/rest/v1/organization_members`);
  membershipUrl.searchParams.set('organization_id', `eq.${organizationId}`);
  membershipUrl.searchParams.set('user_id', `eq.${user.id}`);
  membershipUrl.searchParams.set('role', 'in.(owner,admin)');
  membershipUrl.searchParams.set('select', 'organization_id,role');
  membershipUrl.searchParams.set('limit', '1');
  const membershipRes = await fetch(membershipUrl, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: 'no-store',
  });
  if (!membershipRes.ok) throw new Error('Could not verify restaurant ownership. Check the subscription migration and organization membership.');
  const memberships = await membershipRes.json() as Array<{ organization_id: string; role: string }>;
  if (!memberships.length) throw new Error('Only this restaurant’s owner or administrator can manage its subscription.');
  return { organizationId, userId: user.id, supabaseUrl, serviceKey };
}
export async function razorpayRequest(path: string, init: RequestInit = {}) {
  const keyId = requiredEnv('RAZORPAY_KEY_ID');
  const keySecret = requiredEnv('RAZORPAY_KEY_SECRET');
  const response = await fetch(`https://api.razorpay.com/v1/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json', ...(init.headers || {}),
    }, cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.description || 'Razorpay request failed.');
  return data;
}
