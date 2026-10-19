import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';

/**
 * Saves outlet settings. Updates the outlet's row, or creates it when the outlet has none yet
 * (outlets made from the Organizations/Outlets screens used to have no settings row, which broke setup).
 */
export async function saveSettings(organizationId: string, outletId: string, patch: Partial<AppSettings>): Promise<AppSettings> {
  const { id: _ignored, ...rest } = patch;
  const body = { ...rest, organization_id: organizationId, outlet_id: outletId };
  const existing = await supabase.from('app_settings').select('id').eq('organization_id', organizationId).eq('outlet_id', outletId).maybeSingle();
  if (existing.error) throw existing.error;
  const saved = existing.data
    ? await supabase.from('app_settings').update(body).eq('id', existing.data.id).select().single()
    : await supabase.from('app_settings').insert(body).select().single();
  if (saved.error) throw saved.error;
  return saved.data as AppSettings;
}
