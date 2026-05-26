import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Assessment } from '../hooks/useProfile'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { cn, beltColor, formatJoint } from '../lib/utils'
import { AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react'

// Reference ranges per joint for "optimal" shading
const OPTIMAL: Record<string, number> = {
  'Hip ER':       55,
  'Hip IR':       40,
  'Hip Abd':      50,
  'Hip Flex':    110,
  'Shoulder ER':  80,
  'Shoulder Flex':165,
  'Ankle DF':     15,
  'Lumbar Flex':  50,
  'Lumbar Ext':   25,
  'Cerv Rot':     70,
}

function buildRadarData(a: Assessment) {
  return [
    { joint: 'Hip ER',       value: Math.max(a.hip_er_l ?? 0, a.hip_er_r ?? 0) },
    { joint: 'Hip IR',       value: Math.max(a.hip_ir_l ?? 0, a.hip_ir_r ?? 0) },
    { joint: 'Hip Abd',      value: Math.max(a.hip_abd_l ?? 0, a.hip_abd_r ?? 0) },
    { joint: 'Hip Flex',     value: Math.max(a.hip_flex_l ?? 0, a.hip_flex_r ?? 0) },
    { joint: 'Shoulder ER',  value: Math.max(a.shoulder_er_l ?? 0, a.shoulder_er_r ?? 0) },
    { joint: 'Shoulder Flex',value: Math.max(a.shoulder_flex_l ?? 0, a.shoulder_flex_r ?? 0) },
    { joint: 'Ankle DF',     value: Math.max(a.ankle_df_l ?? 0, a.ankle_df_r ?? 0) },
    { joint: 'Lumbar Flex',  value: a.lumbar_flex ?? 0 },
    { joint: 'Lumbar Ext',   value: a.lumbar_ext ?? 0 },
    { joint: 'Cerv Rot',     value: Math.max(a.cervical_rot_l ?? 0, a.cervical_rot_r ?? 0) },
  ]
}

interface JointRowProps {
  label: string
  left?: number | null
  right?: number | null
  midline?: number | null
  optimal: number
}

function JointRow({ label, left, right, midline, optimal }: JointRowProps) {
  const best = midline ?? Math.max(left ?? 0, right ?? 0)
  const pct = Math.min(100, Math.round((best / optimal) * 100))
  const asymmetry = left != null && right != null ? Math.abs(left - right) : 0
  const isFlag = pct < 75

  return (
    <div className={cn('flex items-center gap-3 py-2.5 px-3 rounded-xl', isFlag ? 'bg-red-50' : 'bg-white border border-teal-light')}>
      <div className="w-28 shrink-0">
        <p className={cn('text-xs font-semibold', isFlag ? 'text-red-tier' : 'text-charcoal')}>{label}</p>
        {asymmetry > 10 && (
          <p className="text-xs text-yellow-tier flex items-center gap-0.5 mt-0.5">
            <AlertTriangle size={10} /> {asymmetry}° asymmetry
          </p>
        )}
      </div>
      <div className="flex-1">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-teal' : pct >= 75 ? 'bg-gold' : 'bg-red-400')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="w-24 text-right shrink-0">
        {midline != null ? (
          <span className="text-xs text-charcoal-light">{midline}°</span>
        ) : (
          <span className="text-xs text-charcoal-light">{left}° / {right}°</span>
        )}
      </div>
      <div className="w-12 text-right shrink-0">
        <span className={cn('text-xs font-bold', pct >= 100 ? 'text-teal' : pct >= 75 ? 'text-gold' : 'text-red-tier')}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

export function MyBody() {
  const { user } = useAuth()
  const { profile, assessment, loading } = useProfile(user?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="card text-center py-12">
        <TrendingDown size={40} className="text-charcoal-light mx-auto mb-3" />
        <h2 className="font-display font-bold text-lg text-charcoal mb-2">No assessment yet</h2>
        <p className="text-sm text-charcoal-light mb-4">Complete your initial ROM assessment to see your body map.</p>
        <a href="/onboarding/assessment" className="btn-primary inline-block">Start assessment</a>
      </div>
    )
  }

  const radarData = buildRadarData(assessment)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-charcoal">My Body</h1>
          <p className="text-sm text-charcoal-light mt-0.5">
            Assessed {new Date(assessment.assessed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase', beltColor(profile?.belt ?? 'white'))}>
          {profile?.belt ?? 'white'} belt
        </span>
      </div>

      {/* Red flag banner */}
      {assessment.red_flag_triggered && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle size={20} className="text-red-tier mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-tier">Movement red flags detected</p>
            <p className="text-xs text-red-tier mt-0.5">{assessment.red_flag_reasons?.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Radar + stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-charcoal mb-3">ROM Profile</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e0ecec" />
              <PolarAngleAxis dataKey="joint" tick={{ fontSize: 11, fill: '#5a7070' }} />
              <Radar
                dataKey="value"
                stroke="#008080"
                fill="#008080"
                fillOpacity={0.25}
                dot={{ fill: '#008080', r: 3 }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e0ecec' }}
                formatter={(v) => [`${v}°`, 'ROM']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="card flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-charcoal mb-4">Quick stats</h3>
          <div className="space-y-3">
            {assessment.rom_total != null && (
              <StatRow label="ROM Total Score" value={`${assessment.rom_total}`} icon={<CheckCircle2 size={16} className="text-teal" />} />
            )}
            {assessment.rom_percentile != null && (
              <StatRow label="Percentile" value={`${assessment.rom_percentile}th`} />
            )}
            {assessment.worst_joints && assessment.worst_joints.length > 0 && (
              <div>
                <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-1">Priority joints</p>
                <div className="flex flex-wrap gap-1.5">
                  {assessment.worst_joints.map(j => (
                    <span key={j} className="text-xs bg-red-tier-bg text-red-tier px-2 py-0.5 rounded-full font-medium">
                      {formatJoint(j)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Joint breakdown */}
      <div className="card">
        <h3 className="text-sm font-semibold text-charcoal mb-3">Joint breakdown</h3>
        <div className="space-y-1.5">
          <JointRow label="Hip ER"        left={assessment.hip_er_l}       right={assessment.hip_er_r}       optimal={OPTIMAL['Hip ER']} />
          <JointRow label="Hip IR"        left={assessment.hip_ir_l}       right={assessment.hip_ir_r}       optimal={OPTIMAL['Hip IR']} />
          <JointRow label="Hip Abduction" left={assessment.hip_abd_l}      right={assessment.hip_abd_r}      optimal={OPTIMAL['Hip Abd']} />
          <JointRow label="Hip Flexion"   left={assessment.hip_flex_l}     right={assessment.hip_flex_r}     optimal={OPTIMAL['Hip Flex']} />
          <JointRow label="Shoulder ER"   left={assessment.shoulder_er_l}  right={assessment.shoulder_er_r}  optimal={OPTIMAL['Shoulder ER']} />
          <JointRow label="Shoulder Flex" left={assessment.shoulder_flex_l} right={assessment.shoulder_flex_r} optimal={OPTIMAL['Shoulder Flex']} />
          <JointRow label="Ankle DF"      left={assessment.ankle_df_l}     right={assessment.ankle_df_r}     optimal={OPTIMAL['Ankle DF']} />
          <JointRow label="Lumbar Flex"   midline={assessment.lumbar_flex}  optimal={OPTIMAL['Lumbar Flex']} />
          <JointRow label="Lumbar Ext"    midline={assessment.lumbar_ext}   optimal={OPTIMAL['Lumbar Ext']} />
          <JointRow label="Cervical Rot"  left={assessment.cervical_rot_l} right={assessment.cervical_rot_r} optimal={OPTIMAL['Cerv Rot']} />
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-teal-light last:border-0">
      <span className="text-sm text-charcoal-light flex items-center gap-1.5">{icon}{label}</span>
      <span className="text-sm font-semibold text-charcoal">{value}</span>
    </div>
  )
}
