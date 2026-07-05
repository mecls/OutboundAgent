'use client'

import { useEffect, useState, useTransition } from 'react'
import { StatusBadge } from '@/components/app/status-badge'
import { RefineChat } from '@/components/app/refine-chat'
import {
  updateSequenceAction,
  approveLeadAction,
  markSentAction,
  buildDeliverableAction,
} from '@/app/leads/actions'
import { assistantLabel } from '@/lib/outreach/templates'
import type { LeadRow } from '@/lib/db/leads'
import type { SequenceRow } from '@/lib/db/sequences'
import type { ScrapeRow } from '@/lib/db/scrapes'
import type { LeadStatus } from '@/lib/leads/types'

interface Detail {
  lead: LeadRow
  sequence: SequenceRow | null
  scrapes: ScrapeRow[]
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-black/40">{label}</div>
      <div className="mt-0.5 text-sm text-black/80">{value}</div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
      className="rounded-md border border-black/15 px-2 py-0.5 text-[11px] hover:border-[var(--brand-accent)]"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function EditableMessage({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
          {label}
        </span>
        {value ? <CopyButton text={value} /> : null}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(12, Math.max(2, Math.ceil((value.length || 1) / 60)))}
        className="w-full resize-y rounded-md border border-black/10 bg-[var(--background)] p-2 text-sm leading-relaxed outline-none focus:border-[var(--brand-accent)]"
      />
    </div>
  )
}

export function LeadDrawer({
  leadId,
  onClose,
  onStatusChange,
}: {
  leadId: string
  onClose: () => void
  onStatusChange?: (leadId: string, status: LeadStatus) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRefine, setShowRefine] = useState(false)
  const [pending, start] = useTransition()
  const [building, setBuilding] = useState(false)

  const [message, setMessage] = useState('')
  const [fu1, setFu1] = useState('')
  const [fu2, setFu2] = useState('')

  function hydrate(d: Detail) {
    setDetail(d)
    const s = d.sequence
    setMessage(s?.message ?? '')
    setFu1(s?.follow_up_1 ?? '')
    setFu2(s?.follow_up_2 ?? '')
  }

  async function load() {
    const r = await fetch(`/api/leads/${leadId}`)
    const d = await r.json()
    if (d.error) {
      setError(d.error)
      return
    }
    hydrate(d as Detail)
  }

  useEffect(() => {
    let active = true
    fetch(`/api/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        if (d.error) return setError(d.error)
        hydrate(d as Detail)
      })
      .catch((e) => active && setError(String(e)))
    return () => {
      active = false
    }
  }, [leadId])

  const lead = detail?.lead
  const seq = detail?.sequence
  const rationale = (seq?.rationale ?? {}) as Record<string, unknown>
  const website = detail?.scrapes.find((s) => s.kind === 'website')
  const linkedin = detail?.scrapes.find((s) => s.kind === 'linkedin')
  const sources = Array.isArray(rationale.competitor_sources)
    ? (rationale.competitor_sources as { title: string; link: string }[])
    : []
  const assistant =
    (typeof rationale.assistant_label === 'string' && rationale.assistant_label) ||
    (lead?.assistant_key ? assistantLabel(lead.assistant_key) : '')
  const deliverable = (seq?.deliverable ?? null) as
    | { content?: string; follow_up_message?: string; why_it_works?: string; built_at?: string }
    | null

  const dirty =
    seq != null &&
    (message !== (seq.message ?? '') ||
      fu1 !== (seq.follow_up_1 ?? '') ||
      fu2 !== (seq.follow_up_2 ?? ''))

  function save() {
    start(async () => {
      await updateSequenceAction(leadId, {
        message: message || null,
        follow_up_1: fu1 || null,
        follow_up_2: fu2 || null,
      })
      await load()
    })
  }
  function approve() {
    start(async () => {
      await approveLeadAction(leadId)
      onStatusChange?.(leadId, 'approved')
      await load()
    })
  }
  function markSent() {
    start(async () => {
      await markSentAction(leadId)
      onStatusChange?.(leadId, 'sent')
      await load()
    })
  }
  async function buildDeliverable() {
    setBuilding(true)
    try {
      await buildDeliverableAction(leadId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBuilding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/30" />
      <aside className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-[var(--background)] shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-black/10 bg-[var(--background)]/90 p-4 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold">{lead?.full_name ?? 'Lead'}</h2>
            <p className="text-sm text-black/60">
              {[lead?.title, lead?.company].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lead ? <StatusBadge status={lead.status} /> : null}
            <button onClick={onClose} className="rounded-md px-2 py-1 text-sm hover:bg-black/5">
              ✕
            </button>
          </div>
        </header>

        {error ? (
          <p className="p-4 text-sm text-red-600">{error}</p>
        ) : !detail ? (
          <p className="p-4 text-sm text-black/40">Loading…</p>
        ) : (
          <div className="space-y-5 p-4">
            <section className="grid grid-cols-2 gap-3">
              <Field
                label="Website"
                value={
                  lead?.website ? (
                    <a href={lead.website} target="_blank" className="text-[var(--brand-accent)] underline">
                      {lead.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null
                }
              />
              <Field
                label="LinkedIn"
                value={
                  lead?.linkedin_url ? (
                    <a href={lead.linkedin_url} target="_blank" className="text-[var(--brand-accent)] underline">
                      profile
                    </a>
                  ) : null
                }
              />
              <Field label="Competitor 1" value={lead?.competitor_1} />
              <Field label="Competitor 2" value={lead?.competitor_2} />
              <Field label="Assistant" value={assistant} />
              <Field label="Location" value={lead?.location} />
            </section>

            {lead?.error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {lead.error}
              </div>
            ) : null}

            {Object.keys(rationale).length > 0 ? (
              <section>
                <h3 className="text-sm font-semibold text-black/70">Research</h3>
                <div className="mt-2 space-y-2 rounded-lg border border-black/10 bg-white p-3">
                  {typeof rationale.what_they_do === 'string' ? (
                    <Field label="What they do" value={rationale.what_they_do as string} />
                  ) : null}
                  {typeof rationale.us_state === 'string' && rationale.us_state ? (
                    <Field label="State (inferred)" value={rationale.us_state as string} />
                  ) : null}
                  {typeof rationale.icp_verdict === 'string' ? (
                    <Field
                      label="ICP"
                      value={
                        <span className={rationale.icp_verdict === 'serve' ? 'text-green-700' : 'text-amber-700'}>
                          {rationale.icp_verdict === 'serve' ? 'In ICP' : 'Out of ICP (skip)'}
                          {typeof rationale.icp_reason === 'string' && rationale.icp_reason
                            ? ` — ${rationale.icp_reason}`
                            : ''}
                        </span>
                      }
                    />
                  ) : null}
                  {typeof rationale.assistant_reason === 'string' ? (
                    <Field label="Why this assistant" value={rationale.assistant_reason as string} />
                  ) : null}
                  {typeof rationale.competitor_reasoning === 'string' ? (
                    <Field label="Why these competitors" value={rationale.competitor_reasoning as string} />
                  ) : null}
                  {sources.length ? (
                    <Field
                      label="Sources"
                      value={
                        <ul className="space-y-0.5">
                          {sources.slice(0, 5).map((s, i) => (
                            <li key={i}>
                              <a
                                href={s.link}
                                target="_blank"
                                className="text-[var(--brand-accent)] underline"
                              >
                                {s.title || s.link}
                              </a>
                            </li>
                          ))}
                        </ul>
                      }
                    />
                  ) : null}
                </div>
              </section>
            ) : null}

            {seq ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-black/70">Outreach</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRefine((v) => !v)}
                      className="rounded-md border border-black/15 px-3 py-1 text-xs hover:border-[var(--brand-accent)]"
                    >
                      {showRefine ? 'Hide refine' : 'Refine'}
                    </button>
                    <button
                      type="button"
                      onClick={save}
                      disabled={!dirty || pending}
                      className="rounded-md border border-black/15 px-3 py-1 text-xs disabled:opacity-40"
                    >
                      {pending ? 'Saving…' : 'Save edits'}
                    </button>
                  </div>
                </div>

                {showRefine ? (
                  <RefineChat leadId={leadId} onSequenceChanged={load} />
                ) : null}

                <EditableMessage label="Message" value={message} onChange={setMessage} />
                <EditableMessage label="Follow-up · day 3" value={fu1} onChange={setFu1} />
                <EditableMessage label="Follow-up · day 7" value={fu2} onChange={setFu2} />

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={approve}
                    disabled={pending}
                    className="cta-shadow rounded-lg bg-[var(--brand-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={markSent}
                    disabled={pending}
                    className="rounded-lg border border-black/15 px-4 py-1.5 text-sm disabled:opacity-40"
                  >
                    Mark sent
                  </button>
                </div>
              </section>
            ) : (
              <p className="text-sm text-black/40">No outreach drafted yet.</p>
            )}

            {seq ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-black/70">
                    Deliverable {deliverable ? '✓' : ''}
                  </h3>
                  <button
                    type="button"
                    onClick={buildDeliverable}
                    disabled={building}
                    className="rounded-md border border-black/15 px-3 py-1 text-xs hover:border-[var(--brand-accent)] disabled:opacity-40"
                  >
                    {building ? 'Building…' : deliverable ? 'Rebuild' : 'Build deliverable'}
                  </button>
                </div>
                <p className="text-[11px] text-black/40">
                  The assistant to send after they reply “yes” — built for them, ready to use.
                </p>
                {deliverable?.content ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-black/10 bg-white p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                          Deliverable
                        </span>
                        <CopyButton text={deliverable.content} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80">
                        {deliverable.content}
                      </p>
                    </div>
                    {deliverable.follow_up_message ? (
                      <div className="rounded-lg border border-black/10 bg-white p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                            Send-with message
                          </span>
                          <CopyButton text={deliverable.follow_up_message} />
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80">
                          {deliverable.follow_up_message}
                        </p>
                      </div>
                    ) : null}
                    {deliverable.why_it_works ? (
                      <Field label="Why it works" value={deliverable.why_it_works} />
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {website?.text || linkedin?.text ? (
              <section>
                <h3 className="text-sm font-semibold text-black/70">Enrichment</h3>
                {website?.text ? (
                  <details className="mt-2 rounded-lg border border-black/10 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium">Website</summary>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-black/70">
                      {website.text.slice(0, 1500)}
                    </p>
                  </details>
                ) : null}
                {linkedin?.text ? (
                  <details className="mt-2 rounded-lg border border-black/10 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-medium">LinkedIn</summary>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-black/70">
                      {linkedin.text.slice(0, 1500)}
                    </p>
                  </details>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  )
}
