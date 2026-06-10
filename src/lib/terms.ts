import { supabase } from './supabase'

// Bump this string whenever the /legal Terms of Service are materially updated.
// It is stored on each consent row so we have a timestamped record of exactly
// which version of the ROMRx LLC agreement a user accepted.
export const TERMS_VERSION = '2026-06-04'

// The medical waiver / assumption-of-risk language lives in the same /legal
// document (Sections 5 & 6), so it shares the Terms version.
export const MEDICAL_WAIVER_VERSION = '2026-06-04'

/**
 * Records a user's acceptance of the ROMRx LLC Terms of Service, Privacy Policy,
 * Refund Policy, and medical/assumption-of-risk waiver.
 *
 * Calls the `submit-consent` edge function (which captures the caller IP from
 * the x-forwarded-for header server-side — the browser cannot read its own
 * public IP). Falls back to a direct insert if the edge function call fails so
 * we never lose the consent record entirely, but the IP will be null on the
 * fallback path. See incident 2026-06-10 (Garth Price: ip_address recorded
 * as null because recordConsent was doing a direct insert).
 */
export async function recordConsent(params: {
  userId: string
  signedName: string
}): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('no session')

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-consent`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        termsVersion: TERMS_VERSION,
        medicalWaiverVersion: MEDICAL_WAIVER_VERSION,
        signedName: params.signedName,
      }),
    })

    if (res.ok) return

    // Edge function rejected the call — log it and fall through to direct insert
    // so we still capture the consent (just without the IP).
    const errBody = await res.text().catch(() => '')
    console.error('submit-consent edge function failed:', res.status, errBody)
    throw new Error(`edge function ${res.status}`)
  } catch (e) {
    console.error('recordConsent edge path failed, falling back to direct insert:', e)
    try {
      const { error } = await supabase.from('consents').insert({
        user_id: params.userId,
        terms_version: TERMS_VERSION,
        medical_waiver_version: MEDICAL_WAIVER_VERSION,
        signed_name: params.signedName,
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
        // ip_address intentionally null here — see edge function path above.
      })
      if (error) console.error('recordConsent fallback insert failed:', error.message)
    } catch (e2) {
      console.error('recordConsent fallback threw:', e2)
    }
  }
}
