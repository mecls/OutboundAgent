'use client'

import { useEffect, useRef, useState } from 'react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Per-lead refine chat. Streams the agent's reply (and tool activity) over SSE,
 * then calls onSequenceChanged so the drawer reloads the updated sequence.
 */
export function RefineChat({
  leadId,
  onSequenceChanged,
}: {
  leadId: string
  onSequenceChanged: () => void
}) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [tool, setTool] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/leads/${leadId}/chat`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {})
  }, [leadId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setStreaming(true)
    setTool(null)

    try {
      const res = await fetch(`/api/leads/${leadId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let changed = false
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const evt = JSON.parse(line.slice(6))
          if (evt.type === 'text') {
            setMessages((m) => {
              const copy = [...m]
              copy[copy.length - 1] = {
                role: 'assistant',
                content: copy[copy.length - 1].content + evt.delta,
              }
              return copy
            })
          } else if (evt.type === 'tool') {
            setTool(evt.name)
          } else if (evt.type === 'done') {
            changed = Boolean(evt.sequenceChanged)
          } else if (evt.type === 'error') {
            setMessages((m) => {
              const copy = [...m]
              copy[copy.length - 1] = { role: 'assistant', content: `⚠️ ${evt.error}` }
              return copy
            })
          }
        }
      }
      if (changed) onSequenceChanged()
    } catch (e) {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: 'assistant', content: `⚠️ ${String(e)}` }
        return copy
      })
    } finally {
      setStreaming(false)
      setTool(null)
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-black/10 bg-white">
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-xs text-black/40">
            Ask for a refinement — e.g. &ldquo;tighten the opener&rdquo;, &ldquo;lead with the
            recall angle&rdquo;, or &ldquo;that worked, add it to the skill&rdquo;.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm ${m.role === 'user' ? 'text-black/80' : 'text-black/70'}`}
          >
            <span className="mr-1 text-[11px] font-semibold uppercase text-black/30">
              {m.role === 'user' ? 'You' : 'Agent'}
            </span>
            <span className="whitespace-pre-wrap">{m.content || (streaming ? '…' : '')}</span>
          </div>
        ))}
        {tool ? (
          <div className="text-[11px] text-[var(--brand-accent)]">⚙ {tool}…</div>
        ) : null}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-black/10 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Refine the DM…"
          disabled={streaming}
          className="flex-1 rounded-md border border-black/15 px-2 py-1.5 text-sm outline-none focus:border-[var(--brand-accent)]"
        />
        <button
          type="button"
          onClick={send}
          disabled={streaming || !input.trim()}
          className="cta-shadow rounded-md bg-[var(--brand-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  )
}
