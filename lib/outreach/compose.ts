import { outcomeFor, composeMessageText, followUp1, followUp2 } from '@/lib/outreach/templates'

/**
 * Deterministic message assembly (no LLM): drop the first name, the two competitor
 * names + the chosen assistant's outcome line into the hard-coded template, and
 * build the two follow-ups. This is the whole "drafting" step now.
 */

export interface ComposedOutreach {
  message: string
  follow_up_1: string
  follow_up_2: string
}

export function composeOutreach(input: {
  firstName: string | null
  competitor1: string
  competitor2: string
  assistantKey: string
}): ComposedOutreach {
  const firstName = input.firstName?.trim() || 'there'
  return {
    message: composeMessageText(firstName, input.competitor1, input.competitor2, outcomeFor(input.assistantKey)),
    follow_up_1: followUp1(firstName),
    follow_up_2: followUp2(firstName),
  }
}
