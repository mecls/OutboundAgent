import { supabaseService } from '@/lib/supabase/service'
import type { OutboundEvent, OutboundEventPayload, OutboundEventType } from './types'
import type { LeadStatus } from '@/lib/leads/types'

/**
 * Append an event to outbound_events (drives the live leads table over SSE).
 * Best-effort: a failed event insert is logged but never fails the pipeline.
 */
async function emit(
  batchId: string,
  leadId: string | null,
  type: OutboundEventType,
  payload: OutboundEventPayload = {},
): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_events')
    .insert({ batch_id: batchId, lead_id: leadId, type, payload })
  if (error) console.error(`[events] emit ${type} failed: ${error.message}`)
}

export const events = {
  batchStarted: (batchId: string, message?: string) =>
    emit(batchId, null, 'batch.started', { message }),
  batchCompleted: (batchId: string, payload: OutboundEventPayload = {}) =>
    emit(batchId, null, 'batch.completed', payload),
  batchError: (batchId: string, error: string) =>
    emit(batchId, null, 'batch.error', { error }),

  leadStatus: (
    batchId: string,
    leadId: string,
    status: LeadStatus,
    extra: OutboundEventPayload = {},
  ) => emit(batchId, leadId, 'lead.status', { status, ...extra }),
  leadActivity: (batchId: string, leadId: string, message: string) =>
    emit(batchId, leadId, 'lead.activity', { message }),
  leadError: (batchId: string, leadId: string, error: string) =>
    emit(batchId, leadId, 'lead.error', { error, status: 'error' }),
}

/** Read events for a batch with seq greater than `sinceSeq` (SSE tailing). */
export async function readEventsSince(
  batchId: string,
  sinceSeq: number,
): Promise<OutboundEvent[]> {
  const { data, error } = await supabaseService()
    .from('outbound_events')
    .select('seq, batch_id, lead_id, type, ts, payload')
    .eq('batch_id', batchId)
    .gt('seq', sinceSeq)
    .order('seq', { ascending: true })
    .limit(500)
  if (error) throw new Error(`readEventsSince failed: ${error.message}`)
  return (data ?? []) as OutboundEvent[]
}
