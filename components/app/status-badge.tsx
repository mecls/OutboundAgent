import type { LeadStatus } from '@/lib/leads/types'

const STYLES: Record<LeadStatus, string> = {
  pending: 'bg-black/5 text-black/50',
  enriching: 'bg-blue-50 text-blue-700 animate-pulse-soft',
  researching: 'bg-blue-50 text-blue-700 animate-pulse-soft',
  drafting: 'bg-indigo-50 text-indigo-700 animate-pulse-soft',
  ready: 'bg-green-50 text-green-700',
  approved: 'bg-green-100 text-green-800',
  sent: 'bg-black text-white',
  skipped: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status}
    </span>
  )
}
