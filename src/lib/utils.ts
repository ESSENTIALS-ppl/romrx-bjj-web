import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function tierColor(tier: string | null): string {
  switch (tier) {
    case 'GREEN':  return 'tier-green'
    case 'YELLOW': return 'tier-yellow'
    case 'RED':    return 'tier-red'
    case 'DELAY_TECHNIQUE': return 'tier-delay'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function tierLabel(tier: string | null, flag: string | null): string {
  if (flag === 'DELAY_TECHNIQUE') return 'DELAY'
  return tier ?? '—'
}

export function formatJoint(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function beltColor(belt: string): string {
  const map: Record<string, string> = {
    white: 'bg-gray-100 text-gray-700',
    blue:  'bg-blue-100 text-blue-800',
    purple:'bg-purple-100 text-purple-800',
    brown: 'bg-amber-900 text-white',
    black: 'bg-gray-900 text-white',
  }
  return map[belt] ?? 'bg-gray-100 text-gray-700'
}
