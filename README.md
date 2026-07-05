# Miraside OutboundAgent

Lead-research → cold-DM studio. Upload a CSV of CRM leads → the agent scrapes each
lead's website + LinkedIn → synthesizes a lead brief → drafts a full DM sequence
following the **linkedin-cold-dms** skill → you review / edit / approve / export.

Single-tenant (Miraside-internal). Draft-only: no LinkedIn automation — you copy or
export the approved sequences. Sibling to ContentAgent / EmailAgent / InsuranceAgent;
shares the same Supabase project, with all tables prefixed `outbound_*`.

## Stack
Next 16 / React 19 / Tailwind v4 / `@supabase/supabase-js` (service-role) / `openai`
(OpenAI-compatible → Ollama Cloud) / Inngest (fan-out worker) / Zod / papaparse.

## Setup
1. `npm install`
2. `cp .env.example .env.local` and fill in Supabase + LLM + Apify keys (copy most
   from a sibling repo — same Supabase project + Ollama Cloud + Apify token).
3. Apply migrations `supabase/migrations/0001`–`0005` to the shared Supabase project
   (SQL editor or `supabase db push`).
4. Seed the skill: `POST /api/dev/seed` (dev only) — imports `seed/skills/*` into the DB.
5. Run the worker + app:
   - `npm run inngest`  (local Inngest dev server)
   - `npm run dev`

## Verify
`npm run build && npm run typecheck && npm run lint` — all clean.
Then upload a small CSV with `website` + `linkedin_url` columns and watch the leads
table go live. Use **dry-run** to skip paid Apify scraping (website-only drafts).

## Cost control
Apify is paid per LinkedIn profile. Batches honor `OUTBOUND_BATCH_CAP`, dedupe by
LinkedIn URL, and support a per-run **dry-run** that skips Apify entirely.
# OutboundAgent
