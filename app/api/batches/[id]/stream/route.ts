import type { NextRequest } from 'next/server'
import { readEventsSince } from '@/lib/events/emit'
import { TERMINAL_EVENTS } from '@/lib/events/types'

export const runtime = 'nodejs'
export const maxDuration = 300

const POLL_MS = 500

/**
 * SSE: tail outbound_events for a batch by `seq`. Forked from InsuranceAgent's
 * run stream. Client connects with `?since=<lastSeq>`; we poll and stream new
 * rows, closing on a terminal (batch.completed / batch.error) or the deadline.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params
  const sinceParam = req.nextUrl.searchParams.get('since')
  let lastSeq = sinceParam ? Number(sinceParam) || 0 : 0

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      const deadline = Date.now() + (maxDuration - 5) * 1000
      let idleTicks = 0
      let sawTerminal = false

      try {
        while (!closed && !req.signal.aborted && Date.now() < deadline) {
          const batch = await readEventsSince(batchId, lastSeq)
          if (batch.length > 0) {
            for (const evt of batch) {
              send(evt)
              lastSeq = evt.seq
              if (TERMINAL_EVENTS.has(evt.type)) sawTerminal = true
            }
            if (sawTerminal) break
          } else {
            idleTicks++
            if (idleTicks % 20 === 0) controller.enqueue(encoder.encode(`: keep-alive\n\n`))
          }
          await new Promise((r) => setTimeout(r, POLL_MS))
        }
        send({ type: 'stream.end' })
      } catch (err) {
        send({ type: 'stream.error', error: err instanceof Error ? err.message : String(err) })
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
