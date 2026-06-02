/**
 * Sport Registry — local mirror of the DB sport_config table.
 *
 * These defaults are used as a fallback before the DB row arrives
 * (avoids a flash of un-themed UI). The live values come from
 * SportProvider, which fetches from `sport_config` on mount.
 *
 * Keep this file in sync with the DB seeds in
 * supabase/migrations/20260603000002_sport_aware_schema.sql.
 */

export interface SportConfig {
  /** PK — short slug, e.g. 'bjj', 'bodybuilding', 'general' */
  sport: string
  /** Human label, e.g. "Brazilian Jiu-Jitsu" */
  display_name: string
  /** Tailwind palette name driving UI accent (teal | crimson | slate | ...) */
  theme_color: string
  /** Optional emoji/icon shown in switcher + headers */
  icon: string | null
  /** Which dashboard sections are available for this sport */
  features: {
    my_body?: boolean
    my_game?: boolean
    my_protocol?: boolean
    coach?: boolean
    [k: string]: boolean | undefined
  }
  /** Whether the sport is visible to end-users (admin can disable WIP sports) */
  enabled: boolean
}

/**
 * Default sport configs — used until the DB fetch completes.
 * MUST match the rows seeded into `sport_config` in PR #2.
 */
export const DEFAULT_SPORTS: Record<string, SportConfig> = {
  bjj: {
    sport: 'bjj',
    display_name: 'Brazilian Jiu-Jitsu',
    theme_color: 'teal',
    icon: '🥋',
    features: { my_body: true, my_game: true, my_protocol: true, coach: true },
    enabled: true,
  },
  bodybuilding: {
    sport: 'bodybuilding',
    display_name: 'Bodybuilding',
    theme_color: 'crimson',
    icon: '🏋️',
    features: { my_body: true, my_game: false, my_protocol: true, coach: false },
    enabled: true,
  },
  general: {
    sport: 'general',
    display_name: 'General Mobility',
    theme_color: 'slate',
    icon: '🧘',
    features: { my_body: true, my_game: false, my_protocol: true, coach: false },
    enabled: true,
  },
}

export const DEFAULT_SPORT_KEY = 'bjj'

export function getSportFallback(sport: string | undefined | null): SportConfig {
  if (sport && DEFAULT_SPORTS[sport]) return DEFAULT_SPORTS[sport]
  return DEFAULT_SPORTS[DEFAULT_SPORT_KEY]
}
