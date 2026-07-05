# OutboundAgent — How It Works (Simplified)

OutboundAgent turns a spreadsheet of cold leads into personalized, ready-to-send
LinkedIn cold DMs — automatically researching each lead and writing the message,
so you only have to review and send.

It's a Miraside-internal tool. It **drafts** messages; it never sends anything to
LinkedIn itself. You copy or export the approved DMs and send them yourself.

---

## The one-sentence version

**Upload a CSV → the agent reads each lead's website + LinkedIn → it writes a cold
DM that follows our `linkedin-cold-dms` playbook → you review, tweak, approve, and
export.**

---

## The flow, step by step

```
  CSV upload
      │
      ▼
  ┌─────────────┐   one job per lead, run in the background
  │  Each lead  │ ───────────────────────────────────────────►
  └─────────────┘
      │
      ├─ 1. Read their WEBSITE        (free — Jina Reader)
      ├─ 2. Read their LINKEDIN       (Apify — paid; skipped in "dry-run")
      ├─ 3. RESEARCH → "lead brief"   (which industry, what they care about,
      │                                which real Miraside client to name as proof)
      └─ 4. DRAFT → the DM sequence   (connection note + opener + 2 follow-ups,
                                       written to follow the skill's rules)
      │
      ▼
  Leads table updates LIVE as each lead moves: pending → enriching →
  researching → drafting → ready
      │
      ▼
  You open a lead → read the draft → edit / "Refine" with the chat → Approve →
  Copy or Export to CSV → send it from LinkedIn yourself
```

---

## What each piece does

### 1. Upload (the CSV)
You drop in a CSV exported from your CRM. The app **auto-detects** which columns are
the name, company, title, website, LinkedIn URL, etc. (you can fix the mapping by
hand). It de-duplicates by LinkedIn URL and creates a **batch** of **leads**.

Two safety controls live here:
- **Cap** — never process more than N leads in one run (protects Apify spend).
- **Dry-run** — skip the paid LinkedIn scrape entirely and draft from the website only.

### 2. Enrichment (reading the lead)
- **Website** is read with **Jina Reader** — free, no key, turns any page into clean text.
- **LinkedIn** is read with an **Apify** actor — this one costs money per profile, so
  it's skipped in dry-run or when a lead has no LinkedIn URL.

The raw text is saved so you can see exactly what the agent read.

### 3. Research (the "lead brief")
The AI reads the skill + the scraped text and produces a small structured summary:
- their **vertical** (e.g. "dealership group") and whether they're a good fit (**ICP** serve/skip),
- the **words they use** for their own work (so the DM sounds native, not templated),
- the **capacity gap** they probably feel and what it quietly costs them,
- the **closest real Miraside client** to name as proof (e.g. a dealership → Stand Giramotos).

### 4. Draft (the DM)
The AI writes the full sequence — an optional connection note, the **opener**, and
**two follow-ups** — following the playbook's hard rules: *the only job is to book a
15-minute call*, only honest/real claims, proof matched to their industry, and a
**Fundraisr conflict check** (so it never exposes the wrong sending profile or cites a
Fundraisr client as Miraside's). It also outputs an **honesty check** and a
**Fundraisr check** you can read before approving.

### 5. Review & export
Open any lead to see the enrichment, the brief, and the editable sequence. You can:
- **edit** any message inline and **copy** each one,
- **Refine** via a chat ("tighten the opener", "lead with the recall angle") — the agent
  rewrites the DM and can even **save a winning angle back into the skill** so future
  DMs improve,
- **Approve** or **Mark sent**, and **Export CSV** of the whole batch for your CRM.

---

## The "skill" — the brain of the writing

Everything the agent knows about *how to write a good Miraside cold DM* lives in one
**skill** (`linkedin-cold-dms`): a main `SKILL.md` plus two reference files (the offer
& honesty rules, and worked example sequences). It's stored in the database and
**versioned**, so:
- when the agent learns something it can **append** a lesson immediately, and
- bigger rewrites become a **proposal you approve** on the Skills page.

You edit it any time at `/skills`.

---

## Under the hood (one paragraph)

It's a Next.js app sharing the same Supabase database as the other Miraside agents
(all its tables are prefixed `outbound_*`). Because each lead takes a while (scrape +
two AI calls), the work runs in the background via **Inngest**, which fans out one job
per lead and processes them with limited concurrency. The leads table updates **live**
by streaming progress events over SSE. The AI runs on an OpenAI-compatible endpoint
(Ollama Cloud) using a "force the model to return structured JSON, repair if it
wobbles" helper. It's single-tenant (Miraside only), so there's no login by default —
just an optional shared password.

---

## Where things live (for the curious)

| You want to… | Look at |
|---|---|
| Change how columns are detected | `lib/leads/csv.ts` |
| Change the website/LinkedIn scraping | `lib/enrich/website.ts`, `lib/enrich/linkedin.ts` |
| Change the research/draft prompts | `lib/agent/research.ts`, `lib/agent/draft.ts` |
| See the per-lead pipeline | `lib/pipeline/process-lead.ts` |
| See the background worker | `lib/inngest/functions/*` |
| Change the skill content | `/skills` page, or `seed/skills/linkedin-cold-dms/` |
| The live leads UI / drawer | `components/app/leads-table.tsx`, `lead-drawer.tsx` |

---

## Running it

1. `npm install`
2. `.env.local` is already set from the shared Miraside credentials (Supabase + Ollama
   + Apify). 
3. Apply the database tables once: paste `supabase/all-migrations.sql` into the
   Supabase SQL editor (or `supabase db push`).
4. Seed the skill: `POST /api/dev/seed`.
5. Start it:
   - `npm run inngest` — the background worker
   - `npm run dev` — the app
6. Open the app, upload `seed/sample-leads.csv`, and watch it work. Tip: tick
   **dry-run** for your first test so it skips the paid LinkedIn scrape.

---

## Two things to remember

- **It never sends DMs.** It drafts; you send. (This is deliberate — LinkedIn's terms
  and the Fundraisr "whose profile sends it" rule.)
- **LinkedIn scraping costs money.** Use dry-run while testing, keep the cap sensible,
  and verify the Apify actor returns real profile data on your first live run (check a
  lead's raw enrichment).
