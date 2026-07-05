import { getBatch } from '@/lib/db/batches'
import { listLeadsByBatch } from '@/lib/db/leads'
import { supabaseService } from '@/lib/supabase/service'

export const runtime = 'nodejs'

const COLUMNS = [
  'full_name',
  'company',
  'title',
  'linkedin_url',
  'website',
  'status',
  'what_they_do',
  'state',
  'icp',
  'assistant',
  'competitor_1',
  'competitor_2',
  'message',
  'follow_up_1',
  'follow_up_2',
] as const

// LinkedHelper import: profile URL is the matcher, plus the message as a custom
// variable. LinkedHelper only exposes CSV columns whose names start with `cs_` as
// template variables ({cs_message}, {cs_first_name}) — a plain `message` column is
// silently ignored, so the invite note would come through empty.
const LINKEDHELPER_COLUMNS = [
  'first_name',
  'last_name',
  'company',
  'profile_url',
  'cs_first_name',
  'cs_message',
] as const

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

/** Export the batch's leads + drafted sequences as a CSV for the CRM / sending. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const batch = await getBatch(id)
  if (!batch) return new Response('not found', { status: 404 })

  const linkedHelper =
    new URL(req.url).searchParams.get('format') === 'linkedhelper'

  const leads = await listLeadsByBatch(id)
  const { data: seqs } = await supabaseService()
    .from('outbound_sequences')
    .select('*')
    .in(
      'lead_id',
      leads.map((l) => l.id),
    )
  const byLead = new Map((seqs ?? []).map((s) => [s.lead_id as string, s]))

  const name = (batch.filename || id).replace(/\.csv$/i, '')

  if (linkedHelper) {
    // Only rows we can actually send through LinkedHelper: a profile URL + a message.
    const rows = leads
      .map((l) => {
        const s = byLead.get(l.id) as Record<string, unknown> | undefined
        const firstName = l.first_name ?? l.full_name?.split(/\s+/)[0] ?? ''
        return {
          first_name: firstName,
          last_name: l.last_name,
          company: l.company,
          profile_url: l.linkedin_url,
          cs_first_name: firstName,
          cs_message: s?.message,
        } as Record<string, unknown>
      })
      .filter((r) => r.profile_url && r.cs_message)

    const header = LINKEDHELPER_COLUMNS.join(',')
    const body = rows
      .map((row) => LINKEDHELPER_COLUMNS.map((c) => csvCell(row[c])).join(','))
      .join('\n')
    const csv = `${header}\n${body}\n`
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}-linkedhelper.csv"`,
      },
    })
  }

  const rows = leads.map((l) => {
    const s = byLead.get(l.id) as Record<string, unknown> | undefined
    const r = (s?.rationale ?? {}) as Record<string, unknown>
    return {
      full_name: l.full_name,
      company: l.company,
      title: l.title,
      linkedin_url: l.linkedin_url,
      website: l.website,
      status: l.status,
      what_they_do: r.what_they_do,
      state: r.us_state,
      icp: l.icp_verdict ?? r.icp_verdict,
      assistant: r.assistant_label,
      competitor_1: l.competitor_1 ?? r.competitor_1,
      competitor_2: l.competitor_2 ?? r.competitor_2,
      message: s?.message,
      follow_up_1: s?.follow_up_1,
      follow_up_2: s?.follow_up_2,
    } as Record<string, unknown>
  })

  const header = COLUMNS.join(',')
  const body = rows.map((row) => COLUMNS.map((c) => csvCell(row[c])).join(',')).join('\n')
  const csv = `${header}\n${body}\n`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-outbound.csv"`,
    },
  })
}
