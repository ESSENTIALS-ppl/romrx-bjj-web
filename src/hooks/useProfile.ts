import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  belt: string
  portal_role: string
  subscription_status: string
  subscription_tier: string
  platforms: string[]
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
  thoracic_rot: number | null
  rom_total: number | null
  rom_percentile: number | null
  worst_joints: string[] | null
  red_flag_triggered: boolean
  red_flag_reasons: string[] | null
}

export interface TechniqueEligibility {
  id: string
  technique_id: string
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [eligibility, setEligibility] = useState<TechniqueEligibility[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    async function load() {
      setLoading(true)
      const [{ data: prof }, { data: assess }, { data: elig }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId!).maybeSingle(),
        supabase
          .from('assessments')
          .select('*')
          .eq('user_id', userId!)
          .order('assessed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('technique_eligibility')
          .select('id, technique_id, tier, flag, limiting_joints, techniques(code, name, belt, category)')
          .eq('user_id', userId!)
          .order('tier'),
      ])
      setProfile(prof)
      setAssessment(assess)
      setEligibility((elig as unknown as TechniqueEligibility[]) ?? [])
      setLoading(false)
    }

    load()
  }, [userId])

  return { profile, assessment, eligibility, loading }
}
