export function getFoodDeskOrganizationId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('fooddesk_organization_id') || '';
}
export function getSupabaseAccessToken(): string {
  if (typeof window === 'undefined') return '';
  // Supabase JS stores sessions under sb-<project-ref>-auth-token by default.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (value?.access_token) return value.access_token;
      if (value?.currentSession?.access_token) return value.currentSession.access_token;
    } catch { /* ignore unrelated storage */ }
  }
  return '';
}
