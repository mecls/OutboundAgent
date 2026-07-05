import type { LeadStatus } from '@/lib/leads/types'

export type OutboundEventType =
  | 'batch.started'
  | 'batch.completed'
  | 'batch.error'
  | 'lead.status'
  | 'lead.activity'
  | 'lead.error'

export interface OutboundEvent {
  seq: number
  batch_id: string
  lead_id: string | null
  type: OutboundEventType
  ts: string
  payload: OutboundEventPayload
}

export interface OutboundEventPayload {
  status?: LeadStatus
  message?: string
  vertical?: string | null
  matched_client?: string | null
  icp_verdict?: 'serve' | 'skip' | null
  error?: string
  [key: string]: unknown
}

/** Event types that close the SSE stream. */
export const TERMINAL_EVENTS: ReadonlySet<OutboundEventType> = new Set([
  'batch.completed',
  'batch.error',
])
