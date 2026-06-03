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
  // ── SEATED CLUSTER ────────────────────────────────────────────────────────
  {
    id: 'hip_er',
    title: 'Hip External Rotation',
    bjjWhy: 'Opens your guard game - triangles, De La Riva, and seated guard all need this.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Firm chair',
    position: [
      'Sit in a firm chair. Both feet flat on the floor, knees at 90°.',
      'Hold your phone against the FRONT of your shin (just below your knee). Screen faces FORWARD - away from your leg. Long edge runs along your shinbone.',
      'Tap to zero. The phone should read close to 0°.',
    ],
    howTo: [
      'Keep your thigh pressed down. Slowly swing your foot INWARD - toward your other leg.',
      'Stop when you feel a firm stretch or your thigh starts to lift off the chair. Read the number.',
      'Record it. Return to center. Re-zero. Switch legs and repeat.',
    ],
    mistake: 'Your thigh rotates instead of just your shin.',
    mistakeFix: 'Press one hand gently on your thigh to hold it still. Only the lower leg moves.',
    fields: [
      { key: 'hip_er_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
      { key: 'hip_er_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
    ],
  },
  {
    id: 'hip_ir',
    title: 'Hip Internal Rotation',
    bjjWhy: 'Protects your knee in guard, drives hip escapes, key in leg entanglement defense.',
    tool: '✓ Same chair, same phone placement - only the foot direction changes.',
    position: [
      'Stay in the same chair. Do NOT move your position.',
      'Phone is still on the front of your shin, screen facing forward.',
      'Tap to re-zero at center before each leg.',
    ],
    howTo: [
      'Keep your thigh pressed down. Slowly swing your foot OUTWARD - away from your other leg.',
      'Stop when you feel a firm stretch or one butt cheek starts to lift. Read the number.',
      'Record it. Return to center. Re-zero. Switch legs and repeat.',
    ],
    mistake: 'One butt cheek lifts off the chair.',
    mistakeFix: 'You must stay sitting evenly on both sides. The moment one side lifts - that is your endpoint. Record it.',
    fields: [
      { key: 'hip_ir_l', label: 'Left', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
      { key: 'hip_ir_r', label: 'Right', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
    ],
  },
  {
    id: 'shoulder_er',
    title: 'Shoulder External Rotation',
    bjjWhy: 'Kimura defense, shoulder frames, and posting your hand to avoid the sweep all require this.',
    tool: 'iPhone: Measure - Level  ·  Android: Simple Inclinometer  ·  Seated in chair',
    position: [
      'Sit upright. Raise one arm straight out to the side at shoulder height, like a T. Bend your elbow to 90°.',
      'Hold your phone in that hand, screen facing toward you. That is your starting position.',
      'Tap to zero.',
    ],
    howTo: [
      'Keep your elbow in the same spot. Rotate your forearm upward, allowing your shoulder to turn until you feel a strong stretch.',
      'Read the number or have a partner read it.',
      'Record the number. Re-zero and repeat with the opposite arm.',
    ],
    mistake: 'Your shoulder shrugs up or your elbow drops below shoulder height.',
    mistakeFix: 'Keep your shoulder pressed down and your elbow at the same height the whole time. From the elbow to the shoulder, the arm only rotates - it does not lift up or drop down.',
    fields: [
      { key: 'shoulder_er_l', label: 'Left', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
      { key: 'shoulder_er_r', label: 'Right', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
    ],
  },
  {
    id: 'shoulder_flex',
    title: 'Shoulder Flexion',
    bjjWhy: 'Overhead frames, kimura defense, and spider guard all require full shoulder lift.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Standing',
    position: [
      'Stand upright with room overhead and your arm hanging relaxed at your side.',
      'Hold your phone in your hand with the screen facing toward you.',
      'Tap to zero while your arm hangs straight down.',
    ],
    howTo: [
      'Keep your elbow straight. Raise your arm FORWARD and UP as high as you can go.',
      'Stop when you cannot go higher without leaning back or shrugging. Read the number.',
      'Record it. Shake out your arm. Re-zero. Repeat on the other side.',
    ],
    mistake: 'Leaning your upper body backward or shrugging your shoulder to get the arm higher.',
    mistakeFix: 'Keep your body tall and still. The moment your back starts to arch or your shoulder creeps up toward your ear - that is your true end range. Record it there.',
    fields: [
      { key: 'shoulder_flex_l', label: 'Left', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
      { key: 'shoulder_flex_r', label: 'Right', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
    ],
  },
  {
    id: 'cervical_mob',
    title: 'Cervical Mobility',
    bjjWhy: 'Lateral neck strength protects you in scrambles and headlocks. Flexion and extension matter for bridging, front headlocks, and head control.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Seated in chair  ·  Two setups below',
    position: [
      'Sit upright in a chair. Feet flat. Back straight. Do not let your shoulders move during any of these.',
      'LATERAL FLEXION (ear to shoulder): Hold your phone UPRIGHT on top of your head, bottom edge on your skull, screen facing FORWARD. Hold it steady with one hand. Tap to zero while looking straight ahead.',
      'FLEXION and EXTENSION (chin to chest / chin up): Press your phone flat against your cheek, screen facing the wall beside you. Zero while looking straight ahead.',
    ],
    howTo: [
      'LATERAL FLEXION: Tilt your ear toward your left shoulder as far as you can. Read the number. Re-zero. Tilt to the right. Read and record both.',
      'FLEXION: Switch to cheek hold. Drop your chin toward your chest as far as it will go. Read the number. Record it.',
      'EXTENSION: Re-zero. Lift your chin toward the ceiling as far as it will go. Read the number. Record it.',
    ],
    mistake: 'Shrugging your shoulder up to meet your ear instead of letting the ear drop toward the shoulder.',
    mistakeFix: 'Keep both shoulders pressed DOWN. Only your head moves. If your shoulder rises, that reading does not count.',
    fields: [
      { key: 'cervical_lat_l', label: 'Lateral Left', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
      { key: 'cervical_lat_r', label: 'Lateral Right', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
      { key: 'cervical_flex', label: 'Flexion', unit: '°', normalLow: 50, normalHigh: 60, riskBelow: 40 },
      { key: 'cervical_ext', label: 'Extension', unit: '°', normalLow: 60, normalHigh: 75, riskBelow: 45 },
    ],
  },
  {
    id: 'thoracic_rot',
    title: 'Thoracic Rotation',
    bjjWhy: 'Hip escapes, guard passing hip drive, and armbar rotation all start here.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Seated, lean forward first',
    position: [
      'Sit at the edge of a chair. Feet flat, hip-width apart.',
      'Cross your arms over your chest - hands on opposite shoulders.',
      'LEAN FORWARD about 45° - halfway between sitting straight and bowing to the floor. Hold this lean throughout the measurement.',
      'Have a partner place the phone flat against your upper back (between shoulder blades), screen facing the side wall. Tap to zero. No partner: hold phone on your chest and record the absolute number.',
      'Optional: squeeze a small towel between your knees to prevent hip cheating.',
    ],
    howTo: [
      'From the leaned-forward position, rotate your upper body to the LEFT. Knees must not move.',
      'Stop when your hips start to turn. Have a partner read the angle or screenshot it.',
      'Record it. Return to center. Re-zero. Rotate RIGHT. Repeat.',
    ],
    mistake: 'Spinning your hips to get more rotation.',
    mistakeFix: 'Watch your knees. If either knee shifts, your hips moved. Stop and record that angle.',
    videoUrl: 'https://www.youtube.com/watch?v=HeGIMZU6EnQ',
    videoLabel: 'Thoracic Rotation - Bent-Forward Inclinometer Method (reference video)',
    fields: [
      { key: 'thoracic_rot', label: 'Avg L+R', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 30 },
    ],
  },

  // ── FLOOR CLUSTER ──────────────────────────────────────────────────────────
  {
    id: 'hip_flex',
    title: 'Hip Flexion',
    bjjWhy: 'How deep your closed guard is - closed guard, rubber guard, and armbar position all need this.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Lying on the floor',
    position: [
      'Lie flat on your back on the floor. Both legs straight.',
      'Hold your phone flat on the TOP of your thigh, midway between hip and knee. Screen faces the ceiling.',
      'Tap to zero with your leg flat on the ground.',
    ],
    howTo: [
      'Pull one knee toward your chest using both hands. The phone rides along on your thigh as it rises.',
      'Stop when your low back peels up from the floor or your opposite leg lifts. Read the number.',
      'Record it. Lower the leg. Re-zero. Repeat on the other side.',
    ],
    mistake: 'Letting your low back peel up from the floor too early.',
    mistakeFix: 'Keep your opposite leg completely flat on the ground. When your low back peels up - that is your real endpoint.',
    fields: [
      { key: 'hip_flex_l', label: 'Left', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
      { key: 'hip_flex_r', label: 'Right', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
    ],
  },

  // ── STANDING CLUSTER ───────────────────────────────────────────────────────
  {
    id: 'hip_abd',
    title: 'Hip Abduction',
    bjjWhy: 'Wide guard base, guard recovery, and De La Riva hook depth all depend on this.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Standing with wall support',
    position: [
      'Stand upright. Hold onto a wall or doorframe with one hand for balance.',
      'Hold your phone against the OUTER (lateral) side of your thigh - the side facing away from your other leg. Screen faces outward.',
      'Tap to zero while standing straight with weight even on both feet.',
    ],
    howTo: [
      'Slowly lift your test leg SIDEWAYS - away from your other leg. Keep your toes pointing forward, not toward the ceiling.',
      'Stop when your hip starts to hike up or your body leans to the side. Read the number.',
      'Record it. Return to standing. Re-zero. Repeat on the other side.',
    ],
    mistake: 'Your hip hikes up or your whole body leans sideways to compensate.',
    mistakeFix: 'The hip of the leg you are standing on must stay level. If you feel yourself leaning - stop there. That is your real end range.',
    fields: [
      { key: 'hip_abd_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
      { key: 'hip_abd_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
    ],
  },
  {
    id: 'lumbar',
    title: 'Lumbar Flexion + Extension',
    bjjWhy: 'Guard recovery, hip escapes, and surviving pin pressure all load your lumbar spine.',
    tool: 'iPhone: Measure → Level  ·  Android: Simple Inclinometer  ·  Standing',
    position: [
      'Stand straight, feet shoulder-width apart, toes pointing forward.',
      'Hold your phone flat against your LOWER BACK at belt level, screen facing behind you. Hold it in place with your hand.',
      'Tap to zero while standing tall.',
    ],
    howTo: [
      'FLEXION: Keep your legs straight. Bend forward slowly, reaching toward the floor. Stop when the movement feels like it is coming from your hips rather than your back. Read and record the number.',
      'Return to standing. Re-zero.',
      'EXTENSION: Place your free hand on your lower back. Lean backward slowly. Stop before your knees bend or your hips shoot forward. Read and record the number.',
    ],
    mistake: 'Bending your knees during flexion, or pushing your hips forward during extension.',
    mistakeFix: 'Flexion: keep legs straight. Extension: hips stay directly over your heels - do not let them drift forward.',
    fields: [
      { key: 'lumbar_flex', label: 'Flexion', unit: '°', normalLow: 40, normalHigh: 80, riskBelow: 40 },
      { key: 'lumbar_ext', label: 'Extension', unit: '°', normalLow: 20, normalHigh: 30, riskBelow: 15 },
    ],
  },

  // ── WALL CLUSTER ───────────────────────────────────────────────────────────
  {
    id: 'ankle_df',
    title: 'Ankle Dorsiflexion',
    bjjWhy: 'Your base and balance in every standing position - takedowns, sprawls, and passing guard.',
    tool: 'Tape measure or ruler  ·  Standing knee-to-wall test (measure in centimeters)',
    position: [
      'Stand facing a wall. Put a tape measure on the floor pointing straight away from the wall.',
      'Place the big toe of your test foot directly at the start of the tape (closest to the wall).',
      'Keep your heel completely flat on the floor throughout the test.',
    ],
    howTo: [
      'Drive your knee forward to touch the wall without lifting your heel. If it easily touches: move your foot back 1 cm and try again.',
      'Keep moving back 1 cm at a time until your knee can JUST barely touch the wall with the heel still flat.',
      'The distance from the wall to your big toe at that last successful rep = your ankle dorsiflexion. Record it in cm.',
      'Repeat on the other side.',
    ],
    mistake: 'Your heel lifts off the floor as your knee comes forward.',
    mistakeFix: 'Watch your heel the whole time. If it lifts - move your foot back in closer. The heel must stay flat for the measurement to count.',
    fields: [
      { key: 'ankle_df_l', label: 'Left', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
      { key: 'ankle_df_r', label: 'Right', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
    ],
  },
]

const SETUP_STEPS = [
  { icon: '📱', label: 'iPhone', detail: 'Open the Measure app (pre-installed on all iPhones). Tap Level at the bottom. You will see a number in degrees that changes as you tilt the phone - that is your angle.' },
  { icon: '🤖', label: 'Android', detail: 'Download "Simple Inclinometer" by Syleos Apps - free on Google Play. Open it and you will see your angle in degrees, just like a digital level.' },
  { icon: '🤝', label: 'Partner (recommended)', detail: 'A partner makes this much easier - they hold the phone and read the angle while you focus on moving. You can do it solo using the screenshot tip on each step.' },
  { icon: '🔄', label: 'Warm up first - 5 minutes', detail: '1) Walk or march in place for 2 minutes.  2) Arm circles - 10 forward, 10 backward.  3) Hip circles - big loops with your hips like a hula hoop, 10 each way.  4) Leg swings - hold a wall, swing each leg front-to-back 10 times then side-to-side 10 times.  5) Slow neck turns - look left and right, 5 times each way.  Wear shorts and a t-shirt.' },
  { icon: '📸', label: 'Solo tip', detail: 'When you cannot tap the screen: say "Hey Siri, take a screenshot" (iPhone) or "Hey Google, take a screenshot" (Android). Read the number right after.' },
  { icon: '⏭️', label: 'Skip is always OK', detail: 'If a position is too difficult or you need a partner for a step and do not have one, tap Skip. Your score is based on what you completed. You can always come back and fill in any skipped measurements later.' },
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
          placeholder=""
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
    if (!session) { setError('Session expired - please sign in again.'); return }
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
    setTimeout(() => navigate('/onboarding/results', { replace: true }), 2000)
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
                <p className="text-sm font-semibold text-teal">The method in 4 words: Place. Zero. Move. Read.</p>
                <p className="text-xs text-teal/80 mt-1 leading-relaxed">
                  Hold phone flat against the body part. Tap screen to zero it. Move slowly to your end range. Read the number - ignore any minus sign. Each step tells you exactly where to hold the phone and which direction to move.
                </p>
              </div>
            </div>
          </div>

          <button onClick={() => setPhase('measure')} className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3">
            I'm ready - Start assessment <ChevronRight size={18} />
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
        {/* Cluster label */}
        <div className="flex items-center gap-1.5 text-xs text-charcoal-light">
          <span className="text-[10px] font-bold uppercase tracking-widest text-teal/70">
            {stepIdx === 3 ? '🧍 Standing' : stepIdx <= 5 ? '🪑 Seated' : stepIdx === 6 ? '🛏 Floor' : stepIdx <= 8 ? '🧍 Standing' : '🧱 Wall'}
          </span>
          <span className="text-teal-light">·</span>
          <span>{step.title}</span>
        </div>

        {/* Joint card */}
        <div className="bg-white rounded-2xl border border-teal-light shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-teal px-5 py-4">
            <h2 className="font-display font-bold text-xl text-white">{step.title}</h2>
            <p className="text-teal-light text-xs mt-0.5">{step.bjjWhy}</p>
          </div>

          <div className="p-5 space-y-5">
            {/* Tool / continuation badge */}
            {step.tool.startsWith('✓') ? (
              <div className="flex items-center gap-2 text-xs text-teal font-semibold bg-teal/8 border border-teal/20 rounded-xl px-3 py-2">
                <CheckCircle2 size={14} className="text-teal shrink-0" />
                <span>{step.tool}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-charcoal-light bg-surface rounded-xl px-3 py-2">
                <span className="text-base">📐</span>
                <span className="font-medium">{step.tool}</span>
              </div>
            )}

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

            {/* Hands-free screenshot tip */}
            <p className="text-center text-xs text-charcoal-light">
              📸 Can't tap the screen? Say <span className="font-semibold">&ldquo;Hey Siri, take a screenshot&rdquo;</span> (iPhone) or <span className="font-semibold">&ldquo;Hey Google, take a screenshot&rdquo;</span> (Android).
            </p>

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
