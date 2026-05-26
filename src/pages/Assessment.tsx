import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Info, ExternalLink, SkipForward } from 'lucide-react'
import { cn } from '../lib/utils'

const SUBMIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-assessment`

// ── Types ────────────────────────────────────────────────────────────────────
interface Field {
  key: string
  label: string
  unit?: string
  normalLow: number
  normalHigh: number
  riskBelow: number  // AT RISK threshold
}

interface Step {
  id: string
  title: string
  bjjWhy: string         // One-line BJJ relevance
  tool: string           // What to use to measure
  position: string[]     // Setup steps (numbered)
  howTo: string[]        // How to measure steps
  mistake: string        // Common mistake
  mistakeFix: string     // The fix
  videoUrl?: string
  videoLabel?: string
  fields: Field[]
}

// ── Measurement steps (one per joint group) ──────────────────────────────────
const STEPS: Step[] = [
  {
    id: 'hip_er',
    title: 'Hip External Rotation',
    bjjWhy: 'Critical for triangles, De La Riva, and all guard positions.',
    tool: 'Smartphone inclinometer · Seated on a firm chair',
    position: [
      'Sit on a firm chair or bench, feet flat on the floor, knees bent at 90°.',
      'Place your phone FLAT on your shin, just below the knee, long edge running along your shinbone.',
      'Screen facing UP. Tap once to zero the display.',
    ],
    howTo: [
      'Keep your THIGH completely still on the chair.',
      'Slowly swing your lower leg INWARD (toward your other leg) — your knee opens outward. That\'s external rotation.',
      'Move until you feel a firm stretch — no pain, no bouncing.',
      'Pause 1 second. Read and record the number. Ignore any minus sign.',
      'Return to start. Tap to re-zero. Repeat on the other leg.',
    ],
    mistake: 'Moving your thigh or leaning your torso.',
    mistakeFix: 'Press one hand firmly on your thigh to keep it pinned to the chair — only your lower leg swings.',
    videoUrl: 'https://www.youtube.com/watch?v=EdxiU8vM_F4',
    videoLabel: 'Seated Hip External Rotation Test (0:35)',
    fields: [
      { key: 'hip_er_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
      { key: 'hip_er_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
    ],
  },
  {
    id: 'hip_ir',
    title: 'Hip Internal Rotation',
    bjjWhy: 'Critical for guard passing and protecting your lower back.',
    tool: 'Smartphone inclinometer · Same seated position as Hip ER',
    position: [
      'Stay in the same seated position — firm chair, feet flat, knees at 90°.',
      'Phone flat on your shin, long edge along the shinbone, just below the knee.',
      'Tap once to zero.',
    ],
    howTo: [
      'Keep your THIGH still on the chair.',
      'Slowly swing your lower leg OUTWARD (away from your other leg) — your knee drops inward. That\'s internal rotation.',
      'Move until you feel a firm stretch — no pain.',
      'Pause 1 second. Read and record the number.',
      'Return to start. Tap to re-zero. Repeat on the other leg.',
    ],
    mistake: 'Lifting or shifting the thigh off the chair.',
    mistakeFix: 'Press your hand gently on your thigh to keep it pinned while only your lower leg moves.',
    videoUrl: 'https://www.youtube.com/watch?v=jFBD1wZvXIc',
    videoLabel: 'Hip IR and ER ROM Test (3:18)',
    fields: [
      { key: 'hip_ir_l', label: 'Left', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
      { key: 'hip_ir_r', label: 'Right', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
    ],
  },
  {
    id: 'hip_abd',
    title: 'Hip Abduction',
    bjjWhy: 'Critical for guard retention, butterfly guard, and hip escapes.',
    tool: 'Smartphone inclinometer · Lying flat on your back',
    position: [
      'Lie on your back on the floor, legs straight and together.',
      'Place your phone flat on the FRONT of your thigh (just above the knee), long edge running hip to knee, screen facing up.',
      'Tap once to zero.',
    ],
    howTo: [
      'Keeping your leg straight and toes pointing up, slowly slide your leg OUT TO THE SIDE along the floor.',
      'Stop at a firm stretch — no pain, no rolling your pelvis.',
      'Pause 1 second. Read and record.',
      'Return to start. Tap to re-zero. Repeat on the other leg.',
    ],
    mistake: 'Rolling your pelvis toward the moving leg, which fakes extra range.',
    mistakeFix: 'Keep BOTH hip bones pointing straight at the ceiling. Press your hand on your opposite hip to check.',
    fields: [
      { key: 'hip_abd_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
      { key: 'hip_abd_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
    ],
  },
  {
    id: 'hip_flex',
    title: 'Hip Flexion',
    bjjWhy: 'Critical for closed guard, rubber guard, and inverting.',
    tool: 'Smartphone inclinometer · Lying flat on your back',
    position: [
      'Lie on your back, legs straight.',
      'Place your phone flat on the FRONT of your thigh (just above the knee), long edge running hip to knee, screen facing up.',
      'Tap once to zero with your leg flat on the floor.',
    ],
    howTo: [
      'Slowly bring your knee toward your chest, keeping the knee bent.',
      'Use your OWN MUSCLE — do NOT pull with your hands. This measures active ROM.',
      'Stop at a firm stretch. Pause 1 second. Read and record.',
      'Return to start. Tap to re-zero. Repeat on the other leg.',
    ],
    mistake: 'Pulling the knee with your hands or curling your lower back off the floor.',
    mistakeFix: 'Use only your hip flexor muscles to bring the knee up. Keep your low back flat on the ground.',
    fields: [
      { key: 'hip_flex_l', label: 'Left', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
      { key: 'hip_flex_r', label: 'Right', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
    ],
  },
  {
    id: 'shoulder_er',
    title: 'Shoulder External Rotation',
    bjjWhy: 'Critical for defending submissions and creating frames.',
    tool: 'Smartphone inclinometer · Lying face-up on the floor',
    position: [
      'Lie face-up on the floor.',
      'Raise one arm out to the side, ELBOW BENT AT 90° — upper arm flat on the floor, forearm pointing straight up toward the ceiling.',
      'Place your phone flat on the INSIDE (palm side) of your forearm, long edge running wrist to elbow.',
      'Tap once to zero with your forearm vertical.',
    ],
    howTo: [
      'Slowly let your forearm fall BACKWARD toward the floor (hand moves toward your head). That\'s external rotation.',
      'Move until a firm stretch — no pain, no forcing.',
      'Pause 1 second. Read and record.',
      'Return forearm to vertical. Tap to re-zero. Repeat on the other arm.',
    ],
    mistake: 'Arching your back or lifting your elbow off the floor to fake extra range.',
    mistakeFix: 'Keep your low back flat and your upper arm pinned to the ground throughout.',
    videoUrl: 'https://www.youtube.com/watch?v=0eWUi8sWjvY',
    videoLabel: 'Shoulder IR and ER ROM Test (2:44)',
    fields: [
      { key: 'shoulder_er_l', label: 'Left', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
      { key: 'shoulder_er_r', label: 'Right', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
    ],
  },
  {
    id: 'shoulder_flex',
    title: 'Shoulder Flexion',
    bjjWhy: 'Critical for frames, underhooks, and reaching for grips.',
    tool: 'Smartphone inclinometer · Standing with back flat against a wall',
    position: [
      'Stand with your BACK FLAT against a wall, feet about 6 inches from the wall.',
      'Hold your phone flat against the OUTSIDE of your upper arm (between shoulder and elbow), long edge running shoulder to elbow.',
      'With your arm hanging relaxed at your side, tap to zero.',
    ],
    howTo: [
      'Keeping your arm straight and thumb pointing forward, slowly raise your arm OVERHEAD (forward and up) as far as possible.',
      'Keep your back and head against the wall — no arching away.',
      'Pause 1 second at end range. Read and record.',
      'Return arm to side. Tap to re-zero. Repeat on the other arm.',
    ],
    mistake: 'Arching your back away from the wall to get the arm higher.',
    mistakeFix: 'Keep your entire back flat against the wall throughout. If your back peels off, that\'s your actual limit.',
    fields: [
      { key: 'shoulder_flex_l', label: 'Left', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
      { key: 'shoulder_flex_r', label: 'Right', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
    ],
  },
  {
    id: 'ankle_df',
    title: 'Ankle Dorsiflexion',
    bjjWhy: 'Affects balance, base, and proprioception in every standing position.',
    tool: 'Ruler or tape measure · Standing facing a wall',
    position: [
      'Stand facing a wall.',
      'Place ONE FOOT about 4 inches (10 cm) from the wall, toes pointing straight at the wall.',
      'Keep your HEEL FLAT on the ground.',
    ],
    howTo: [
      'Bend your knee forward, trying to touch the wall with your kneecap while keeping your heel flat.',
      'If your knee touches easily, move your foot FARTHER from the wall and try again.',
      'Find the MAXIMUM distance where your knee can still touch the wall with the heel flat.',
      'Measure the distance from your BIG TOE to the wall in centimeters.',
      'Repeat on the other foot.',
    ],
    mistake: 'Letting your heel lift off the ground.',
    mistakeFix: 'The heel must stay completely flat throughout. That\'s the whole point of the test.',
    fields: [
      { key: 'ankle_df_l', label: 'Left', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
      { key: 'ankle_df_r', label: 'Right', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
    ],
  },
  {
    id: 'lumbar',
    title: 'Lumbar Flexion & Extension',
    bjjWhy: 'Affects turtle position, rolling, guard recovery, bridging, and back escapes.',
    tool: 'Smartphone inclinometer · Standing then lying face-down',
    position: [
      'For FLEXION: Stand upright. Place phone on your low back (over your belt line), long edge running up and down your spine. Tuck it into your waistband securely. Tap to zero.',
      'For EXTENSION: Lie face-down (prone). Place phone on your low back at belt-line level, long edge running up and down your spine. Tap to zero while lying flat.',
    ],
    howTo: [
      'FLEXION: Slowly bend forward, rounding your low back, reaching your hands toward the floor. Think "curl your spine," not just hinge at hips. Pause at max comfortable rounding. Read and record.',
      'EXTENSION: Place hands under your shoulders (push-up position). Press your chest UP, keeping your hips on the floor (cobra/press-up). Extend as far as comfortable — no pain. Pause 1 second. Read and record.',
    ],
    mistake: 'Flexion: bending from hips with a flat back. Extension: lifting hips off the floor.',
    mistakeFix: 'Flexion: imagine looking at your belly button as you curl forward. Extension: keep your hip bones pressed into the floor — only your chest lifts.',
    fields: [
      { key: 'lumbar_flex', label: 'Lumbar Flexion', unit: '°', normalLow: 40, normalHigh: 80, riskBelow: 40 },
      { key: 'lumbar_ext', label: 'Lumbar Extension', unit: '°', normalLow: 20, normalHigh: 30, riskBelow: 15 },
    ],
  },
  {
    id: 'cervical',
    title: 'Cervical Rotation',
    bjjWhy: 'Critical for awareness, safety, and avoiding neck injuries during scrambles.',
    tool: 'Smartphone inclinometer · Seated upright in a firm chair',
    position: [
      'Sit upright in a firm chair, looking straight ahead, shoulders relaxed.',
      'Place your phone flat on TOP OF YOUR HEAD (a beanie or headband helps). Center the phone with the long edge pointing forward (back of head toward forehead).',
      'Tap once to zero while looking straight ahead.',
    ],
    howTo: [
      'Slowly rotate your head to ONE SIDE as far as comfortable — no pain.',
      'Keep your shoulders completely still — ONLY your head turns.',
      'Pause 1 second. Use hands-free screenshot ("Hey Siri/Google, take a screenshot") or have someone read the screen.',
      'Record the number. Return to center. Tap to re-zero.',
      'Repeat to the other side. Record the LOWER of the two readings.',
    ],
    mistake: 'Turning your shoulders with your head.',
    mistakeFix: 'Sit with your back firmly against the chair back to lock your torso. Only your head rotates.',
    videoUrl: 'https://www.youtube.com/watch?v=tdVd5Y5c2GU',
    videoLabel: 'Cervical Rotation with Inclinometer (1:25)',
    fields: [
      { key: 'cervical_rot_l', label: 'Left', unit: '°', normalLow: 70, normalHigh: 90, riskBelow: 60 },
      { key: 'cervical_rot_r', label: 'Right', unit: '°', normalLow: 70, normalHigh: 90, riskBelow: 60 },
    ],
  },
  {
    id: 'thoracic',
    title: 'Thoracic Rotation',
    bjjWhy: 'Affects hip escape mechanics, guard recovery, and back take entries.',
    tool: 'Smartphone inclinometer · Seated on the floor in cross-legged position',
    position: [
      'Sit cross-legged on the floor (or on a low stool), arms crossed over your chest.',
      'Place your phone on your STERNUM (chest bone), long edge running up and down, screen facing out.',
      'Tap to zero while sitting upright.',
    ],
    howTo: [
      'Slowly rotate your upper body (torso) to one side as far as comfortable.',
      'Keep your hips and lower body as still as possible — rotation comes from your upper back.',
      'Pause 1 second. Read and record.',
      'Return to center. Tap to re-zero. Repeat to the other side.',
      'Record the AVERAGE of Left and Right.',
    ],
    mistake: 'Rotating from the hips instead of the thoracic spine.',
    mistakeFix: 'Cross your legs or sit against a wall to lock your hips. The rotation should feel like it comes from behind your ribs.',
    fields: [
      { key: 'thoracic_rot', label: 'Thoracic Rotation (avg of L+R)', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 30 },
    ],
  },
]

const SETUP_STEPS = [
  { icon: '📱', label: 'iPhone', detail: 'Open the Measure app → tap Level at the bottom' },
  { icon: '🤖', label: 'Android', detail: 'Download "Simple Inclinometer" by Syleos Apps (free, Play Store)' },
  { icon: '⚖️', label: 'Calibrate', detail: 'Place phone on a flat surface — confirm it reads 0°. Tap to zero if not.' },
  { icon: '🏃', label: 'Warm up', detail: '8–10 min light movement first. Wear shorts and a t-shirt.' },
]

// ── Live scoring helper ───────────────────────────────────────────────────────
function getScore(val: string, field: Field) {
  const n = parseFloat(val)
  if (isNaN(n) || val === '') return null
  if (n < field.riskBelow) return 'risk'
  if (n >= field.normalLow) return 'functional'
  return 'yellow'
}

// ── Single field input ────────────────────────────────────────────────────────
function MeasureInput({ field, value, onChange }: {
  field: Field; value: string; onChange: (k: string, v: string) => void
}) {
  const score = getScore(value, field)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-charcoal">{field.label}</label>
        <span className="text-xs text-charcoal-light">Normal: {field.normalLow}–{field.normalHigh}{field.unit}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number" min="0" max="360" step="0.5"
          value={value}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder="—"
          className={cn(
            'w-24 px-3 py-2.5 rounded-xl border text-sm text-center font-mono font-bold transition-all focus:outline-none',
            score === 'risk'       ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400' :
            score === 'functional' ? 'border-teal/40 bg-teal/5 text-teal focus:border-teal' :
            score === 'yellow'     ? 'border-yellow-300 bg-yellow-50 text-yellow-700 focus:border-yellow-400' :
                                     'border-teal-light bg-surface focus:border-teal focus:bg-white'
          )}
        />
        <span className="text-sm text-charcoal-light">{field.unit}</span>
        {score === 'risk' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-tier bg-red-tier-bg px-2 py-0.5 rounded-full">
            <AlertTriangle size={10} /> AT RISK
          </span>
        )}
        {score === 'functional' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-teal bg-teal-light px-2 py-0.5 rounded-full">
            <CheckCircle2 size={10} /> FUNCTIONAL
          </span>
        )}
        {score === 'yellow' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-yellow-tier bg-yellow-tier-bg px-2 py-0.5 rounded-full">
            ⚠ LOW
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Assessment() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase]     = useState<'setup' | 'measure' | 'done'>('setup')
  const [stepIdx, setStepIdx] = useState(0)
  const [values, setValues]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleChange = (key: string, val: string) => setValues(p => ({ ...p, [key]: val }))

  const step = STEPS[stepIdx]
  const totalMeasureSteps = STEPS.length
  const progress = Math.round(((stepIdx) / totalMeasureSteps) * 100)

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      submit()
    }
  }

  const submit = async () => {
    if (!session) { setError('Session expired — please sign in again.'); return }
    setLoading(true); setError('')
    const payload: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(values)) {
      payload[k] = v === '' ? null : parseFloat(v)
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
    if (!data.ok) { setError(data.error ?? 'Submission failed. Please try again.'); return }
    setPhase('done')
    setTimeout(() => navigate('/dashboard/my-body', { replace: true }), 2000)
  }

  // ── Setup screen ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-surface py-8 px-4">
        <div className="max-w-lg mx-auto space-y-5">
          <div className="text-center">
            <h1 className="font-display font-bold text-teal text-2xl">ROM Self-Assessment</h1>
            <p className="text-sm text-charcoal-light mt-1">15 minutes · Smartphone inclinometer · No equipment needed</p>
          </div>

          <div className="bg-white rounded-2xl border border-teal-light p-6 space-y-4">
            <p className="text-sm font-semibold text-charcoal">Before you start:</p>
            {SETUP_STEPS.map(s => (
              <div key={s.label} className="flex gap-3 items-start">
                <span className="text-xl shrink-0">{s.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-charcoal">{s.label}</p>
                  <p className="text-xs text-charcoal-light leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-teal-light rounded-2xl p-4">
            <div className="flex gap-2 items-start">
              <Info size={16} className="text-teal mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-teal">How to use your phone as a measuring tool</p>
                <p className="text-xs text-teal/80 mt-1 leading-relaxed">
                  Place phone FLAT against the body part. Tap screen to zero. Move to end range. Pause 1 second. Read the number (ignore any minus sign). This is the same method validated in 4 peer-reviewed clinical studies.
                </p>
              </div>
            </div>
          </div>

          <button onClick={() => setPhase('measure')} className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3">
            I'm ready — Start assessment <ChevronRight size={18} />
          </button>
          <p className="text-center text-xs text-charcoal-light">You can skip any measurement you can't do and retest later.</p>
        </div>
      </div>
    )
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-teal-light rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-teal" fill="currentColor" strokeWidth={0} />
          </div>
          <h2 className="font-display font-bold text-xl text-charcoal">Assessment complete!</h2>
          <p className="text-sm text-charcoal-light">Computing your technique tiers...</p>
          <div className="w-6 h-6 border-[3px] border-teal/30 border-t-teal rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  // ── Measurement screen ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-teal-light rounded-full overflow-hidden">
            <div className="h-full bg-teal rounded-full transition-all duration-500"
              style={{ width: `${progress + (100 / totalMeasureSteps)}%` }} />
          </div>
          <span className="text-xs text-charcoal-light whitespace-nowrap">{stepIdx + 1} / {totalMeasureSteps}</span>
        </div>

        {/* Joint card */}
        <div className="bg-white rounded-2xl border border-teal-light shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-teal px-5 py-4">
            <h2 className="font-display font-bold text-xl text-white">{step.title}</h2>
            <p className="text-teal-light text-xs mt-0.5">{step.bjjWhy}</p>
          </div>

          <div className="p-5 space-y-5">
            {/* Tool */}
            <div className="flex items-center gap-2 text-xs text-charcoal-light bg-surface rounded-xl px-3 py-2">
              <span className="text-base">📐</span>
              <span className="font-medium">{step.tool}</span>
            </div>

            {/* Video reference */}
            {step.videoUrl && (
              <a href={step.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-teal font-medium hover:underline">
                <ExternalLink size={12} /> {step.videoLabel}
              </a>
            )}

            {/* Setup */}
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Setup</p>
              <ol className="space-y-1.5">
                {step.position.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-charcoal-light leading-snug">
                    <span className="w-5 h-5 bg-teal-light text-teal text-xs font-bold rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* How to */}
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">How to Measure</p>
              <ol className="space-y-1.5">
                {step.howTo.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-charcoal-light leading-snug">
                    <span className="w-5 h-5 bg-surface border border-teal-light text-charcoal-light text-xs font-bold rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Common mistake */}
            <div className="flex gap-2.5 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-yellow-700">Common mistake</p>
                <p className="text-xs text-yellow-700 mt-0.5">{step.mistake}</p>
                <p className="text-xs text-yellow-800 font-medium mt-1">Fix: {step.mistakeFix}</p>
              </div>
            </div>

            {/* Input fields */}
            <div className="space-y-4 pt-2 border-t border-teal-light">
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide">Enter your measurements</p>
              {step.fields.map(f => (
                <MeasureInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={handleChange} />
              ))}
            </div>

            {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => { if (stepIdx > 0) { setStepIdx(s => s - 1); window.scrollTo({ top: 0 }) } else setPhase('setup') }}
                className="flex items-center gap-1 text-sm text-charcoal-light hover:text-teal px-3 py-2 rounded-xl hover:bg-teal-light transition-colors"
              >
                <ChevronLeft size={15} /> Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { handleChange(step.fields[0].key, ''); handleNext() }}
                  className="flex items-center gap-1 text-xs text-charcoal-light hover:text-charcoal px-3 py-2 rounded-xl hover:bg-surface transition-colors"
                >
                  <SkipForward size={13} /> Skip
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /> Submitting...</>
                    : stepIdx === STEPS.length - 1
                      ? <><CheckCircle2 size={14} /> Submit</>
                      : <>Next <ChevronRight size={14} /></>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn(
              'rounded-full transition-all duration-300',
              i === stepIdx ? 'bg-teal w-5 h-2' : i < stepIdx ? 'bg-teal/40 w-2 h-2' : 'bg-gray-200 w-2 h-2'
            )} />
          ))}
        </div>
      </div>
    </div>
  )
}
