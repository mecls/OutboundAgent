import OpenAI from 'openai'
import type { z } from 'zod'
import { openai, llmModelHeavy, llmMaxTokens } from '@/lib/agent/llm'

/**
 * Forced-tool structured output over an OpenAI-compatible endpoint (Ollama Cloud).
 * Forces a single named tool call, Zod-validates the tool input, and runs a
 * bounded repair loop for models that wobble on structured output. Text-only
 * (no PDF/vision) — leads are text. Forked from InsuranceAgent's lib/llm/run-tool.ts.
 */

const MAX_REPAIRS = 2

function extractJsonObject(text: string | null | undefined): string | null {
  if (!text) return null
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else if (ch === '"') {
      inStr = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function deepParseJsonStrings(value: unknown, depth = 0): unknown {
  if (depth > 6) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed !== null && typeof parsed === 'object') {
          return deepParseJsonStrings(parsed, depth + 1)
        }
      } catch {
        // not JSON; leave as-is
      }
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v) => deepParseJsonStrings(v, depth + 1))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = deepParseJsonStrings(v, depth + 1)
    return out
  }
  return value
}

type ParseOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

function parseToSchema<T>(json: string | null, schema: z.ZodSchema<T>): ParseOutcome<T> {
  if (!json) return { ok: false, error: 'no JSON object found in model output' }
  let raw: unknown
  try {
    raw = deepParseJsonStrings(JSON.parse(json))
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: `schema validation: ${JSON.stringify(parsed.error.issues).slice(0, 600)}`,
    }
  }
  return { ok: true, data: parsed.data }
}

function extractCandidate(
  response: OpenAI.Chat.Completions.ChatCompletion,
  toolName: string,
): { json: string | null; raw: string; source: string } {
  const choice = response.choices[0]
  if (!choice) return { json: null, raw: '', source: 'no-choice' }
  const toolCall = choice.message.tool_calls?.[0]
  if (toolCall && toolCall.type === 'function') {
    const args = toolCall.function.arguments
    const source = toolCall.function.name === toolName ? 'tool' : 'tool-wrong-name'
    return { json: args, raw: args, source }
  }
  const content = choice.message.content ?? ''
  const extracted = extractJsonObject(content)
  const source = extracted ? 'content' : choice.finish_reason === 'length' ? 'length' : 'none'
  return { json: extracted, raw: content, source }
}

function isClientError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

export interface SystemTextBlock {
  type: 'text'
  text: string
}

export interface RunToolParams<T> {
  systemBlocks: SystemTextBlock[]
  userPrompt: string
  toolName: string
  toolDescription: string
  toolInputSchema: object
  schema: z.ZodSchema<T>
  callLabel: string
  /** Model override; defaults to the heavy tier. */
  model?: string
}

export async function runTool<T>(params: RunToolParams<T>): Promise<T> {
  const {
    systemBlocks,
    userPrompt,
    toolName,
    toolDescription,
    toolInputSchema,
    schema,
    callLabel,
    model: modelOverride,
  } = params

  const model = modelOverride ?? llmModelHeavy()
  const maxTokens = llmMaxTokens()
  const systemText = systemBlocks.map((b) => b.text).join('\n\n')
  const client = openai()

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: toolName,
        description: toolDescription,
        parameters: toolInputSchema as Record<string, unknown>,
      },
    },
  ]

  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemText },
    { role: 'user', content: userPrompt },
  ]

  async function complete(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    force: boolean,
  ): Promise<{ response: OpenAI.Chat.Completions.ChatCompletion; forced: boolean }> {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
        tools,
        tool_choice: force ? { type: 'function', function: { name: toolName } } : 'auto',
      })
      return { response, forced: force }
    } catch (err) {
      if (force && isClientError(err)) {
        const response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages,
          tools,
          tool_choice: 'auto',
        })
        return { response, forced: false }
      }
      throw err
    }
  }

  const { response, forced } = await complete(baseMessages, true)

  let candidate = extractCandidate(response, toolName)
  let outcome = parseToSchema(candidate.json, schema)
  if (outcome.ok) return outcome.data

  let messages = baseMessages
  let forcedNow = forced
  let sawLength = candidate.source === 'length'
  const firstError = outcome.error

  for (let attempt = 1; attempt <= MAX_REPAIRS && !outcome.ok; attempt++) {
    messages = [
      ...messages,
      { role: 'assistant', content: candidate.raw || '(no output)' },
      {
        role: 'user',
        content: `Your previous output could not be used: ${outcome.error}\n\nRe-emit the COMPLETE \`${toolName}\` input as a single JSON object, fixing only those issues. Emit every nested value as a real JSON object/array, NOT as a quoted string. Respect every length and item-count constraint. Output JSON only, no other text.`,
      },
    ]
    const repair = await complete(messages, forcedNow)
    forcedNow = repair.forced
    candidate = extractCandidate(repair.response, toolName)
    sawLength = sawLength || candidate.source === 'length'
    outcome = parseToSchema(candidate.json, schema)
  }

  if (outcome.ok) return outcome.data

  const lengthHint = sawLength
    ? ` (hit max_tokens=${maxTokens} before completing output; raise LLM_MAX_TOKENS)`
    : ''
  throw new Error(
    `[${callLabel}] failed after ${MAX_REPAIRS} repair attempts${lengthHint}. firstErr=${firstError.slice(0, 250)} | lastErr=${outcome.error.slice(0, 250)}`,
  )
}
