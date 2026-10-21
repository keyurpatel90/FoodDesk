/**
 * Supplies the signed-in user's Supabase access token to the billing API calls,
 * so the server can work out WHICH restaurant is paying (never trust an org id
 * sent from the browser).
 *
 * Preferred: register your app's own Supabase client once at startup:
 *
 *   import { setAccessTokenProvider } from '@/lib/billing-auth';
 *   setAccessTokenProvider(async () => {
 *     const { data } = await supabase.auth.getSession();
 *     return data.session?.access_token ?? null;
 *   });
 *
 * Fallback (no provider registered): a plain supabase-js client built from
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY that reads the session
 * supabase-js keeps in localStorage. This does not see cookie-based (@supabase/ssr)
 * sessions, so use the provider if your app uses those.
 */

export type AccessTokenProvider = () => Promise<string | null>;

let provider: AccessTokenProvider | null = null;
let fallbackClient: Promise<{
  auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
}> | null = null;

export function setAccessTokenProvider(fn: AccessTokenProvider | null): void {
  provider = fn;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    if (provider) return await provider();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;

    if (!fallbackClient) {
      fallbackClient = import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(url, anon, {
          auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
        })
      );
    }
    const client = await fallbackClient;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
