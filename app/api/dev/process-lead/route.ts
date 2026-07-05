import { NextResponse } from 'next/server'
import { getLead } from '@/lib/db/leads'
import { getBatch } from '@/lib/db/batches'
import { getSequenceByLead } from '@/lib/db/sequences'
import { processLead } from '@/lib/pipeline/process-lead'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Dev helper: run the full pipeline for ONE lead synchronously. Body: { leadId }. */
export async function POST(req: Request) {
  try {
    const { leadId } = (await req.json()) as { leadId?: string }
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
    const lead = await getLead(leadId)
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    const batch = await getBatch(lead.batch_id)

    await processLead(lead, { dryRun: batch?.dry_run ?? false })

    const updated = await getLead(leadId)
    const sequence = await getSequenceByLead(leadId)
    return NextResponse.json({ ok: true, lead: updated, sequence })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
