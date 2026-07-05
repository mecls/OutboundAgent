/**
 * Typed environment access.
 *
 * Server-only secrets are read lazily through getters that throw a clear error
 * when missing — so a missing key surfaces at the call site, not as a cryptic
 * `undefined` deep inside an SDK. Public values are referenced via their literal
 * `process.env.NEXT_PUBLIC_*` names so Next can inline them at build time.
 */

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return v
}

/** Public Supabase config — safe to ship to the browser. */
export const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const env = {
  // Supabase (service-role — server only, never expose).
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  // LLM — OpenAI-compatible Chat Completions (Ollama Cloud). The model MUST
  // support tool/function calling (research + draft force a named tool).
  llmApiKey: () => required('LLM_API_KEY'),
  llmBaseUrl: () => required('LLM_BASE_URL'),
  llmModel: () => required('LLM_MODEL'),
  // Tiered models, same endpoint/key. HEAVY = research + draft; FAST = bulk
  // prose / background. Both fall back to LLM_MODEL so a missing tier never breaks.
  llmModelHeavy: () => process.env.LLM_MODEL_HEAVY || required('LLM_MODEL'),
  llmModelFast: () => process.env.LLM_MODEL_FAST || required('LLM_MODEL'),
  llmMaxTokens: () => {
    const raw = process.env.LLM_MAX_TOKENS
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096
  },

  // Apify scraping. Token optional at rest (the linkedin module guards an empty
  // value); required for non-dry runs.
  apifyToken: () => process.env.APIFY_TOKEN ?? '',
  apifyProfileActor: () =>
    process.env.APIFY_LINKEDIN_PROFILE_ACTOR ?? 'harvestapi~linkedin-profile',
  apifyPostsActor: () =>
    process.env.APIFY_LINKEDIN_POSTS_ACTOR ?? 'harvestapi~linkedin-profile-posts',
  // Company hiring-signal actors. Default EMPTY = the hiring scrape is skipped
  // (no extra Apify spend) until you set a verified actor id. Jobs = the company's
  // open roles; company-posts = recent posts we scan for "we're hiring" language.
  apifyJobsActor: () => process.env.APIFY_LINKEDIN_JOBS_ACTOR ?? '',
  apifyCompanyPostsActor: () =>
    process.env.APIFY_LINKEDIN_COMPANY_POSTS_ACTOR ?? '',

  // Jina Reader (r.jina.ai) — website text. Works with NO key (rate-limited).
  jinaApiKey: () => process.env.JINA_API_KEY ?? '',

  // Web search for competitor discovery. Default = DuckDuckGo (no key, free).
  // Set TAVILY_API_KEY (free tier, no credit card — tavily.com) for cleaner results.
  tavilyApiKey: () => process.env.TAVILY_API_KEY ?? '',

  // Hard cap on leads processed per batch run (protects Apify spend).
  batchCap: () => {
    const raw = process.env.OUTBOUND_BATCH_CAP
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 100
  },

  // Optional shared-password gate for the deployed URL. Empty = gate disabled.
  accessPassword: () => process.env.ACCESS_PASSWORD ?? '',

  // App base URL. Used for redirects + the Inngest worker self-trigger.
  appBaseUrl: () => {
    const explicit = process.env.APP_BASE_URL
    if (explicit) return explicit.replace(/\/$/, '')
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
    if (vercel) return `https://${vercel}`
    return 'http://localhost:3000'
  },
} as const
