import { formatJoint } from '../../lib/utils'

type Status = 'GREEN' | 'YELLOW' | 'RED' | 'GREY'

const CHIP: Record<Status, string> = {
  GREEN: 'bg-green-tier-bg text-green-tier',
  YELLOW: 'bg-yellow-tier-bg text-yellow-tier',
  RED: 'bg-red-tier-bg text-red-tier',
  GREY: 'bg-gray-100 text-gray-600',
}
const WORD: Record<Status, string> = { GREEN: 'Green', YELLOW: 'Yellow', RED: 'Red', GREY: 'Not measured' }
const GREY_REASON: Record<string, string> = {
  no_rule: 'No range requirement set for this technique yet.',
  incomplete: 'Some required joints are not measured yet.',
}

// Per-joint G/Y/R against THIS technique's requirement. Names and colors only (no degrees, no thresholds).
export function JointChips({ joints, tier, reason }: {
  joints?: { joint: string; status: Status }[] | null
  tier: string
  reason?: string | null
}) {
  const list = joints ?? []
  if (list.length === 0 && tier !== 'GREY') return null
  return (
    <div className="pt-2 border-t border-teal-light/60">
      <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide">Joints for this technique</span>
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {list.map(j => (
            <span key={j.joint} className={`text-[11px] px-2 py-0.5 rounded-full ${CHIP[j.status]}`}>
              {formatJoint(j.joint)}: {WORD[j.status]}
            </span>
          ))}
        </div>
      )}
      {tier === 'GREY' && reason && GREY_REASON[reason] && (
        <p className="text-[11px] text-charcoal-light mt-1.5">{GREY_REASON[reason]}</p>
      )}
    </div>
  )
}
