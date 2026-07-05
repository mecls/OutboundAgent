import { supabaseService } from '@/lib/supabase/service'

export interface SequenceRow {
  id: string
  lead_id: string
  // Competitor outreach: the single composed message + 3-step follow-ups + deliverable.
  message: string | null
  follow_up_1: string | null
  follow_up_2: string | null
  deliverable: Record<string, unknown> | null
  // Legacy (kept nullable for back-compat with earlier drafts).
  email_subject: string | null
  email_body: string | null
  linkedin_dm: string | null
  connection_note: string | null
  opener: string | null
  reply_handlers: Record<string, string>
  rationale: Record<string, unknown>
  skill_version: number | null
  status: 'draft' | 'edited' | 'approved' | 'sent'
  edited: Record<string, string> | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface SequenceInput {
  message: string
  follow_up_1?: string | null
  follow_up_2?: string | null
  rationale?: Record<string, unknown>
  skill_version?: number | null
}

export async function getSequenceByLead(leadId: string): Promise<SequenceRow | null> {
  const { data, error } = await supabaseService()
    .from('outbound_sequences')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) throw new Error(`getSequenceByLead failed: ${error.message}`)
  return (data as SequenceRow | null) ?? null
}

/**
 * Upsert the current sequence for a lead. If one already exists it is snapshotted
 * into outbound_sequence_versions first (regeneration history), then replaced as
 * a fresh draft.
 */
export async function upsertSequence(
  leadId: string,
  input: SequenceInput,
): Promise<void> {
  const svc = supabaseService()
  const existing = await getSequenceByLead(leadId)
  if (existing) {
    await svc.from('outbound_sequence_versions').insert({
      lead_id: leadId,
      sequence: existing,
    })
  }
  // `deliverable` is intentionally omitted so a re-compose (conflict update) keeps
  // any previously built deliverable; a fresh insert defaults it to null.
  const row = {
    lead_id: leadId,
    message: input.message,
    follow_up_1: input.follow_up_1 ?? null,
    follow_up_2: input.follow_up_2 ?? null,
    rationale: input.rationale ?? {},
    skill_version: input.skill_version ?? null,
    status: 'draft' as const,
    edited: null,
    sent_at: null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await svc
    .from('outbound_sequences')
    .upsert(row, { onConflict: 'lead_id' })
  if (error) throw new Error(`upsertSequence failed: ${error.message}`)
}

/** Patch fields of the current sequence (user edits / status changes). */
export async function updateSequence(
  leadId: string,
  patch: Partial<Omit<SequenceRow, 'id' | 'lead_id'>>,
): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_sequences')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
  if (error) throw new Error(`updateSequence failed: ${error.message}`)
}
