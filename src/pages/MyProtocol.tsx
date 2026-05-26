import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { cn } from '../lib/utils'
import {
  AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, Circle,
  ClipboardList, Dumbbell, Flame, PersonStanding, ExternalLink,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Rx {
  name: string
  dose: string        // e.g. "3 sets × 15 reps" or "Hold 60 sec · 2 sets"
  cue: string
  equipment: string
  videoUrl?: string
}
interface Prescription {
  exercises: [Rx, Rx, Rx]
  stretches: [Rx, Rx]
  foam: Rx
}

// ── Prescription library (sourced from ROMRx Exercise Library Google Drive doc) ─
const RX: Record<string, Prescription> = {
  hip_er: {
    exercises: [
      {
        name: 'Clamshell with Band',
        dose: '3 sets × 15–20 reps each side',
        cue: 'Keep feet stacked and hips completely still — only the top knee opens. Squeeze glute at top for 2 seconds.',
        equipment: 'Resistance band',
      },
      {
        name: 'Seated Banded Hip External Rotation',
        dose: '3 sets × 10–12 reps each side',
        cue: 'Yoga block between knees, rotate foot inward (thigh externally rotates). Hold 2 seconds at end range.',
        equipment: 'Resistance band, yoga block',
      },
      {
        name: 'Standing Hip CARs (Controlled Articular Rotations)',
        dose: '3–5 reps each direction per side, daily',
        cue: 'Draw the largest possible circle with your knee. Slow and controlled — this is neurological training.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Supine Figure-4 Stretch (Piriformis)',
        dose: '2–3 sets · hold 30–60 sec each side',
        cue: 'Cross ankle over opposite thigh. Pull bottom thigh toward chest. Head and shoulders stay relaxed on floor.',
        equipment: 'Bodyweight',
      },
      {
        name: '90/90 Hip External Rotation Stretch',
        dose: '1–2 sets · hold 60–90 sec each side',
        cue: 'Front shin parallel to body. Lean chest forward over shin with a flat back. Deep stretch in the posterior hip.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Piriformis / Glute Foam Roll',
      dose: '60–90 sec per side',
      cue: 'Sit in figure-4 on roller, tilt toward the crossed leg. Hold on tender spots 15–20 seconds until release.',
      equipment: 'Foam roller',
    },
  },

  hip_ir: {
    exercises: [
      {
        name: 'Seated Banded Hip Internal Rotation',
        dose: '3 sets × 8–12 reps each side',
        cue: 'Block between knees, rotate foot outward (thigh internally rotates). Hold contraction 5–7 seconds.',
        equipment: 'Resistance band, yoga block',
      },
      {
        name: 'Quadruped Band-Assisted Hip IR Mobilization',
        dose: '3 sets × 10 reps each side',
        cue: 'Band assists the stretch on the way out, resist on the way in (PAILS/RAILS). This builds active end-range control.',
        equipment: 'Resistance band',
      },
      {
        name: '90/90 Hip Switches',
        dose: '8–10 transitions, daily warm-up',
        cue: 'Lift both knees slightly and rotate hips smoothly side to side. Control the landing — do not collapse.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: '90/90 Internal Rotation Stretch',
        dose: '2–3 sets · hold 30–60 sec each side',
        cue: 'Lean back toward trail leg, push trail knee gently toward floor. Rotation comes from hip, not torso.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Prone Hip IR Gravity Stretch',
        dose: '1–2 sets · hold 60 sec',
        cue: 'Face down, knees bent 90°, feet fall outward. Keep hip bones pressed into floor. Let gravity do the work.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'TFL / Lateral Hip Foam Roll',
      dose: '60–90 sec per side',
      cue: 'Roller under lateral hip between hip bone and greater trochanter. Rotate slightly forward/back to find different fibers.',
      equipment: 'Foam roller',
    },
  },

  hip_abd: {
    exercises: [
      {
        name: 'Side-Lying Hip Abduction with Band',
        dose: '3 sets × 15 reps each side',
        cue: 'Lead with the heel, foot flexed. Hips stacked — do not roll backward. This is a small, controlled movement.',
        equipment: 'Resistance band',
      },
      {
        name: 'Lateral Band Walks',
        dose: '3 sets × 10–15 steps each direction',
        cue: 'Quarter squat position. Step with heel first, keep band taut. Do not let knees cave inward.',
        equipment: 'Resistance band',
      },
      {
        name: 'Goblet Squat Wide Stance (Pause at Bottom)',
        dose: '3 sets × 8 reps with 3-sec pause',
        cue: 'Elbows push knees out at the bottom. Heels down, chest up. This is both a strength and mobility drill.',
        equipment: 'Kettlebell',
      },
    ],
    stretches: [
      {
        name: 'Frog Stretch',
        dose: '2–3 sets · hold 45–60 sec',
        cue: 'Slowly widen knees, inner arches flat. Lower to elbows and rock hips slowly backward to deepen.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Standing Side Lunge Adductor Stretch',
        dose: '2–3 sets · hold 30 sec each side',
        cue: 'Feet very wide, shift weight to one side with bent knee. Keep opposite leg fully straight, foot flat.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Adductor (Inner Thigh) Foam Roll',
      dose: '60–90 sec per side',
      cue: 'Face down, one leg in frog position. Roll slow from near groin toward knee. Hold tender spots 30–60 sec.',
      equipment: 'Foam roller',
    },
  },

  hip_flex: {
    exercises: [
      {
        name: 'Goblet Squat with Pause at Bottom',
        dose: '3 sets × 8 reps · 3–5 sec pause',
        cue: 'Counterbalance allows deeper range. At the bottom, stay relaxed and breathe. Do not bounce out.',
        equipment: 'Kettlebell',
      },
      {
        name: '90/90 Front Leg Hip Flexor Hold',
        dose: '3 sets × 8–10 reps each side',
        cue: 'In 90/90 position, lift front foot 1–2 inches using only hip flexor. No hands. Hold 5 seconds.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Standing Knee Drive with Band',
        dose: '3 sets × 12–15 reps each side',
        cue: 'Band anchored behind you. Drive knee as high as possible. Psoas training — not just a warm-up drill.',
        equipment: 'Resistance band',
      },
    ],
    stretches: [
      {
        name: 'Kneeling Hip Flexor Lunge Stretch',
        dose: '2–3 sets · hold 30–60 sec each side',
        cue: 'Back knee on pad, tuck pelvis under (posterior tilt). Shift hips forward while maintaining the tuck — no arch.',
        equipment: 'Pad / mat',
      },
      {
        name: 'Supine Knee-to-Chest Stretch',
        dose: '2 sets · hold 30–60 sec each side',
        cue: 'Low back stays flat on floor. Gently pull knee toward same-side shoulder. Breathe and relax into it.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Quadriceps / Rectus Femoris Foam Roll',
      dose: '60–90 sec per leg',
      cue: 'Face down, roller under front of thighs. Roll hip crease to above knee. Bend knee on tender spots to enhance release.',
      equipment: 'Foam roller',
    },
  },

  shoulder_er: {
    exercises: [
      {
        name: 'Side-Lying Shoulder External Rotation',
        dose: '3 sets × 12–15 reps each side',
        cue: 'Elbow pinned to side, roll of towel under arm for neutral position. Rotate forearm upward. Small, precise movement.',
        equipment: 'Resistance band',
      },
      {
        name: 'Band Face Pull with External Rotation',
        dose: '3 sets × 12–15 reps',
        cue: 'Pull band to face while rotating thumbs back. Finish with hands beside ears. Squeeze shoulder blades at the end.',
        equipment: 'Resistance band',
      },
      {
        name: 'Prone Y Raise',
        dose: '3 sets × 10–12 reps · hold 5–7 sec at top',
        cue: 'Arms at 130–140° (Y shape), thumbs toward ceiling. This is scapular training, not just a lift. Squeeze blades.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Doorway Pec Stretch',
        dose: '3–5 sets · hold 30 sec (total 90–150 sec)',
        cue: 'Elbows at shoulder height on door frame. Lean chest through. Research shows 150 seconds adds up to 6° of ER.',
        equipment: 'Doorway',
      },
      {
        name: 'Sleeper Stretch',
        dose: '2–3 sets · hold 30–45 sec each side',
        cue: 'Lie on side, top hand gently presses bottom forearm toward floor. Keep shoulder flat — do not roll forward.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Posterior Shoulder Release (Lacrosse Ball)',
      dose: '60–90 sec per side',
      cue: 'Ball between spine of scapula and arm. Make small arm circles while on tender spots. Hold 30–45 sec each point.',
      equipment: 'Lacrosse ball or firm ball',
    },
  },

  shoulder_flex: {
    exercises: [
      {
        name: 'Wall Slide (Forearm Version)',
        dose: '3 sets × 10–12 reps',
        cue: 'Back against wall, forearms slide up. Keep shoulder blades down — do not shrug. This trains scapular upward rotation.',
        equipment: 'Bodyweight / wall',
      },
      {
        name: 'Prone Y Raise',
        dose: '3 sets × 10–12 reps · hold 5–7 sec at top',
        cue: 'Arms in Y at 130–140°. Lift by moving shoulder blades first, then arms. Lower trapezius is the target.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Kettlebell Arm Bar',
        dose: '3 sets · hold 20–30 sec each side',
        cue: 'Light kettlebell pressed to ceiling. Roll to side while keeping arm vertical. Shoulder stays packed throughout.',
        equipment: 'Light kettlebell',
      },
    ],
    stretches: [
      {
        name: "Child's Pose Lat Stretch",
        dose: '2–3 sets · hold 45–60 sec',
        cue: 'Arms extended overhead on floor, sit back toward heels. Walk hands to one side for unilateral lat stretch.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Overhead Band Distraction Stretch',
        dose: '2–3 sets · hold 30–45 sec each side',
        cue: 'Anchor band overhead. Loop around wrist and step away until shoulder is distracted upward. Breathe and relax.',
        equipment: 'Resistance band',
      },
    ],
    foam: {
      name: 'Thoracic Spine Foam Roll with Arms Overhead',
      dose: '60–90 sec, segment by segment',
      cue: 'Roller across mid/upper back, arms crossed or overhead. Roll 1 inch at a time, pausing at stiff segments.',
      equipment: 'Foam roller',
    },
  },

  ankle_df: {
    exercises: [
      {
        name: 'Banded Ankle Dorsiflexion Mobilization',
        dose: '3 sets × 10–15 reps each side',
        cue: 'Band around ankle anchored behind. Lunge forward until knee tracks over pinky toe. Band distracts joint posteriorly.',
        equipment: 'Resistance band',
      },
      {
        name: 'Eccentric Calf Raises (Off Step)',
        dose: '3 sets × 12–15 reps each side',
        cue: 'Rise on both feet, lower on one. Control the descent fully. Heel drops below step level for full range.',
        equipment: 'Step / stairs',
      },
      {
        name: 'Deep Squat Hold (Heel Elevated if Needed)',
        dose: '3 × 60 sec daily',
        cue: 'Weight through heels, knees out, chest up. Progressively lower your heel elevation over weeks.',
        equipment: 'Bodyweight (small plate under heels if needed)',
      },
    ],
    stretches: [
      {
        name: 'Wall Ankle DF Stretch (Knee Over Toe)',
        dose: '2–3 sets · hold 30–45 sec each side',
        cue: 'Foot close to wall, knee touches wall while heel stays flat. Move foot further as flexibility improves.',
        equipment: 'Bodyweight / wall',
      },
      {
        name: 'Runner\'s Calf Stretch (Straight + Bent Knee)',
        dose: '2 sets each variation · hold 30 sec each side',
        cue: 'Straight knee hits gastrocnemius, bent knee hits soleus. Both must be addressed for true ankle DF gain.',
        equipment: 'Bodyweight / wall',
      },
    ],
    foam: {
      name: 'Calf / Gastrocnemius Foam Roll',
      dose: '60–90 sec per leg',
      cue: 'Roller under calf, cross opposite leg on top to increase pressure. Roll slowly, hold on tender spots.',
      equipment: 'Foam roller',
    },
  },

  lumbar: {
    exercises: [
      {
        name: 'Cat-Cow (Segmental Lumbar Mobilization)',
        dose: '3 sets × 10 slow reps, daily',
        cue: 'Focus on moving one vertebra at a time. Exhale into flexion, inhale into extension. Never rush this.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Bird Dog (Opposite Arm/Leg)',
        dose: '3 sets × 10 reps each side · hold 3 sec',
        cue: 'Core braced before moving. Reach long, not high. Hips stay level — a glass of water should not spill.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Deadbug',
        dose: '3 sets × 8 reps each side',
        cue: 'Low back pressed into floor the entire set. Breathe out as you lower limbs. Never let the arch return.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Supine Knees-to-Chest Lumbar Decompression',
        dose: '2–3 sets · hold 60 sec',
        cue: 'Both knees pulled to chest, low back flat. Rock side to side gently. Let the lumbar musculature fully release.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Cobra / Press-Up (Lumbar Extension Mob)',
        dose: '3 sets × 10 press-ups',
        cue: 'Hands under shoulders, hips stay on floor. Press up with arms, let the back relax — passive extension.',
        equipment: 'Bodyweight / mat',
      },
    ],
    foam: {
      name: 'Thoracic + Lumbar Junction Foam Roll',
      dose: '60–90 sec, working T12–L2 area',
      cue: 'Roller across mid-low back. Arms crossed on chest. Extend gently over roller, breathe deeply into each segment.',
      equipment: 'Foam roller',
    },
  },

  cervical_rot: {
    exercises: [
      {
        name: 'Cervical CARs (Controlled Articular Rotations)',
        dose: '3–5 reps each direction, daily',
        cue: 'Chin traces the largest circle possible in slow motion. Pause and breathe at each end-range position.',
        equipment: 'Bodyweight',
      },
      {
        name: 'SCM Strengthening (Isometric Side Resistance)',
        dose: '3 sets × 5 reps · hold 10 sec each side',
        cue: 'Hand against temple, resist rotation without moving. Keep jaw relaxed. Equal tension both sides.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Deep Neck Flexor Chin Tuck',
        dose: '3 sets × 10 reps · hold 5 sec',
        cue: 'Make a double chin by drawing the head straight back. No nodding — pure retraction. Targets longus colli.',
        equipment: 'Bodyweight',
      },
    ],
    stretches: [
      {
        name: 'Lateral Neck Stretch (SCM / Scalene)',
        dose: '2–3 sets · hold 30–45 sec each side',
        cue: 'Ear toward shoulder, gently anchor opposite shoulder down. No rotation, pure lateral flexion.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Suboccipital Release Stretch',
        dose: '2 sets · hold 45 sec',
        cue: 'Chin tuck then slowly nod chin toward chest. Hands laced behind head for gentle overpressure. Breathe.',
        equipment: 'Bodyweight',
      },
    ],
    foam: {
      name: 'Suboccipital Release (Tennis Ball / Small Ball)',
      dose: '60–90 sec',
      cue: 'Two tennis balls taped together (or a double ball). Place at base of skull, lie back. Slow yes-no movements.',
      equipment: 'Two tennis balls or massage ball',
    },
  },

  thoracic_rot: {
    exercises: [
      {
        name: 'Open Books (Side-Lying Thoracic Rotation)',
        dose: '3 sets × 10 reps each side',
        cue: 'Hips stacked, knees together. Top arm sweeps to ceiling and beyond. Eyes follow the hand. Breathe into the rotation.',
        equipment: 'Bodyweight / mat',
      },
      {
        name: 'Thread-the-Needle',
        dose: '3 sets × 8 reps each side · hold 3 sec at end',
        cue: 'Quadruped start. One arm threads under the body until shoulder touches floor. Keep hips square.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Seated Thoracic Rotation with Stick',
        dose: '3 sets × 10 reps each side',
        cue: 'Sit on chair, stick across shoulders. Rotate as far as possible WITHOUT hips moving. Slow and controlled.',
        equipment: 'PVC pipe or broomstick',
      },
    ],
    stretches: [
      {
        name: 'Quadruped Thoracic Rotation Stretch',
        dose: '2–3 sets · hold 30 sec each side',
        cue: 'One hand behind head. Rotate elbow toward ceiling as far as possible. Hip stays over knee — it does not twist.',
        equipment: 'Bodyweight',
      },
      {
        name: 'Foam Roller Thoracic Extension + Rotation',
        dose: '60 sec per side',
        cue: 'Roller perpendicular to spine at mid-back. Hands behind head. Drop one knee to floor for rotation component.',
        equipment: 'Foam roller',
      },
    ],
    foam: {
      name: 'Thoracic Spine Foam Roll (Segmental)',
      dose: '90 sec, segment by segment T4–T10',
      cue: 'Arms crossed on chest. Hinge back over roller one inch at a time. Breathe into each stiff segment before moving.',
      equipment: 'Foam roller',
    },
  },
}

// ── Joint config ──────────────────────────────────────────────────────────────
interface JointDef {
  key: string
  label: string
  bjjWhy: string
  leftKey?: string
  rightKey?: string
  singleKey?: string
  normalMin: number
  normalMax: number
  riskBelow: number
  unit: string
  rxKey: string
}

const JOINTS: JointDef[] = [
  {
    key: 'hip_er', label: 'Hip External Rotation',
    bjjWhy: 'Triangles, De La Riva guard, seated guard mobility',
    leftKey: 'hip_er_l', rightKey: 'hip_er_r',
    normalMin: 40, normalMax: 60, riskBelow: 40, unit: '°', rxKey: 'hip_er',
  },
  {
    key: 'hip_ir', label: 'Hip Internal Rotation',
    bjjWhy: 'Guard passing, knee cuts, hip switches in scrambles',
    leftKey: 'hip_ir_l', rightKey: 'hip_ir_r',
    normalMin: 30, normalMax: 45, riskBelow: 30, unit: '°', rxKey: 'hip_ir',
  },
  {
    key: 'hip_abd', label: 'Hip Abduction',
    bjjWhy: 'Mount stability, open guard hooks, wide base positions',
    leftKey: 'hip_abd_l', rightKey: 'hip_abd_r',
    normalMin: 40, normalMax: 50, riskBelow: 30, unit: '°', rxKey: 'hip_abd',
  },
  {
    key: 'hip_flex', label: 'Hip Flexion',
    bjjWhy: 'Closed guard, armbar mechanics, guard retention',
    leftKey: 'hip_flex_l', rightKey: 'hip_flex_r',
    normalMin: 100, normalMax: 120, riskBelow: 100, unit: '°', rxKey: 'hip_flex',
  },
  {
    key: 'shoulder_er', label: 'Shoulder External Rotation',
    bjjWhy: 'Defending Americana / Kimura, grip fighting, frames',
    leftKey: 'shoulder_er_l', rightKey: 'shoulder_er_r',
    normalMin: 60, normalMax: 90, riskBelow: 60, unit: '°', rxKey: 'shoulder_er',
  },
  {
    key: 'shoulder_flex', label: 'Shoulder Flexion',
    bjjWhy: 'Spider guard, overhead sweeps, rear naked choke mechanics',
    leftKey: 'shoulder_flex_l', rightKey: 'shoulder_flex_r',
    normalMin: 140, normalMax: 180, riskBelow: 120, unit: '°', rxKey: 'shoulder_flex',
  },
  {
    key: 'ankle_df', label: 'Ankle Dorsiflexion',
    bjjWhy: 'Base, balance, and proprioception in every standing position',
    leftKey: 'ankle_df_l', rightKey: 'ankle_df_r',
    normalMin: 10, normalMax: 20, riskBelow: 10, unit: 'cm', rxKey: 'ankle_df',
  },
  {
    key: 'cervical_rot', label: 'Cervical Rotation',
    bjjWhy: 'Awareness, safety, and avoiding neck injury in scrambles',
    leftKey: 'cervical_rot_l', rightKey: 'cervical_rot_r',
    normalMin: 70, normalMax: 90, riskBelow: 60, unit: '°', rxKey: 'cervical_rot',
  },
  {
    key: 'lumbar', label: 'Lumbar Spine',
    bjjWhy: 'Bridging, guard recovery, turtle position, back escapes',
    singleKey: 'lumbar_flex',
    normalMin: 40, normalMax: 80, riskBelow: 40, unit: '°', rxKey: 'lumbar',
  },
  {
    key: 'thoracic_rot', label: 'Thoracic Rotation',
    bjjWhy: 'Hip escapes, guard recovery, back take entries',
    singleKey: 'thoracic_rot',
    normalMin: 40, normalMax: 60, riskBelow: 30, unit: '°', rxKey: 'thoracic_rot',
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────────
interface ScoredJoint {
  def: JointDef
  left: number | null
  right: number | null
  single: number | null
  asymmetry: number
  severity: number          // degrees/cm below normalMin (0 if functional)
  atRisk: boolean
  gap: string               // human-readable "L 28° vs R 37°  ·  9° gap"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreJoints(assessment: Record<string, any>): ScoredJoint[] {
  return JOINTS.map(def => {
    const left  = def.leftKey   ? (assessment[def.leftKey]  ?? null) : null
    const right = def.rightKey  ? (assessment[def.rightKey] ?? null) : null
    const single = def.singleKey ? (assessment[def.singleKey] ?? null) : null

    let asymmetry = 0
    let severity  = 0
    let atRisk    = false
    let gap       = ''

    if (left !== null && right !== null) {
      asymmetry = Math.abs(left - right)
      const worst = Math.min(left, right)
      severity = Math.max(0, def.normalMin - worst)
      atRisk   = worst < def.riskBelow
      const { unit } = def
      gap = `L ${left}${unit}  vs  R ${right}${unit}  ·  ${asymmetry}${unit} gap`
    } else if (single !== null) {
      severity = Math.max(0, def.normalMin - single)
      atRisk   = single < def.riskBelow
      gap = `${single}${def.unit}  (normal ≥ ${def.normalMin}${def.unit})`
    }

    // Primary: asymmetry  Secondary: severity
    return { def, left, right, single, asymmetry, severity, atRisk, gap }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────
function RxItem({
  label, icon: Icon, color, items,
}: {
  label: string
  icon: React.ElementType
  color: string
  items: Rx[]
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false))

  const toggle = (i: number) => setOpenIdx(o => o === i ? null : i)
  const check  = (i: number) => setChecked(c => c.map((v, idx) => idx === i ? !v : v))

  return (
    <div>
      <div className={cn('flex items-center gap-2 mb-2.5', color)}>
        <Icon size={14} className="shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="space-y-2">
        {items.map((rx, i) => (
          <div key={i} className={cn(
            'rounded-xl border transition-colors overflow-hidden',
            checked[i] ? 'border-teal/20 bg-teal/[0.03]' : 'border-teal-light bg-white'
          )}>
            <div className="flex items-start gap-3 px-3.5 py-3">
              <button onClick={() => check(i)} className="mt-0.5 shrink-0 text-teal hover:scale-110 transition-transform">
                {checked[i]
                  ? <CheckCircle2 size={17} fill="currentColor" strokeWidth={0} />
                  : <Circle size={17} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={cn('text-sm font-semibold leading-snug', checked[i] ? 'line-through text-charcoal-light' : 'text-charcoal')}>
                    {rx.name}
                  </p>
                  <button onClick={() => toggle(i)} className="text-charcoal-light hover:text-teal transition-colors mt-0.5 shrink-0">
                    {openIdx === i ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-xs bg-teal-light text-teal font-semibold px-2.5 py-0.5 rounded-full">{rx.dose}</span>
                  {rx.equipment && rx.equipment !== 'Bodyweight' && (
                    <span className="text-xs bg-surface text-charcoal-light px-2.5 py-0.5 rounded-full">{rx.equipment}</span>
                  )}
                </div>
                {openIdx === i && (
                  <div className="mt-2.5 pt-2.5 border-t border-teal-light space-y-2">
                    <p className="text-xs text-charcoal-light leading-relaxed">
                      <span className="font-semibold text-charcoal">Coaching cue: </span>{rx.cue}
                    </p>
                    {rx.videoUrl && (
                      <a href={rx.videoUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-teal font-medium hover:underline">
                        <ExternalLink size={10} /> Watch demo
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IssueCard({ ranked, rank }: { ranked: ScoredJoint; rank: number }) {
  const [open, setOpen] = useState(rank === 1)
  const { def, left, right, single, atRisk, asymmetry, severity } = ranked
  const rx = RX[def.rxKey]

  const rankLabel = rank === 1 ? '#1 Priority' : rank === 2 ? '#2 Priority' : '#3 Priority'
  const rankColor = rank === 1 ? 'bg-red-tier text-white' : rank === 2 ? 'bg-yellow-tier text-white' : 'bg-teal text-white'

  const hasAsymmetry = left !== null && right !== null && asymmetry > 0

  return (
    <div className="bg-white rounded-2xl border border-teal-light shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left"
      >
        <div className="px-5 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', rankColor)}>
                {rankLabel}
              </span>
              {atRisk && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-tier bg-red-tier-bg px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <AlertTriangle size={9} /> AT RISK
                </span>
              )}
            </div>
            <h3 className="font-display font-bold text-charcoal text-base leading-snug">{def.label}</h3>
            <p className="text-xs text-charcoal-light mt-0.5">{def.bjjWhy}</p>
          </div>
          <div className="shrink-0 text-charcoal-light mt-1">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-5 pb-4 flex flex-wrap gap-3">
          {hasAsymmetry ? (
            <>
              <div className="bg-surface rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Left</p>
                <p className={cn('text-sm font-bold', (left ?? 0) < def.riskBelow ? 'text-red-tier' : (left ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-teal')}>
                  {left}{def.unit}
                </p>
              </div>
              <div className="bg-surface rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Right</p>
                <p className={cn('text-sm font-bold', (right ?? 0) < def.riskBelow ? 'text-red-tier' : (right ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-teal')}>
                  {right}{def.unit}
                </p>
              </div>
              <div className="bg-yellow-tier-bg rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-yellow-tier font-bold uppercase tracking-wide">Asymmetry</p>
                <p className="text-sm font-bold text-yellow-tier">{asymmetry}{def.unit} gap</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-surface rounded-xl px-3 py-1.5">
                <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Value</p>
                <p className={cn('text-sm font-bold', (single ?? 0) < def.riskBelow ? 'text-red-tier' : (single ?? 0) < def.normalMin ? 'text-yellow-tier' : 'text-teal')}>
                  {single}{def.unit}
                </p>
              </div>
              {severity > 0 && (
                <div className="bg-red-tier-bg rounded-xl px-3 py-1.5">
                  <p className="text-[10px] text-red-tier font-bold uppercase tracking-wide">Below Normal</p>
                  <p className="text-sm font-bold text-red-tier">{severity}{def.unit}</p>
                </div>
              )}
            </>
          )}
          <div className="bg-surface rounded-xl px-3 py-1.5">
            <p className="text-[10px] text-charcoal-light font-medium uppercase tracking-wide">Normal</p>
            <p className="text-xs font-semibold text-charcoal">{def.normalMin}–{def.normalMax}{def.unit}</p>
          </div>
        </div>
      </button>

      {/* Prescription */}
      {open && rx && (
        <div className="px-5 pb-5 border-t border-teal-light pt-4 space-y-5">
          <RxItem label="Exercises (3)" icon={Dumbbell} color="text-teal" items={rx.exercises} />
          <RxItem label="Stretches (2)" icon={PersonStanding} color="text-teal/70" items={rx.stretches} />
          <RxItem label="Foam Rolling (1)" icon={Flame} color="text-charcoal-light" items={[rx.foam]} />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function MyProtocol() {
  const { user } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assessment, setAssessment] = useState<Record<string, any> | null>(null)
  const [loading, setLoading]       = useState(true)
  const [assessedAt, setAssessedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase.rpc('get_my_profile')
      if (data?.assessment) {
        setAssessment(data.assessment)
        setAssessedAt(data.assessment.assessed_at ?? null)
      }
      setLoading(false)
    })()
  }, [user])

  if (loading) return <Spinner />

  if (!assessment) return (
    <EmptyState
      icon={ClipboardList}
      title="No assessment yet"
      description="Complete your ROM assessment and your personal injury-prevention protocol will appear here."
    />
  )

  const scored = scoreJoints(assessment)
  const hasData = scored.some(s => s.left !== null || s.right !== null || s.single !== null)

  if (!hasData) return (
    <EmptyState
      icon={ClipboardList}
      title="Assessment processing"
      description="Your protocol will generate once assessment data has been processed."
    />
  )

  // Rank: asymmetry DESC, then severity DESC, only joints with data
  const ranked = scored
    .filter(s => s.left !== null || s.right !== null || s.single !== null)
    .sort((a, b) => {
      if (b.asymmetry !== a.asymmetry) return b.asymmetry - a.asymmetry
      return b.severity - a.severity
    })
    .slice(0, 3)

  const dateStr = assessedAt
    ? new Date(assessedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Recent assessment'

  return (
    <div className="space-y-5">
      <PageHeader title="My Protocol" subtitle={`Based on assessment · ${dateStr}`} />

      {/* Asymmetry context card */}
      <div className="bg-yellow-tier-bg border border-yellow-200 rounded-2xl p-4 flex gap-3">
        <AlertTriangle size={16} className="text-yellow-tier shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-yellow-tier">Asymmetry is the #1 predictor of injury</p>
          <p className="text-xs text-yellow-700 mt-1 leading-relaxed">
            Your protocol targets the 3 joints with the largest side-to-side gaps and worst deficit — ranked by injury risk. Address these before anything else.
          </p>
        </div>
      </div>

      {/* Top 3 issue cards */}
      <div className="space-y-4">
        {ranked.map((r, i) => (
          <IssueCard key={r.def.key} ranked={r} rank={i + 1} />
        ))}
      </div>

      <p className="text-center text-xs text-charcoal-light pb-2">
        Protocol auto-updates with each new assessment. Retest every 4–6 weeks.
      </p>
    </div>
  )
}
