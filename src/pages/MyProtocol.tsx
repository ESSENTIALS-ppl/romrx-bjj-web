import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

interface Exercise {
  id: string
  joint: string
  name: string
  sets: number
  reps: string
  hold_seconds?: number
  coaching_cue: string
  video_url?: string
  contraindications?: string
  equipment: string
}

interface ProtocolItem {
  exercise_id: string
  exercise: Exercise
  order: number
  checked: boolean
}

function ExerciseCard({ item, onCheck }: { item: ProtocolItem; onCheck: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'bg-white border rounded-xl transition-all',
      item.checked ? 'border-teal opacity-75' : 'border-teal-light'
    )}>
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={onCheck}
          className="mt-0.5 text-teal shrink-0 hover:scale-110 transition-transform"
        >
          {item.checked
            ? <CheckCircle2 size={20} fill="currentColor" />
            : <Circle size={20} />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide">{item.exercise.joint}</p>
              <p className={cn('text-sm font-semibold mt-0.5', item.checked ? 'line-through text-charcoal-light' : 'text-charcoal')}>
                {item.exercise.name}
              </p>
            </div>
            <button onClick={() => setExpanded(e => !e)} className="text-charcoal-light hover:text-teal transition-colors">
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Sets / reps */}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs bg-teal-light text-teal font-semibold px-2 py-0.5 rounded-full">
              {item.exercise.sets} sets × {item.exercise.reps}{item.exercise.hold_seconds ? ` (hold ${item.exercise.hold_seconds}s)` : ''}
            </span>
            {item.exercise.equipment && item.exercise.equipment !== 'None' && (
              <span className="text-xs bg-surface text-charcoal-light px-2 py-0.5 rounded-full">
                {item.exercise.equipment}
              </span>
            )}
          </div>

          {/* Expanded: cue + video */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-teal-light space-y-2">
              <p className="text-xs text-charcoal-light leading-relaxed">
                <span className="font-semibold text-charcoal">Cue: </span>{item.exercise.coaching_cue}
              </p>
              {item.exercise.contraindications && (
                <p className="text-xs text-yellow-tier bg-yellow-tier-bg rounded-lg px-3 py-2">
                  ⚠️ {item.exercise.contraindications}
                </p>
              )}
              {item.exercise.video_url && (
                <a
                  href={item.exercise.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-teal underline"
                >
                  Watch demo
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
  const [items, setItems] = useState<ProtocolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [completedCount, setCompletedCount] = useState(0)

  useEffect(() => {
    if (!user) return
    async function load() {
      // Load the latest protocol for this user from protocols table
      const { data: protocol } = await supabase
        .from('protocols')
        .select('id, exercises')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!protocol) { setLoading(false); return }

      // Get exercise details
      const exerciseIds = (protocol.exercises as { exercise_id: string; order: number }[]).map(e => e.exercise_id)
      const { data: exerciseData } = await supabase
        .from('exercises')
        .select('id, joint, name, sets, reps, hold_seconds, coaching_cue, video_url, contraindications, equipment')
        .in('id', exerciseIds)

      const exerciseMap = Object.fromEntries((exerciseData ?? []).map(e => [e.id, e]))

      // Check today's completions
      const today = new Date().toISOString().split('T')[0]
      const { data: completions } = await supabase
        .from('protocol_completions')
        .select('exercise_id')
        .eq('user_id', user!.id)
        .gte('completed_at', `${today}T00:00:00`)

      const completedIds = new Set((completions ?? []).map(c => c.exercise_id))

      const mapped = (protocol.exercises as { exercise_id: string; order: number }[])
        .filter(e => exerciseMap[e.exercise_id])
        .sort((a, b) => a.order - b.order)
        .map(e => ({
          exercise_id: e.exercise_id,
          exercise: exerciseMap[e.exercise_id] as Exercise,
          order: e.order,
          checked: completedIds.has(e.exercise_id),
        }))

      setItems(mapped)
      setCompletedCount(mapped.filter(m => m.checked).length)
      setLoading(false)
    }
    load()
  }, [user])

  const handleCheck = async (exerciseId: string, isChecked: boolean) => {
    setItems(prev => prev.map(item =>
      item.exercise_id === exerciseId ? { ...item, checked: !isChecked } : item
    ))

    if (!isChecked) {
      await supabase.from('protocol_completions').insert({
        user_id: user!.id,
        exercise_id: exerciseId,
      })
      setCompletedCount(c => c + 1)
    } else {
      // Remove today's completion
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('protocol_completions')
        .delete()
        .eq('user_id', user!.id)
        .eq('exercise_id', exerciseId)
        .gte('completed_at', `${today}T00:00:00`)
      setCompletedCount(c => c - 1)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="card text-center py-12">
        <h2 className="font-display font-bold text-lg text-charcoal mb-2">No protocol yet</h2>
        <p className="text-sm text-charcoal-light">Your mobility protocol will be generated after your assessment is processed.</p>
      </div>
    )
  }

  const pct = Math.round((completedCount / items.length) * 100)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-2xl text-charcoal">My Protocol</h1>
        <p className="text-sm text-charcoal-light mt-0.5">{items.length} exercises · check off as you complete</p>
      </div>

      {/* Progress bar */}
      <div className="card py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-charcoal">Today's progress</p>
          <p className="text-sm font-bold text-teal">{completedCount}/{items.length}</p>
        </div>
        <div className="h-2.5 bg-teal-light rounded-full overflow-hidden">
          <div
            className="h-full bg-teal rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="text-xs text-teal font-semibold mt-2 text-center">Protocol complete today!</p>
        )}
      </div>

      {/* Exercise cards */}
      <div className="space-y-2.5">
        {items.map(item => (
          <ExerciseCard
            key={item.exercise_id}
            item={item}
            onCheck={() => handleCheck(item.exercise_id, item.checked)}
          />
        ))}
      </div>
    </div>
  )
}
