import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import { cn } from '../lib/utils'

const SUBMIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-assessment`

interface FieldDef {
  key: string
  label: string
  side?: 'L' | 'R' | 'midline'
  hint?: string
}

interface Section {
  title: string
  subtitle: string
  fields: FieldDef[]
}

const SECTIONS: Section[] = [
  {
    title: 'Hip Rotation',
    subtitle: 'Measure with hip at 90° flexion (seated or supine). Record both left and right.',
    fields: [
      { key: 'hip_er_l', label: 'Hip External Rotation — Left',  side: 'L', hint: 'Thigh fixed, lower leg moves outward' },
      { key: 'hip_er_r', label: 'Hip External Rotation — Right', side: 'R', hint: 'Thigh fixed, lower leg moves outward' },
      { key: 'hip_ir_l', label: 'Hip Internal Rotation — Left',  side: 'L', hint: 'Thigh fixed, lower leg moves inward' },
      { key: 'hip_ir_r', label: 'Hip Internal Rotation — Right', side: 'R', hint: 'Thigh fixed, lower leg moves inward' },
    ],
  },
  {
    title: 'Hip Abduction & Flexion',
    subtitle: 'Measure in standing or supine position. Record degrees from neutral.',
    fields: [
      { key: 'hip_abd_l', label: 'Hip Abduction — Left',  side: 'L', hint: 'Leg moves away from midline' },
      { key: 'hip_abd_r', label: 'Hip Abduction — Right', side: 'R', hint: 'Leg moves away from midline' },
      { key: 'hip_flex_l', label: 'Hip Flexion — Left',  side: 'L', hint: 'Knee to chest while lying flat' },
      { key: 'hip_flex_r', label: 'Hip Flexion — Right', side: 'R', hint: 'Knee to chest while lying flat' },
    ],
  },
  {
    title: 'Shoulder',
    subtitle: 'Measure with arm at side for ER and overhead for flexion.',
    fields: [
      { key: 'shoulder_er_l',   label: 'Shoulder External Rotation — Left',  side: 'L', hint: 'Elbow bent 90°, forearm rotates outward' },
      { key: 'shoulder_er_r',   label: 'Shoulder External Rotation — Right', side: 'R', hint: 'Elbow bent 90°, forearm rotates outward' },
      { key: 'shoulder_flex_l', label: 'Shoulder Flexion — Left',  side: 'L', hint: 'Arm raises forward overhead' },
      { key: 'shoulder_flex_r', label: 'Shoulder Flexion — Right', side: 'R', hint: 'Arm raises forward overhead' },
    ],
  },
  {
    title: 'Ankle & Cervical',
    subtitle: 'Ankle: foot flat, knee forward over toes. Cervical: chin to shoulder rotation.',
    fields: [
      { key: 'ankle_df_l',    label: 'Ankle Dorsiflexion — Left',  side: 'L', hint: 'Foot flat, measure knee-over-toe distance in cm' },
      { key: 'ankle_df_r',    label: 'Ankle Dorsiflexion — Right', side: 'R', hint: 'Foot flat, measure knee-over-toe distance in cm' },
      { key: 'cervical_rot_l', label: 'Cervical Rotation — Left',  side: 'L', hint: 'Turn chin toward left shoulder' },
      { key: 'cervical_rot_r', label: 'Cervical Rotation — Right', side: 'R', hint: 'Turn chin toward right shoulder' },
    ],
  },
  {
    title: 'Spine',
    subtitle: 'Midline measurements — single value each. Sit-and-reach for lumbar flex.',
    fields: [
      { key: 'lumbar_flex',  label: 'Lumbar Flexion',  side: 'midline', hint: 'Forward bend — measure fingertip to floor (negative = below)' },
      { key: 'lumbar_ext',   label: 'Lumbar Extension', side: 'midline', hint: 'Backward bend from neutral' },
      { key: 'thoracic_rot', label: 'Thoracic Rotation', side: 'midline', hint: 'Seated rotation — degrees from neutral' },
    ],
  },
]

function NumInput({ label, fieldKey, value, onChange, hint }: {
  label: string; fieldKey: string; value: string; onChange: (k: string, v: string) => void; hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-charcoal">{label}</label>
      {hint && <p className="text-xs text-charcoal-light">{hint}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number" min="0" max="360" step="0.5"
          value={value}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder="0"
          className="w-28 px-3 py-2.5 rounded-xl border border-teal-light bg-surface text-sm text-center font-mono focus:outline-none focus:border-teal focus:bg-white transition-colors"
        />
        <span className="text-xs text-charcoal-light">degrees</span>
      </div>
    </div>
  )
}

export function Assessment() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (key: string, val: string) => setValues(p => ({ ...p, [key]: val }))

  const isLastStep = step === SECTIONS.length - 1

  const handleNext = () => {
    if (isLastStep) { submit(); return }
    setStep(s => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    if (!session) { setError('Not logged in. Please sign in again.'); return }
    setLoading(true); setError('')

    // Convert to numbers, null if empty
    const payload: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(values)) {
      payload[k] = v === '' ? null : Number(v)
    }

    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    setLoading(false)

    if (!data.ok) {
      setError(data.error ?? 'Submission failed. Please try again.')
      return
    }

    // Success — compute-tiers fires via DB webhook
    navigate('/dashboard/my-body', { replace: true })
  }

  const section = SECTIONS[step]
  const progress = Math.round(((step) / SECTIONS.length) * 100)

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-teal text-2xl">ROM Assessment</h1>
          <p className="text-sm text-charcoal-light mt-1">Step {step + 1} of {SECTIONS.length}</p>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-teal-light rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-teal rounded-full transition-all duration-500"
            style={{ width: `${progress + (100 / SECTIONS.length)}%` }}
          />
        </div>

        {/* Section card */}
        <div className="bg-white rounded-2xl border border-teal-light p-6 shadow-sm space-y-5">
          <div>
            <h2 className="font-display font-bold text-xl text-charcoal">{section.title}</h2>
            <p className="text-sm text-charcoal-light mt-1 leading-relaxed">{section.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map(f => (
              <NumInput
                key={f.key}
                label={f.label}
                fieldKey={f.key}
                value={values[f.key] ?? ''}
                onChange={handleChange}
                hint={f.hint}
              />
            ))}
          </div>

          {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className={cn(
                'flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-xl transition-colors',
                step === 0 ? 'text-gray-300 cursor-default' : 'text-charcoal-light hover:text-teal hover:bg-teal-light'
              )}
            >
              <ChevronLeft size={16} /> Back
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="btn-primary flex items-center gap-2 px-6"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Submitting...</>
                : isLastStep
                  ? <><CheckCircle2 size={15} /> Submit assessment</>
                  : <>Next <ChevronRight size={15} /></>
              }
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mt-5">
          {SECTIONS.map((_, i) => (
            <div key={i} className={cn(
              'w-2 h-2 rounded-full transition-all',
              i === step ? 'bg-teal w-5' : i < step ? 'bg-teal/40' : 'bg-gray-200'
            )} />
          ))}
        </div>

        <p className="text-center text-xs text-charcoal-light mt-4">
          All measurements in degrees. Skip any joints you can't measure — you can always retest later.
        </p>
      </div>
    </div>
  )
}
