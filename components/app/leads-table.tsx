'use client'

import { useCallback, useState, useTransition } from 'react'
import { StatusBadge } from '@/components/app/status-badge'
import { LeadDrawer } from '@/components/app/lead-drawer'
import { useBatchStream } from '@/components/app/use-batch-stream'
import { setSentAction } from '@/app/leads/actions'
import { assistantLabel } from '@/lib/outreach/templates'
import type { LeadRow } from '@/lib/db/leads'
import type { LeadStatus } from '@/lib/leads/types'
import type { OutboundEvent } from '@/lib/events/types'

export function LeadsTable({
  batchId,
  initialLeads,
  initialDone,
}: {
  batchId: string
  initialLeads: LeadRow[]
  initialDone: boolean
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads)
  const [activity, setActivity] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [finished, setFinished] = useState(initialDone)
  const [, startSent] = useTransition()

  function toggleSent(leadId: string, sent: boolean) {
    // Optimistic — flip the row immediately, then persist.
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: sent ? 'sent' : 'ready' } : l)),
    )
    startSent(async () => {
      await setSentAction(leadId, sent)
    })
  }

  const onEvent = useCallback((evt: OutboundEvent) => {
    if (evt.type === 'batch.completed' || evt.type === 'batch.error') {
      setFinished(true)
      return
    }
    if (!evt.lead_id) return
    const leadId = evt.lead_id
    if (evt.type === 'lead.activity') {
      const msg = evt.payload.message
      if (typeof msg === 'string') setActivity((a) => ({ ...a, [leadId]: msg }))
      return
    }
    if (evt.type === 'lead.status' || evt.type === 'lead.error') {
      const p = evt.payload
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                status: (p.status as LeadStatus) ?? l.status,
                competitor_1:
                  p.competitor_1 !== undefined ? (p.competitor_1 as string | null) : l.competitor_1,
                competitor_2:
                  p.competitor_2 !== undefined ? (p.competitor_2 as string | null) : l.competitor_2,
                assistant_key:
                  p.assistant_key !== undefined ? (p.assistant_key as string | null) : l.assistant_key,
                icp_verdict:
                  p.icp_verdict !== undefined ? (p.icp_verdict as 'serve' | 'skip' | null) : l.icp_verdict,
                error: typeof p.error === 'string' ? p.error : l.error,
              }
            : l,
        ),
      )
    }
  }, [])

  const { connected } = useBatchStream(batchId, onEvent, !finished)

  const ready = leads.filter((l) =>
    ['ready', 'approved', 'sent'].includes(l.status),
  ).length
  const sent = leads.filter((l) => l.status === 'sent').length
  const toSend = leads.filter((l) => ['ready', 'approved'].includes(l.status)).length

  if (leads.length === 0) {
    return <p className="mt-6 text-sm text-black/50">No leads in this batch.</p>
  }

  return (
    <>
      <div className="mt-4 flex items-center gap-3 text-xs text-black/50">
        <span>
          {ready}/{leads.length} ready
        </span>
        <span className="font-medium text-black/70">{toSend} to send</span>
        <span className="text-green-700">{sent} sent</span>
        {!finished ? (
          <span className="flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'}`}
            />
            {connected ? 'live' : 'connecting…'}
          </span>
        ) : (
          <span>done</span>
        )}
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 text-xs uppercase tracking-wide text-black/40">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Competitor 1</th>
              <th className="px-3 py-2 font-medium">Competitor 2</th>
              <th className="px-3 py-2 font-medium">Assistant</th>
              <th className="px-3 py-2 font-medium">ICP</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Sent</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const inProgress = ['enriching', 'researching', 'drafting'].includes(l.status)
              const isSent = l.status === 'sent'
              const sendable = ['ready', 'approved', 'sent'].includes(l.status)
              return (
                <tr
                  key={l.id}
                  onClick={() => setSelectedId(l.id)}
                  className={`cursor-pointer border-b border-black/5 last:border-0 ${
                    isSent ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-black/[0.03]'
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{l.full_name ?? '—'}</td>
                  <td className="px-3 py-2 text-black/70">{l.company ?? '—'}</td>
                  <td className="px-3 py-2 text-black/60">{l.competitor_1 ?? '—'}</td>
                  <td className="px-3 py-2 text-black/60">{l.competitor_2 ?? '—'}</td>
                  <td className="px-3 py-2 text-black/50">
                    {l.assistant_key ? assistantLabel(l.assistant_key) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {l.icp_verdict ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          l.icp_verdict === 'serve'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {l.icp_verdict === 'serve' ? 'ICP' : 'skip'}
                      </span>
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={l.status} />
                    {inProgress && activity[l.id] ? (
                      <div className="mt-0.5 text-[11px] text-black/40">{activity[l.id]}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {sendable ? (
                      <input
                        type="checkbox"
                        checked={isSent}
                        onChange={(e) => toggleSent(l.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer accent-green-600"
                        title={isSent ? 'Sent — click to unmark' : 'Mark as sent'}
                      />
                    ) : (
                      <span className="text-black/30">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedId ? (
        <LeadDrawer
          leadId={selectedId}
          onClose={() => setSelectedId(null)}
          onStatusChange={(id, status) =>
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
          }
        />
      ) : null}
    </>
  )
}
