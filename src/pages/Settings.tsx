import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { Save, Loader2 } from 'lucide-react'
import { beltColor, cn } from '../lib/utils'

const BELTS = ['white', 'blue', 'purple', 'brown', 'black']
const SIDES = ['right', 'left']

export function Settings() {
  const { user } = useAuth()
  const { profile, loading } = useProfile(user?.id)
  const [belt, setBelt] = useState('')
  const [dominantSide, setDominantSide] = useState('right')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setBelt(profile.belt)
    }
  }, [profile])

  useEffect(() => {
    async function loadAthlete() {
      if (!user) return
      const { data } = await supabase
        .from('athletes')
        .select('dominant_side')
        .eq('user_id', user.id)
        .single()
      if (data) setDominantSide(data.dominant_side)
    }
    loadAthlete()
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await Promise.all([
      supabase.from('users').update({ belt }).eq('id', user.id),
      supabase.from('athletes').update({ belt, dominant_side: dominantSide }).eq('user_id', user.id),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-display font-bold text-2xl text-charcoal">Settings</h1>

      {/* Profile card */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-charcoal">Profile</h2>

        <div>
          <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-1">Email</p>
          <p className="text-sm text-charcoal">{profile?.email ?? user?.email}</p>
        </div>

        <div>
          <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">Belt</p>
          <div className="flex gap-2 flex-wrap">
            {BELTS.map(b => (
              <button
                key={b}
                onClick={() => setBelt(b)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all',
                  belt === b
                    ? beltColor(b) + ' ring-2 ring-offset-1 ring-teal'
                    : beltColor(b) + ' opacity-50 hover:opacity-100'
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">Dominant side</p>
          <div className="flex gap-2">
            {SIDES.map(s => (
              <button
                key={s}
                onClick={() => setDominantSide(s)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                  dominantSide === s
                    ? 'bg-teal text-white'
                    : 'bg-surface text-charcoal-light hover:bg-teal-light'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subscription card */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-charcoal">Subscription</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-charcoal-light">Plan</p>
          <span className="text-xs bg-teal-light text-teal font-semibold px-3 py-1 rounded-full capitalize">
            {profile?.subscription_tier ?? 'free'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-charcoal-light">Status</p>
          <span className={cn(
            'text-xs font-semibold px-3 py-1 rounded-full capitalize',
            profile?.subscription_status === 'active'
              ? 'bg-green-tier-bg text-green-tier'
              : 'bg-red-tier-bg text-red-tier'
          )}>
            {profile?.subscription_status ?? 'unknown'}
          </span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary flex items-center gap-2"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save changes'}
      </button>
    </div>
  )
}
