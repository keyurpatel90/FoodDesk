import { HttpError } from '@/lib/server/http';
import { getSupabaseAdmin } from '@/lib/server/supabase-admin';

export interface OrgContext {
  userId: string | null;
  organizationId: string;
  role: string | null;
  isAdmin: boolean;
  email?: string;
  name?: string;
}

/** Roles that may buy / renew / upgrade a plan. Override with BILLING_ADMIN_ROLES="owner,admin". */
const ADMIN_ROLES = (process.env.BILLING_ADMIN_ROLES || 'admin,owner,org_admin,super_admin')
  .split(',')
  .map((r) => r.trim().toLowerCase())
  .filter(Boolean);

/**
 * ============================  ADAPT THIS TO YOUR SCHEMA  ============================
 * Works out which restaurant (organization) a signed-in user belongs to, and their role.
 *
 * Default lookup order:
 *   1. auth.users.app_metadata.organization_id (+ app_metadata.role)  -- set only by the server, safe to trust
 *   2. public.profiles (id = auth user id) with columns: organization_id, role
 *
 * NEVER use user_metadata here: signed-in users can edit it themselves.
 * If your app keeps membership elsewhere (e.g. organization_members / staff), change the query below.
 * =====================================================================================
 */
async function resolveMembership(
  userId: string,
  appMetadata: Record<string, unknown> | undefined
): Promise<{ organizationId: string | null; role: string | null }> {
  const metaOrg = (appMetadata?.organization_id ?? appMetadata?.org_id) as string | undefined;
  const metaRole = appMetadata?.role as string | undefined;
  if (metaOrg) return { organizationId: metaOrg, role: metaRole ?? null };

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] could not read profiles for membership lookup:', error.message);
    return { organizationId: null, role: null };
  }
  return { organizationId: data?.organization_id ?? null, role: (data?.role as string | undefined) ?? null };
}

/**
 * Identifies the caller from their Supabase access token and returns the restaurant they belong to.
 * Pass { admin: true } for actions that spend money (create-order, verify-payment).
 */
export async function requireOrg(req: Request, opts: { admin?: boolean } = {}): Promise<OrgContext> {
  // Local testing shortcut: lets you try the Razorpay flow with TEST keys before auth is wired up.
  // Ignored in production builds, whatever the env var says.
  const devOrg = process.env.BILLING_DEV_ORG_ID;
  if (devOrg && process.env.NODE_ENV !== 'production') {
    return { userId: null, organizationId: devOrg, role: 'admin', isAdmin: true, name: 'Dev User' };
  }

  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please sign in to manage your subscription.', 'UNAUTHENTICATED');

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');
  const user = data.user;

  const { organizationId, role } = await resolveMembership(user.id, user.app_metadata as Record<string, unknown>);
  if (!organizationId) {
    console.error(
      `[auth] user ${user.id} has no organization. If this is unexpected, adjust resolveMembership() in lib/server/auth.ts to match your schema.`
    );
    throw new HttpError(403, 'No restaurant is linked to this account.', 'NO_ORGANIZATION');
  }

  const isAdmin = !!role && ADMIN_ROLES.includes(role.toLowerCase());
  if (opts.admin && !isAdmin) {
    throw new HttpError(403, 'Only the restaurant owner/admin can change the subscription.', 'NOT_ADMIN');
  }

  return {
    userId: user.id,
    organizationId,
    role,
    isAdmin,
    email: user.email ?? undefined,
    name: (user.user_metadata?.full_name as string | undefined) ?? undefined,
  };
}
