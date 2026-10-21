import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '@/lib/server/http';

let client: SupabaseClient | null = null;

/**
 * Service-role client. It bypasses RLS, so it must ONLY be used in server code (route handlers)
 * and never imported from a component.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[supabase] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    throw new HttpError(503, 'Billing database is not configured. Please contact support.', 'SUPABASE_NOT_CONFIGURED');
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
