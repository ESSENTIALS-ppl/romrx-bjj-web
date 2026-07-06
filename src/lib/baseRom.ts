import { supabase } from './supabase'
import type { Assessment } from '../hooks/useProfile'

/**
 * Canonical read path for a user's current Base ROM assessment.
 * Calls the get_base_rom RPC (SECURITY DEFINER, filters by auth.uid()).
 * Base ROM = the user's most recent assessment (any sport tag). The returned
 * row's user_id is the one canonical Base ID that +sport / coach / gym read.
 * Omit userId for the authenticated caller's own Base ROM.
 * Returns null when the user has no assessment yet.
 */
export async function getBaseRom(userId?: string): Promise<Assessment | null> {
  const { data, error } = await supabase.rpc('get_base_rom', {
    p_user_id: userId ?? null,
  })
  if (error) throw error
  const rows = (data ?? []) as Assessment[]
  return rows[0] ?? null
}
