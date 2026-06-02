/**
 * SportProvider — React context that tracks the user's active sport.
 *
 * Loads:
 *   - All sport_config rows from DB (cached for the session)
 *   - User's `active_sport` + `sports_enabled` from useProfile
 *
 * Exposes via useSport():
 *   - activeSport:    current SportConfig (theme, features, label)
 *   - availableSports: SportConfigs the user has access to
 *   - allSports:      every config in the DB (admin tooling)
 *   - setActiveSport(slug):  updates DB + local state
 *   - loading:        true until first fetch completes
 *
 * No UI behavior changes in PR #3 — this just wires the context.
 * PR #4 will consume `activeSport.features` to drive nav.
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
import {
  DEFAULT_SPORTS,
  DEFAULT_SPORT_KEY,
  getSportFallback,
  type SportConfig,
} from './registry'

interface SportContextValue {
  activeSport: SportConfig
  availableSports: SportConfig[]
  allSports: SportConfig[]
  setActiveSport: (sport: string) => Promise<void>
  loading: boolean
}

const SportContext = createContext<SportContextValue | undefined>(undefined)

interface SportProviderProps {
  /** Current user id — pass from useAuth */
  userId: string | undefined
  /** User's active_sport from useProfile (single source of truth) */
  activeSportSlug: string | undefined
  /** User's sports_enabled from useProfile */
  sportsEnabled: string[] | undefined
  children: ReactNode
}

export function SportProvider({
  userId,
  activeSportSlug,
  sportsEnabled,
  children,
}: SportProviderProps) {
  const [allSports, setAllSports] = useState<SportConfig[]>(
    Object.values(DEFAULT_SPORTS),
  )
  const [loading, setLoading] = useState(true)
  const [optimisticSlug, setOptimisticSlug] = useState<string | null>(null)

  // Fetch sport_config table once per session
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('sport_config')
        .select('sport, display_name, theme_color, icon, features, enabled')
      if (cancelled) return
      if (error) {
        console.warn('sport_config fetch failed, using defaults:', error.message)
        setLoading(false)
        return
      }
      if (data && data.length > 0) {
        setAllSports(data as SportConfig[])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveSlug = optimisticSlug ?? activeSportSlug ?? DEFAULT_SPORT_KEY

  const activeSport = useMemo<SportConfig>(() => {
    const found = allSports.find((s) => s.sport === effectiveSlug)
    return found ?? getSportFallback(effectiveSlug)
  }, [allSports, effectiveSlug])

  const availableSports = useMemo<SportConfig[]>(() => {
    const slugs = sportsEnabled && sportsEnabled.length > 0
      ? sportsEnabled
      : [DEFAULT_SPORT_KEY]
    return slugs
      .map((slug) => allSports.find((s) => s.sport === slug) ?? getSportFallback(slug))
      .filter((s) => s.enabled)
  }, [allSports, sportsEnabled])

  async function setActiveSport(sport: string) {
    if (!userId) return
    setOptimisticSlug(sport)
    const { error } = await supabase
      .from('users')
      .update({ active_sport: sport })
      .eq('id', userId)
    if (error) {
      console.error('Failed to update active_sport:', error.message)
      setOptimisticSlug(null)
    }
  }

  const value: SportContextValue = {
    activeSport,
    availableSports,
    allSports,
    setActiveSport,
    loading,
  }

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext)
  if (!ctx) {
    throw new Error('useSport must be used inside <SportProvider>')
  }
  return ctx
}
