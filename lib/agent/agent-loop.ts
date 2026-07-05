import type OpenAI from 'openai'
import { openai, llmModelHeavy, llmMaxTokens } from '@/lib/agent/llm'
import { REFINE_TOOLS, dispatchTool } from '@/lib/agent/tools'

/**
 * Multi-turn streaming refine loop scoped to one lead. The orchestrator (heavy
 * model) reads the skill and the current sequence, then refines via tools
 * (regenerate/update the sequence, append/propose skill edits). Forked from
 * ContentAgent's agent-loop. Streams text deltas + tool activity to the caller.
 */

const MAX_ITERS = 6

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface RefineEmit {
  text?: (delta: string) => void
  tool?: (name: string) => void
}

const SYSTEM = `You are Miraside's outbound copilot, refining the competitor-based outreach for ONE prospect with the user.

The message is a fixed template — only the two competitor names and the chosen assistant's outcome line vary:
"Saw that {competitor_1} and {competitor_2} are already automating parts of this. Put together an AI assistant that {outcome}. Happy to personalise it for you for free. Want me to send it over?"

Rules:
- Keep to the skill (read_skill / read_skill_file when you need the rules + the assistant catalogue). Don't pitch a call — the ask is the free assistant ("want me to send it over?").
- If the two COMPETITORS look wrong, call regenerate_sequence to re-find them (geo-scoped) and re-compose. For a small wording fix call update_sequence (message / follow_up_1 / follow_up_2).
- When the prospect has replied positively and wants the assistant, call build_deliverable to produce the finished assistant for them.
- When the user teaches you something durable that should improve future outreach (a better competitor heuristic, an assistant-selection rule), capture it: append_skill_file to references/dm-sequences.md, or propose_skill_overwrite for corrections. Append, don't overwrite.
- After changing the outreach, briefly tell the user what you changed and why. Keep replies short and concrete.`

export async function runRefineLoop(args: {
  leadId: string
  userMessage: string
  history: ChatTurn[]
  emit: RefineEmit
}): Promise<{ text: string; sequenceChanged: boolean }> {
  const { leadId, userMessage, history, emit } = args
  const client = openai()
  const model = llmModelHeavy()

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage },
  ]

  let finalText = ''
  let sequenceChanged = false

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const stream = await client.chat.completions.create({
      model,
      max_tokens: llmMaxTokens(),
      messages,
      tools: REFINE_TOOLS,
      tool_choice: 'auto',
      stream: true,
    })

    let text = ''
    const toolCalls = new Map<number, { id: string; name: string; args: string }>()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        emit.text?.(delta.content)
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0
        const cur = toolCalls.get(idx) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        toolCalls.set(idx, cur)
      }
    }

    finalText = text

    if (toolCalls.size === 0) break

    // Append the assistant turn (with its tool calls), then each tool result.
    const calls = [...toolCalls.values()].filter((c) => c.name)
    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args || '{}' },
      })),
    })

    for (const c of calls) {
      emit.tool?.(c.name)
      const res = await dispatchTool(c.name, c.args, { leadId })
      if (res.sequenceChanged) sequenceChanged = true
      messages.push({ role: 'tool', tool_call_id: c.id, content: res.result.slice(0, 8000) })
    }
  }

  return { text: finalText, sequenceChanged }
}
