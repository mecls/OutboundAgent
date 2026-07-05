'use server'

import { getLead, setLeadStatus } from '@/lib/db/leads'
import { updateSequence } from '@/lib/db/sequences'
import { recomputeCounts } from '@/lib/db/batches'
import { buildDeliverable } from '@/lib/pipeline/deliverable'
import { events } from '@/lib/events/emit'

async function batchIdFor(leadId: string): Promise<string | null> {
  const lead = await getLead(leadId)
  return lead?.batch_id ?? null
}

/** Save user edits to the sequence's message fields (marks it 'edited'). */
export async function updateSequenceAction(
  leadId: string,
  fields: {
    message?: string | null
    follow_up_1?: string | null
    follow_up_2?: string | null
  },
): Promise<void> {
  await updateSequence(leadId, { ...fields, status: 'edited' })
}

/** Build the lead-magnet deliverable (Dream 100 "Prompt 3") after a positive reply. */
export async function buildDeliverableAction(leadId: string): Promise<void> {
  await buildDeliverable(leadId)
}

/** Approve the sequence + lead. */
export async function approveLeadAction(leadId: string): Promise<void> {
  await updateSequence(leadId, { status: 'approved' })
  await setLeadStatus(leadId, 'approved')
  const batchId = await batchIdFor(leadId)
  if (batchId) {
    await recomputeCounts(batchId)
    await events.leadStatus(batchId, leadId, 'approved')
  }
}

/** Mark the sequence as sent (manual — you copied/exported and sent it yourself). */
export async function markSentAction(leadId: string): Promise<void> {
  await setSentAction(leadId, true)
}

/** Toggle a lead's "sent" state from the table (sent ↔ ready). */
export async function setSentAction(leadId: string, sent: boolean): Promise<void> {
  if (sent) {
    await updateSequence(leadId, { status: 'sent', sent_at: new Date().toISOString() })
    await setLeadStatus(leadId, 'sent')
  } else {
    await updateSequence(leadId, { status: 'draft', sent_at: null })
    await setLeadStatus(leadId, 'ready')
  }
  const batchId = await batchIdFor(leadId)
  if (batchId) {
    await recomputeCounts(batchId)
    await events.leadStatus(batchId, leadId, sent ? 'sent' : 'ready')
  }
}
