import { cn, tierColor, tierLabel } from '../../lib/utils'

interface Props {
  tier: string | null
  flag?: string | null
  size?: 'sm' | 'md'
}

export function TierBadge({ tier, flag, size = 'md' }: Props) {
  const label = tierLabel(tier, flag ?? null)
  const color = flag === 'DELAY_TECHNIQUE' ? 'tier-delay' : tierColor(tier)
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 font-semibold tracking-wide uppercase',
      size === 'sm' ? 'text-xs py-0.5' : 'text-xs py-1',
      color
    )}>
      {label}
    </span>
  )
}
