import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { TechniqueEligibility } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { TierBadge } from '../components/ui/TierBadge'
import { formatJoint, beltColor } from '../lib/utils'
import { Search, Layers, AlertTriangle } from 'lucide-react'

const CATEGORIES = ['All', 'Throws', 'Passes', 'Guards', 'Sweeps', 'Controls', 'Submissions', 'Submission defense']
const TIERS = ['All', 'GREEN', 'YELLOW', 'RED', 'DELAY'] as const

function TechCard({ item }: { item: TechniqueEligibility }) {
  const tech = item.techniques as { code: string; name: string; belt: string; category: string }
  const isDelay = item.flag === 'DELAY_TECHNIQUE'

  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 flex flex-col gap-2.5 hover:border-teal/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{tech.code}</span>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5 line-clamp-2">{tech.name}</p>
        </div>
        <TierBadge tier={isDelay ? null : item.tier} flag={item.flag} size="sm" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech.belt)}`}>{tech.belt}</span>
      </div>

      {item.limiting_joints && item.limiting_joints.length > 0 && (
        <div className="pt-2 border-t border-teal-light/60">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertTriangle size={10} className="text-gold" />
            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide">Limiting</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.limiting_joints.map(j => (
              <span key={j} className="text-[11px] bg-yellow-tier-bg text-yellow-tier px-2 py-0.5 rounded-full">{formatJoint(j)}</span>
            ))}
          </div>
        </div>
      )}

      {isDelay && (
        <div className="pt-2 border-t border-orange-100">
          <p className="text-[11px] text-delay-tier bg-delay-tier-bg rounded-lg px-2.5 py-1.5 leading-snug">
            Build prerequisite mobility before attempting this technique.
          </p>
        </div>
      )}
    </div>
  )
}

export function MyGame() {
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [tierFilter, setTierFilter] = useState<typeof TIERS[number]>('All')

  if (loading) return <Spinner />

  if (eligibility.length === 0) return (
    <EmptyState
      icon={Layers}
      title="No techniques rated yet"
      description="Technique ratings are computed from your ROM assessment. Submit your assessment to see your game plan."
    />
  )

  const filtered = eligibility.filter(item => {
    const tech = item.techniques as { name: string; category: string }
    const effectiveTier = item.flag === 'DELAY_TECHNIQUE' ? 'DELAY' : item.tier
    return (
      (tierFilter === 'All' || effectiveTier === tierFilter) &&
      (catFilter  === 'All' || tech.category.toLowerCase().includes(catFilter.toLowerCase())) &&
      (!search || tech.name.toLowerCase().includes(search.toLowerCase()))
    )
  })

  const g = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
  const y = eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length
  const r = eligibility.filter(e => e.tier === 'RED' && !e.flag).length
  const d = eligibility.filter(e => e.flag === 'DELAY_TECHNIQUE').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Game"
        subtitle={`${eligibility.length} techniques rated · ${profile?.belt ?? 'white'} belt`}
      />

      {/* Tier summary strip */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['GREEN', g, 'tier-green'],
          ['YELLOW', y, 'tier-yellow'],
          ['RED', r, 'tier-red'],
          ['DELAY', d, 'tier-delay'],
        ] as const).map(([label, count, cls]) => (
          <button
            key={label}
            onClick={() => setTierFilter(tierFilter === label ? 'All' : label)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${cls} ${
              tierFilter === label ? 'ring-2 ring-offset-1 ring-teal' : 'opacity-80 hover:opacity-100'
            }`}
          >
            {count} {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <SectionCard>
        <div className="space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search techniques..."
              className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize ${
                  catFilter === c ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                }`}
              >{c}</button>
            ))}
          </div>
        </div>
      </SectionCard>

      {filtered.length === 0 ? (
        <p className="text-center text-charcoal-light text-sm py-10">No techniques match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(item => <TechCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
