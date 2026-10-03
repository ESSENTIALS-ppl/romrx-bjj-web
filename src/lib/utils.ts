import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Canonical Base-first explainer page. All public new-athlete acquisition and
// assessment/signup entry points route here so onboarding always starts on Base.
export const BASE_EXPLAINER_URL = 'https://romrx.io/bjj'


// Owned-site UTM tags on clickable links to the Base page (Growth, 2026-09-29).
// utm_term is the link placement. Redirects that forward an incoming query
// (/signup edge rule, the Base URL builder) stay untagged so a visitor's
// original campaign params are what reach romrx.io.
const OWNED_SITE_UTM =
  'utm_campaign=ROMRx_Base_Beta_2026&utm_source=owned&utm_medium=site&utm_content=20260929_owned_romrxbjj_site_utm'

export function ownedBaseUrl(placement: string): string {
  return `${BASE_EXPLAINER_URL}?${OWNED_SITE_UTM}&utm_term=${encodeURIComponent(placement)}`
}

// Builds the Base explainer URL, carrying over an incoming query string so
// campaign parameters survive the redirect. The target is an external origin,
// so there is no risk of a same-app redirect loop.
export function baseExplainerUrl(search = ''): string {
  const query = search.startsWith('?') ? search.slice(1) : search
  return query ? `${BASE_EXPLAINER_URL}?${query}` : BASE_EXPLAINER_URL
}

export function tierColor(tier: string | null): string {
  switch (tier) {
    case 'GREEN':  return 'tier-green'
    case 'YELLOW': return 'tier-yellow'
    case 'RED':    return 'tier-red'
    case 'GREY':   return 'bg-gray-100 text-gray-600 font-semibold'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// DELAY_TECHNIQUE is an internal flag — always surfaces as RED in the UI
export function tierLabel(tier: string | null, flag: string | null): string {
  if (flag === 'DELAY_TECHNIQUE') return 'RED'
  if (tier === 'GREY') return 'NOT RATED' // no ROM rule, or a required joint is not measured: never shown as GREEN
  return tier ?? '—'
}

export function formatJoint(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function beltColor(belt: string): string {
  const map: Record<string, string> = {
    white: 'bg-gray-100 text-gray-700',
    blue:  'bg-blue-100 text-blue-800',
    purple:'bg-purple-100 text-purple-800',
    brown: 'bg-amber-900 text-white',
    black: 'bg-gray-900 text-white',
  }
  return map[belt] ?? 'bg-gray-100 text-gray-700'
}
