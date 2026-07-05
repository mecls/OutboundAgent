'use client'

import { useEffect, useRef, useState } from 'react'
import type { OutboundEvent } from '@/lib/events/types'

/**
 * Subscribe to a batch's SSE event stream. Calls `onEvent` for each event and
 * reconnects from the last seen `seq` on dropout. Forked from InsuranceAgent's
 * use-run-stream. Disable once the batch is finished to stop reconnecting.
 */
export function useBatchStream(
  batchId: string,
  onEvent: (evt: OutboundEvent) => void,
  enabled = true,
): { connected: boolean } {
  const [connected, setConnected] = useState(false)
  const lastSeqRef = useRef(0)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled || !batchId) return
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = async () => {
      try {
        const res = await fetch(`/api/batches/${batchId}/stream?since=${lastSeqRef.current}`)
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done || cancelled) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data: '))
            if (!line) continue
            try {
              const payload = JSON.parse(line.slice(6))
              if (typeof payload.seq === 'number') {
                lastSeqRef.current = payload.seq
                onEventRef.current(payload as OutboundEvent)
              }
            } catch {
              // ignore malformed frame
            }
          }
        }
      } catch {
        // fall through to reconnect
      } finally {
        setConnected(false)
        if (!cancelled) reconnectTimer = setTimeout(connect, 800)
      }
    }

    void connect()
    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [batchId, enabled])

  return { connected }
}
