import { supabase } from './supabase'
import type { Assessment } from '../hooks/useProfile'

/**
 * Canonical read path for an athlete's current Base ROM assessment.
 * Calls the get_base_rom RPC (SECURITY DEFINER, filters by auth.uid()).
 * Omit athleteId for the authenticated caller's own Base ROM.
 * Returns null when the athlete has no Base assessment yet.
 */
export async function getBaseRom(athleteId?: string): Promise<Assessment | null> {
  const { data, error } = await supabase.rpc('get_base_rom', {
    p_athlete_id: athleteId ?? null,
  })
  if (error) throw error
  const rows = (data ?? []) as Assessment[]
  return rows[0] ?? null
}
