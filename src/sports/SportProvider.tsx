/**
 * SportProvider - supplies the site's sport config (labels, theme) to the app.
 *
 * This is a BJJ-only deployment. The active sport is ALWAYS SITE_SPORT ('bjj'),
 * hardcoded at the site level. It is NEVER read from the shared, mutable
 * users.active_sport field (co-owned by the Bodybuilding and Base HQ apps), and
 * this provider NEVER writes users.active_sport. That keeps the BJJ app's
 * branding and nav fully independent of whatever active_sport happens to be.
 *
 * Loads:
 *   - The BJJ sport_config row from DB (cached for the session; falls back to
 *     the local default before the fetch resolves to avoid a flash of un-themed UI)
 *
 * Exposes via useSport():
 *   - activeSport: the BJJ SportConfig (theme, labels, feature flags)
 *   - loading:     true until the first fetch completes
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import { SITE_SPORT, getSportFallback, type SportConfig } from './registry'

interface SportContextValue {
  activeSport: SportConfig
  loading: boolean
}

const SportContext = createContext<SportContextValue | undefined>(undefined)

interface SportProviderProps {
  children: ReactNode
}

export function SportProvider({ children }: SportProviderProps) {
  const [config, setConfig] = useState<SportConfig>(() =>
    getSportFallback(SITE_SPORT),
  )
  const [loading, setLoading] = useState(true)

  // Fetch the BJJ sport_config row once per session. We only ever query the
  // SITE_SPORT row, so no bodybuilding config is fetched or considered.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('sport_config')
        .select(
          'slug, display_name, short_name, body_label, game_label, protocol_label, has_techniques, has_schools, has_coach_portal, theme_accent, is_active',
        )
        .eq('slug', SITE_SPORT)
        .eq('is_active', true)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        console.warn('sport_config fetch failed, using defaults:', error.message)
        setLoading(false)
        return
      }
      if (data) {
        setConfig(data as SportConfig)
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const activeSport = config

  // Inject theme accent as a CSS variable + data attribute on <html>
  useEffect(() => {
    const root = document.documentElement
    root.dataset.sport = activeSport.slug
    root.dataset.sportAccent = activeSport.theme_accent
  }, [activeSport.slug, activeSport.theme_accent])

  const value = useMemo<SportContextValue>(
    () => ({ activeSport, loading }),
    [activeSport, loading],
  )

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext)
  if (!ctx) {
    throw new Error('useSport must be used inside <SportProvider>')
  }
  return ctx
}
