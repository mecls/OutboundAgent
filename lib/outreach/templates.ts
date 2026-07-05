/**
 * Hard-coded outreach content. The message body, the catalogue of AI assistants
 * (the `{specific outcome}` lines), and the follow-ups are FIXED — per lead we only
 * swap in the two competitor names and the chosen assistant's outcome line. This is
 * the single source of truth for that copy; the classify step picks an assistant
 * KEY and `composeOutreach` fills the template.
 */

/** The five assistants the agent can offer. Keys are the only dynamic selection. */
export const ASSISTANT_KEYS = [
  'quote_form',
  'email_inquiry',
  'invoice',
  'expense',
  'cv_candidate',
] as const

export type AssistantKey = (typeof ASSISTANT_KEYS)[number]

export const ASSISTANTS: Record<AssistantKey, { label: string; outcome: string; fits: string }> = {
  quote_form: {
    label: 'Quote-form replier',
    outcome: 'replies to your website quote requests in minutes instead of hours',
    fits: 'businesses that take quote/contact-form requests — trades, home services, agencies, B2B services, dealerships, anything with a "get a quote" form',
  },
  email_inquiry: {
    label: 'Email inquiry assistant',
    outcome: 'replies to new email enquiries instantly and routes them to the right person',
    fits: 'businesses with high inbound email volume and a shared inbox (sales@/info@/support@) that needs triage and routing',
  },
  invoice: {
    label: 'Invoice processor',
    outcome: 'reads invoices from email and sends everything to accounting automatically',
    fits: 'businesses with heavy supplier/AP invoice volume — distribution, construction, manufacturing, multi-location ops',
  },
  expense: {
    label: 'Expense processor',
    outcome: 'categorises receipts and expenses automatically for accounting',
    fits: 'businesses with lots of staff receipts/expenses — field teams, sales-heavy orgs, professional services',
  },
  cv_candidate: {
    label: 'CV & candidate processor',
    outcome: 'reviews incoming CVs and highlights the strongest candidates automatically',
    fits: 'recruiting/staffing agencies and any company hiring at volume (lots of inbound CVs)',
  },
}

export function isAssistantKey(v: unknown): v is AssistantKey {
  return typeof v === 'string' && (ASSISTANT_KEYS as readonly string[]).includes(v)
}

export function outcomeFor(key: string): string {
  return isAssistantKey(key) ? ASSISTANTS[key].outcome : ASSISTANTS.quote_form.outcome
}

export function assistantLabel(key: string): string {
  return isAssistantKey(key) ? ASSISTANTS[key].label : key
}

/** The fixed message — only the first name, the two competitors and the outcome vary. */
export function composeMessageText(
  firstName: string,
  competitor1: string,
  competitor2: string,
  outcome: string,
): string {
  return `Hi ${firstName}, I saw that ${competitor1} and ${competitor2} are already automating parts of this. I put together an AI assistant that ${outcome}. Already works, happy to personalise it for you for free. Want me to send it over?`
}

/** Day-3 follow-up — same offer, no new info. */
export function followUp1(firstName: string): string {
  return `Hi ${firstName}, the AI assistant already works and I'm happy to personalise it for you for free. Want me to send it over?`
}

/** Day-7 follow-up — final, low pressure. */
export function followUp2(firstName: string): string {
  return `Hi ${firstName}, last nudge on this — it's ready whenever you are. Want me to send it over?`
}
