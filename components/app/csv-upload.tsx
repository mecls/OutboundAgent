'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { autoMapHeaders, normalizeRows } from '@/lib/leads/csv'
import { LEAD_FIELDS, type ColumnMapping, type LeadField } from '@/lib/leads/types'
import { createBatchAction } from '@/app/batches/actions'

const FIELD_LABELS: Record<LeadField, string> = {
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  company: 'Company',
  title: 'Title',
  website: 'Website',
  linkedin_url: 'LinkedIn URL',
  email: 'Email',
  location: 'Location',
  industry: 'Industry',
}

export function CsvUpload({ defaultCap }: { defaultCap: number }) {
  const router = useRouter()
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [dryRun, setDryRun] = useState(false)
  const [cap, setCap] = useState(defaultCap)
  const [region, setRegion] = useState<'us' | 'europe'>('us')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onFile(file: File) {
    setError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const fields = (res.meta.fields ?? []).filter(Boolean)
        setFilename(file.name)
        setHeaders(fields)
        setRows(res.data)
        setMapping(autoMapHeaders(fields))
      },
      error: (err) => setError(err.message),
    })
  }

  const previewCount = headers.length ? normalizeRows(rows, mapping).length : 0
  const hasLinkedin = Boolean(mapping.linkedin_url)

  function submit() {
    setError(null)
    start(async () => {
      try {
        const { batchId } = await createBatchAction({
          filename,
          rows,
          mapping,
          dryRun,
          cap,
          region,
        })
        router.push(`/batches/${batchId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <h2 className="text-sm font-semibold">Upload CRM leads (CSV)</h2>
      <p className="mt-1 text-xs text-black/50">
        Map the columns, set this list&apos;s geography, then run. Include a{' '}
        <span className="font-mono">website</span> per lead so the agent can find competitors.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-black/60">Geography</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-black/15">
          {(['us', 'europe'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={`px-3 py-1 text-xs ${
                region === r ? 'bg-[var(--brand-accent)] text-white' : 'text-black/60 hover:bg-black/5'
              }`}
            >
              {r === 'us' ? 'US (per-company state)' : 'Europe (region-wide)'}
            </button>
          ))}
        </div>
        <span className="text-xs text-black/40">
          {region === 'us'
            ? "the agent finds each company's state"
            : 'big region-wide competitors'}
        </span>
      </div>

      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm hover:border-[var(--brand-accent)]">
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        {filename || 'Choose CSV…'}
      </label>

      {headers.length > 0 ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LEAD_FIELDS.map((field) => (
              <label key={field} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-black/60">{FIELD_LABELS[field]}</span>
                <select
                  value={mapping[field] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field]: e.target.value || null }))
                  }
                  className="min-w-0 flex-1 rounded-md border border-black/15 px-2 py-1 text-xs"
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-black/60">
              {previewCount} lead{previewCount === 1 ? '' : 's'} detected
            </span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Dry-run (skip paid LinkedIn scrape)
            </label>
            <label className="flex items-center gap-2">
              Cap
              <input
                type="number"
                min={1}
                value={cap}
                onChange={(e) => setCap(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-md border border-black/15 px-2 py-1"
              />
            </label>
          </div>

          {!hasLinkedin && !dryRun ? (
            <p className="mt-2 text-xs text-amber-700">
              No LinkedIn column mapped — those leads will be enriched from the website only.
            </p>
          ) : null}

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={submit}
            disabled={pending || previewCount === 0}
            className="cta-shadow mt-4 rounded-lg bg-[var(--brand-accent)] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? 'Importing…' : `Import & run (${Math.min(previewCount, cap)})`}
          </button>
        </>
      ) : null}
    </div>
  )
}
