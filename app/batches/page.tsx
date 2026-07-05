import Link from 'next/link'
import { TopNav } from '@/components/app/top-nav'
import { CsvUpload } from '@/components/app/csv-upload'
import { listBatches } from '@/lib/db/batches'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

function fmt(d: string): string {
  return new Date(d).toLocaleString()
}

export default async function BatchesPage() {
  const batches = await listBatches()
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 p-6">
        <CsvUpload defaultCap={env.batchCap()} />

        <section>
          <h2 className="text-sm font-semibold text-black/70">Batches</h2>
          {batches.length === 0 ? (
            <p className="mt-2 text-sm text-black/50">No batches yet. Upload a CSV above.</p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/40">
                  <tr>
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Leads</th>
                    <th className="px-3 py-2 font-medium">Ready</th>
                    <th className="px-3 py-2 font-medium">Sent</th>
                    <th className="px-3 py-2 font-medium">To send</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const ready =
                      (b.counts.ready ?? 0) + (b.counts.approved ?? 0) + (b.counts.sent ?? 0)
                    const sent = b.counts.sent ?? 0
                    const toSend = ready - sent
                    return (
                    <tr key={b.id} className="border-b border-black/5 last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/batches/${b.id}`} className="font-medium text-[var(--brand-accent)] underline">
                          {b.filename || b.id.slice(0, 8)}
                        </Link>
                        {b.dry_run ? (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
                            dry-run
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-black/70">{b.total}</td>
                      <td className="px-3 py-2 text-black/70">{ready}</td>
                      <td className="px-3 py-2 text-green-700">{sent}</td>
                      <td className="px-3 py-2 font-medium">{toSend}</td>
                      <td className="px-3 py-2 text-black/70">{b.status}</td>
                      <td className="px-3 py-2 text-black/50">{fmt(b.created_at)}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
