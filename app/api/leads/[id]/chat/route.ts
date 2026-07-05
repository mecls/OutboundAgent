import { NextResponse, type NextRequest } from 'next/server'
import { listChat, addChat } from '@/lib/db/chat'
import { runRefineLoop, type ChatTurn } from '@/lib/agent/agent-loop'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Load the refine chat history for a lead. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const messages = await listChat(id)
  return NextResponse.json({
    messages: messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
  })
}

/** SSE: run the refine loop for a lead. Body: { message }. Streams text + tool events. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params
  const { message } = (await req.json()) as { message?: string }
  if (!message) return new Response('message required', { status: 400 })

  const prior = await listChat(leadId)
  const history: ChatTurn[] = prior
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  await addChat(leadId, 'user', message)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      try {
        const { text, sequenceChanged } = await runRefineLoop({
          leadId,
          userMessage: message,
          history,
          emit: {
            text: (delta) => send({ type: 'text', delta }),
            tool: (name) => send({ type: 'tool', name }),
          },
        })
        if (text.trim()) await addChat(leadId, 'assistant', text)
        send({ type: 'done', sequenceChanged })
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
      } finally {
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
