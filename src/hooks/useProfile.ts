import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { latestPerTechnique } from '../lib/eligibility'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  belt: string
  portal_role: string
  subscription_status: string
  subscription_tier: string
  platforms: string[]
  /** Slug of the sport this user is currently focused on (FK -> sport_config.sport). Added in PR #2. */
  active_sport: string
  /** Slugs of every sport this user can access. Mirrors platforms via DB trigger. Added in PR #2. */
  sports_enabled: string[]
  /** 'active' once Base is paid. Used with sport_entitlements for the sport-site gate (F-02). */
  base_status?: string | null
  grandfathered_at?: string | null
}

export interface SportEntitlement {
  sport: string
  status: string
  expires_at: string | null
}

export interface Assessment {
  id: string
  user_id: string
  assessed_at: string
  hip_er_l: number | null
  hip_er_r: number | null
  hip_ir_l: number | null
  hip_ir_r: number | null
  hip_abd_l: number | null
  hip_abd_r: number | null
  hip_flex_l: number | null
  hip_flex_r: number | null
  shoulder_er_l: number | null
  shoulder_er_r: number | null
  shoulder_flex_l: number | null
  shoulder_flex_r: number | null
  ankle_df_l: number | null
  ankle_df_r: number | null
  lumbar_flex: number | null
  lumbar_ext: number | null
  cervical_rot_l: number | null
  cervical_rot_r: number | null
  cervical_lat_l: number | null
  cervical_lat_r: number | null
  cervical_flex: number | null
  cervical_ext: number | null
  thoracic_rot: number | null
  thoracic_rot_l: number | null
  thoracic_rot_r: number | null
  rom_total: number | null
  rom_percentile: number | null
  worst_joints: string[] | null
  red_flag_triggered: boolean
  red_flag_reasons: string[] | null
}

export interface TechniqueEligibility {
  id: string
  technique_id: string
  technique_code: string
  tier: string
  flag: string | null
  limiting_joints: string[] | null
  techniques: {
    code: string
    name: string
    belt: string
    category: string
  }
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [eligibility, setEligibility] = useState<TechniqueEligibility[]>([])
  const [entitlements, setEntitlements] = useState<SportEntitlement[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!userId) return

    async function load() {
      setLoading(true)

      // Use SECURITY DEFINER function — bypasses RLS entirely,
      // filters by auth.uid() server-side so it's still secure.
      const { data, error } = await supabase.rpc('get_my_profile')

      if (error) {
        console.error('get_my_profile error:', error.message)
        setLoading(false)
        return
      }

      const result = data as {
        profile: Profile | null
        assessment: Assessment | null
        assessments: Assessment[]
        eligibility: TechniqueEligibility[]
        sport_entitlements?: SportEntitlement[]
      }

      // One tier per technique, newest first (lib/eligibility). get_my_profile returns
      // rows for every assessment, so a retest would otherwise list each technique twice.
      // Falls back to the RPC rows if this read fails.
      let eligibilityRows: TechniqueEligibility[] = result.eligibility ?? []
      if (result.assessment) {
        const { data: teRows, error: teError } = await supabase
          .from('technique_eligibility')
          .select('id, technique_id, technique_code, tier, flag, limiting_joints, computed_at, techniques(code, name, belt, category)')
          .eq('user_id', userId)
          .eq('sport', 'bjj')
        if (!teError && teRows && teRows.length > 0) {
          eligibilityRows = latestPerTechnique(teRows as unknown as (TechniqueEligibility & { computed_at: string | null })[])
        }
      }

      setProfile(result.profile)
      setAssessment(result.assessment)
      setAssessments(result.assessments ?? [])
      setEligibility(eligibilityRows)
      setEntitlements(result.sport_entitlements ?? [])
      setLoading(false)
    }

    load()
  }, [userId])

  return { profile, assessment, assessments, eligibility, entitlements, loading }
}
