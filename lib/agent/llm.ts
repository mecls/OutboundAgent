import OpenAI from 'openai'
import { env } from '@/lib/env'

let cached: OpenAI | null = null

/**
 * Shared OpenAI-compatible client (Ollama Cloud). Points at LLM_BASE_URL with
 * LLM_API_KEY. maxRetries: 0 — callers own retry behavior.
 */
export function openai(): OpenAI {
  if (!cached) {
    cached = new OpenAI({
      apiKey: env.llmApiKey(),
      baseURL: env.llmBaseUrl(),
      maxRetries: 0,
    })
  }
  return cached
}

export function llmModel(): string {
  return env.llmModel()
}

/** Heavy model — research + draft (follows the skill, matches proof, honesty-checks). */
export function llmModelHeavy(): string {
  return env.llmModelHeavy()
}

/** Fast model — bulk prose / background tasks. */
export function llmModelFast(): string {
  return env.llmModelFast()
}

export function llmMaxTokens(): number {
  return env.llmMaxTokens()
}
