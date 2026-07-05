import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TopNav } from '@/components/app/top-nav'
import { LeadsTable } from '@/components/app/leads-table'
import { getBatch } from '@/lib/db/batches'
import { listLeadsByBatch } from '@/lib/db/leads'
import { rerunBatchAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const batch = await getBatch(id)
  if (!batch) notFound()
  const leads = await listLeadsByBatch(id)

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/batches" className="text-xs text-black/40 underline">
              ← Batches
            </Link>
            <h1 className="mt-1 text-xl font-semibold">
              {batch.filename || id.slice(0, 8)}
            </h1>
            <p className="text-sm text-black/60">
              {batch.total} leads · status {batch.status}
              {batch.dry_run ? ' · dry-run' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/api/batches/${id}/export`}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:border-[var(--brand-accent)]"
            >
              Export CSV
            </a>
            <a
              href={`/api/batches/${id}/export?format=linkedhelper`}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:border-[var(--brand-accent)]"
              title="Profile URL + first message only, ready for LinkedHelper import"
            >
              Export for LinkedHelper
            </a>
            <form action={rerunBatchAction}>
              <input type="hidden" name="batchId" value={id} />
              <button className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:border-[var(--brand-accent)]">
                Run again
              </button>
            </form>
          </div>
        </div>

        <LeadsTable
          batchId={id}
          initialLeads={leads}
          initialDone={batch.status === 'done' || batch.status === 'error'}
        />
      </main>
    </>
  )
}
