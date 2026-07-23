import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'
import { BASE_EXPLAINER_URL } from '../lib/utils'

export function ShareView() {
  const { slug } = useParams<{ slug: string }>()
  const [plan, setPlan] = useState<{ name: string; description: string; techniques: unknown[]; path_mode: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!slug) return
    supabase.from('game_plans').select('name, description, techniques, path_mode').eq('share_slug', slug).eq('is_public', true).single()
      .then(({ data, error: err }) => {
        if (err || !data) { setError(true) } else { setPlan(data as typeof plan) }
        setLoading(false)
      })
  }, [slug])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner /></div>
  if (error || !plan) return (
    <div className="min-h-screen flex items-center justify-center text-charcoal-light">
      <div className="text-center"><p className="font-bold text-lg mb-2">Plan not found</p><p className="text-sm">This link may have expired or been made private.</p><a href="https://romrxbjj.com" className="text-teal text-sm mt-4 inline-block">← ROMRxBJJ</a></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-warm-white py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <a href="https://romrxbjj.com" className="text-teal font-bold text-lg">ROMRxBJJ™</a>
          <span className="text-charcoal-light text-sm">· Shared Game Plan</span>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-teal-light/40 p-6 space-y-4">
          <div>
            <h1 className="text-xl font-bold text-charcoal">{plan.name}</h1>
            {plan.description && <p className="text-sm text-charcoal-light mt-1">{plan.description}</p>}
          </div>
          <div className="space-y-2">
            {(plan.techniques as Array<{ name: string; tier: string; category: string }>).map((t, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-surface rounded-xl">
                <span className="w-6 h-6 rounded-full bg-teal/10 text-teal text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                  <p className="text-xs text-charcoal-light">{t.category}</p>
                </div>
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${t.tier === 'GREEN' ? 'bg-green-100 text-green-700' : t.tier === 'YELLOW' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{t.tier}</span>
              </div>
            ))}
          </div>
          <a href={BASE_EXPLAINER_URL} className="block w-full text-center py-3 bg-amber-400 text-charcoal font-bold rounded-xl hover:bg-amber-500 transition-colors">Get Your Own Game Plan → Free Assessment</a>
        </div>
      </div>
    </div>
  )
}
