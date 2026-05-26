import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ClipboardList, ExternalLink } from 'lucide-react'
import { cn } from '../lib/utils'

interface Exercise {
  id: string; joint: string; name: string
  sets: number; reps: string; hold_seconds?: number
  coaching_cue: string; video_url?: string
  contraindications?: string; equipment: string
}
interface Item { exercise_id: string; exercise: Exercise; order: number; checked: boolean }

function ExCard({ item, onCheck }: { item: Item; onCheck: () => void }) {
  const [open, setOpen] = useState(false)
  const e = item.exercise

  return (
    <div className={cn(
      'border rounded-2xl transition-all overflow-hidden',
      item.checked ? 'border-teal/30 bg-teal/[0.03]' : 'border-teal-light bg-white'
    )}>
      <div className="flex items-start gap-3 p-4">
        <button onClick={onCheck} className="mt-0.5 shrink-0 text-teal hover:scale-110 transition-transform">
          {item.checked
            ? <CheckCircle2 size={20} fill="currentColor" strokeWidth={0} />
            : <Circle size={20} />
          }
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-teal uppercase tracking-wide">{e.joint}</p>
              <p className={cn('text-sm font-semibold mt-0.5 leading-snug', item.checked ? 'line-through text-charcoal-light' : 'text-charcoal')}>
                {e.name}
              </p>
            </div>
            <button onClick={() => setOpen(o => !o)} className="text-charcoal-light hover:text-teal transition-colors mt-0.5">
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs bg-teal-light text-teal font-semibold px-2.5 py-0.5 rounded-full">
              {e.sets} × {e.reps}{e.hold_seconds ? ` (${e.hold_seconds}s hold)` : ''}
            </span>
            {e.equipment && e.equipment !== 'None' && e.equipment !== 'none' && (
              <span className="text-xs bg-surface text-charcoal-light px-2.5 py-0.5 rounded-full">{e.equipment}</span>
            )}
          </div>

          {open && (
            <div className="mt-3 pt-3 border-t border-teal-light space-y-2">
              {e.coaching_cue && (
                <p className="text-xs leading-relaxed text-charcoal-light">
                  <span className="font-semibold text-charcoal">Cue: </span>{e.coaching_cue}
                </p>
              )}
              {e.contraindications && (
                <p className="text-xs bg-yellow-tier-bg text-yellow-tier rounded-xl px-3 py-2 leading-snug">
                  ⚠️ {e.contraindications}
                </p>
              )}
              {e.video_url && (
                <a href={e.video_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-teal hover:underline font-medium">
                  <ExternalLink size={11} /> Watch demo
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MyProtocol() {
  const { user } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: proto } = await supabase
        .from('protocols').select('exercises')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single()
      if (!proto) { setLoading(false); return }

      const exIds = (proto.exercises as { exercise_id: string; order: number }[]).map(e => e.exercise_id)
      const { data: exData } = await supabase.from('exercises')
        .select('id, joint, name, sets, reps, hold_seconds, coaching_cue, video_url, contraindications, equipment')
        .in('id', exIds)

      const exMap = Object.fromEntries((exData ?? []).map(e => [e.id, e]))

      const today = new Date().toISOString().split('T')[0]
      const { data: completions } = await supabase.from('protocol_completions')
        .select('exercise_id').eq('user_id', user.id).gte('completed_at', `${today}T00:00:00`)

      const doneSet = new Set((completions ?? []).map(c => c.exercise_id))
      const mapped = (proto.exercises as { exercise_id: string; order: number }[])
        .filter(e => exMap[e.exercise_id]).sort((a, b) => a.order - b.order)
        .map(e => ({ exercise_id: e.exercise_id, exercise: exMap[e.exercise_id] as Exercise, order: e.order, checked: doneSet.has(e.exercise_id) }))

      setItems(mapped)
      setDone(mapped.filter(m => m.checked).length)
      setLoading(false)
    })()
  }, [user])

  const handleCheck = async (id: string, wasChecked: boolean) => {
    setItems(prev => prev.map(i => i.exercise_id === id ? { ...i, checked: !wasChecked } : i))
    setDone(c => wasChecked ? c - 1 : c + 1)
    if (!wasChecked) {
      await supabase.from('protocol_completions').insert({ user_id: user!.id, exercise_id: id })
    } else {
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('protocol_completions').delete()
        .eq('user_id', user!.id).eq('exercise_id', id).gte('completed_at', `${today}T00:00:00`)
    }
  }

  if (loading) return <Spinner />

  if (items.length === 0) return (
    <EmptyState
      icon={ClipboardList}
      title="No protocol yet"
      description="Your personalised mobility protocol will appear here after your assessment is processed."
    />
  )

  const pct = Math.round((done / items.length) * 100)

  return (
    <div className="space-y-5">
      <PageHeader title="My Protocol" subtitle={`${items.length} exercises · check off as you complete`} />

      <SectionCard>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-charcoal">Today's progress</p>
          <p className="text-sm font-bold text-teal">{done}<span className="text-charcoal-light font-normal">/{items.length}</span></p>
        </div>
        <div className="h-2.5 bg-teal-light rounded-full overflow-hidden">
          <div className="h-full bg-teal rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {pct === 100 && (
          <p className="text-xs text-teal font-semibold text-center mt-2.5">
            All done for today!
          </p>
        )}
      </SectionCard>

      <div className="space-y-2.5">
        {items.map(item => (
          <ExCard key={item.exercise_id} item={item} onCheck={() => handleCheck(item.exercise_id, item.checked)} />
        ))}
      </div>
    </div>
  )
}
