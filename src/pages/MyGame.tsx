import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { TechniqueEligibility } from '../hooks/useProfile'
import { TierBadge } from '../components/ui/TierBadge'
import { formatJoint } from '../lib/utils'
import { Search, AlertTriangle } from 'lucide-react'

const CATEGORIES = ['All', 'Throws', 'Passes', 'Guards', 'Sweeps', 'Controls', 'Submissions', 'submission defense']
const TIERS = ['All', 'GREEN', 'YELLOW', 'RED', 'DELAY']

interface TechCardProps {
  item: TechniqueEligibility
}

function TechCard({ item }: TechCardProps) {
  const tech = item.techniques as { code: string; name: string; belt: string; category: string }
  const isDelay = item.flag === 'DELAY_TECHNIQUE'
  const tier = isDelay ? null : item.tier

  return (
    <div className="bg-white border border-teal-light rounded-xl p-4 hover:border-teal transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-charcoal-light font-mono uppercase tracking-wide">{tech.code}</p>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5">{tech.name}</p>
        </div>
        <TierBadge tier={tier} flag={item.flag} size="sm" />
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-xs bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
        <span className="text-xs bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.belt} belt</span>
      </div>

      {item.limiting_joints && item.limiting_joints.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-teal-light">
          <p className="text-xs text-charcoal-light font-semibold mb-1 flex items-center gap-1">
            <AlertTriangle size={10} className="text-yellow-tier" />
            Limiting joints
          </p>
          <div className="flex flex-wrap gap-1">
            {item.limiting_joints.map(j => (
              <span key={j} className="text-xs bg-yellow-tier-bg text-yellow-tier px-2 py-0.5 rounded-full">
                {formatJoint(j)}
              </span>
            ))}
          </div>
        </div>
      )}

      {isDelay && (
        <div className="mt-2.5 pt-2.5 border-t border-orange-100">
          <p className="text-xs text-delay-tier bg-delay-tier-bg rounded-lg px-2 py-1">
            Delayed — build prerequisite mobility before attempting
          </p>
        </div>
      )}
    </div>
  )
}

export function MyGame() {
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [tierFilter, setTierFilter] = useState('All')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const filtered = eligibility.filter(item => {
    const tech = item.techniques as { name: string; category: string }
    const effectiveTier = item.flag === 'DELAY_TECHNIQUE' ? 'DELAY' : item.tier
    const matchesTier = tierFilter === 'All' || effectiveTier === tierFilter
    const matchesCat = catFilter === 'All' || tech.category.toLowerCase().includes(catFilter.toLowerCase())
    const matchesSearch = !search || tech.name.toLowerCase().includes(search.toLowerCase())
    return matchesTier && matchesCat && matchesSearch
  })

  const counts = {
    green:  eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length,
    yellow: eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length,
    red:    eligibility.filter(e => e.tier === 'RED' && !e.flag).length,
    delay:  eligibility.filter(e => e.flag === 'DELAY_TECHNIQUE').length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-charcoal">My Game</h1>
          <p className="text-sm text-charcoal-light mt-0.5 capitalize">{profile?.belt ?? 'white'} belt · {eligibility.length} techniques rated</p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: `${counts.green} GREEN`,  bg: 'tier-green' },
          { label: `${counts.yellow} YELLOW`, bg: 'tier-yellow' },
          { label: `${counts.red} RED`,       bg: 'tier-red' },
          { label: `${counts.delay} DELAY`,   bg: 'tier-delay' },
        ].map(({ label, bg }) => (
          <span key={label} className={`text-xs font-semibold px-3 py-1 rounded-full ${bg}`}>{label}</span>
        ))}
      </div>

      {/* Filters */}
      <div className="card py-3 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search techniques..."
            className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TIERS.map(t => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                tierFilter === t ? 'bg-teal text-white' : 'bg-surface text-charcoal-light hover:bg-teal-light'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize ${
                catFilter === c ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Technique grid */}
      {filtered.length === 0 ? (
        <p className="text-center text-charcoal-light text-sm py-8">No techniques match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => <TechCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
