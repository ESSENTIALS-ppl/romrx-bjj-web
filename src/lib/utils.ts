import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Canonical Base-first explainer page. All public new-athlete acquisition and
// assessment/signup entry points route here so onboarding always starts on Base.
export const BASE_EXPLAINER_URL = 'https://romrx.io/bjj'

// Wizard retirement (DRAFT, needs Jim's go): the standalone ROM wizard on this
// site is retired. First assessments and retests happen in Base (romrx.io/app),
// where the assessment saves to the same account. ROM reads on this site still
// come from the shared assessments table. NOTE: sessions do not carry from this
// origin to romrx.io (Base keeps its own login on that origin; the only SSO
// hand-off is Base -> sport site), so a signed-out Base visitor logs in there.
export const BASE_RETEST_URL = 'https://romrx.io/app/onboarding/assessment'

export function goToBaseAssessment(): void {
  window.location.assign(BASE_RETEST_URL)
}


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
    default: return 'bg-gray-100 text-gray-600'
  }
}

// DELAY_TECHNIQUE is an internal flag — always surfaces as RED in the UI
export function tierLabel(tier: string | null, flag: string | null): string {
  if (flag === 'DELAY_TECHNIQUE') return 'RED'
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
