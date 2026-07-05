import { NextResponse } from 'next/server'
import { getLead } from '@/lib/db/leads'
import { getSequenceByLead } from '@/lib/db/sequences'
import { listScrapesByLead } from '@/lib/db/scrapes'

export const runtime = 'nodejs'

/** Full detail for the lead drawer: lead + enrichment scrapes + DM sequence. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const lead = await getLead(id)
  if (!lead) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const [sequence, scrapes] = await Promise.all([
    getSequenceByLead(id),
    listScrapesByLead(id),
  ])
  return NextResponse.json({ lead, sequence, scrapes })
}
