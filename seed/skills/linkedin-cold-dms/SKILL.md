---
name: linkedin-cold-dms
description: Miraside competitor-based cold outreach. For each prospect, name two of their real direct competitors who are "already automating", offer a free AI assistant chosen from a fixed catalogue, and ask "want me to send it over?". The message is a fixed template — only the two competitor names and the chosen assistant's outcome line change. Trigger whenever the user writes, edits, or strategizes Miraside cold outreach, picks competitors or an assistant for a lead, or builds the post-reply deliverable. Enforces: real direct competitors only (geo-scoped), the fixed message, the assistant catalogue + selection rules, and honest claims.
---

# Miraside Competitor Outreach Skill

Cold outreach for **Miraside** (done-for-you AI assistants). The angle: show a prospect that **their direct competitors are already automating**, then offer to build them a specific assistant for free. Used by three steps: **classify** (pick the assistant), **competitors** (extract the two names from real search results), and the **deliverable** (build the chosen assistant after they reply).

## The fixed message (do not restructure)

> Hi {first_name}, I saw that {competitor_1} and {competitor_2} are already automating parts of this. I put together an AI assistant that {outcome}. Already works, happy to personalise it for you for free. Want me to send it over?

Always open with **"Hi {first_name},"** and always close with **"Want me to send it over?"**. Only `{first_name}`, `{competitor_1}`, `{competitor_2}`, and `{outcome}` vary. The outcome is the chosen assistant's line (below). The ask is the **free assistant** — never a call.

**Length: the first message must be ≤ 300 characters** — it is sent as a LinkedIn connection-request note, which LinkedIn hard-caps at 300 chars and silently truncates mid-sentence beyond that. If a draft runs over, trim the *variable* parts, not the fixed frame: use the competitors' short brand names (e.g. "MillTown Plumbing", not "MillTown Plumbing, Heating, Cooling & Electrical") and keep the outcome line as written. Never drop the opener or the "Want me to send it over?" close. Follow-ups are sent after connecting and have no 300-char limit.

Follow-ups (same offer, no new info): Day 3 → "Hi {first_name}, the AI assistant already works and I'm happy to personalise it for you for free. Want me to send it over?" · Day 7 → "Hi {first_name}, last nudge on this — it's ready whenever you are. Want me to send it over?"

## The assistant catalogue (fixed — pick ONE)

| key | outcome line | best fit |
|---|---|---|
| `quote_form` | replies to your website quote requests in minutes instead of hours | trades, home services, agencies, B2B services, dealerships — anything with a "get a quote" form |
| `email_inquiry` | replies to new email enquiries instantly and routes them to the right person | high inbound email volume / shared inbox (sales@, info@) |
| `invoice` | reads invoices from email and sends everything to accounting automatically | heavy supplier/AP invoice volume — distribution, construction, manufacturing |
| `expense` | categorises receipts and expenses automatically for accounting | lots of staff receipts/expenses — field teams, sales-heavy orgs, pro services |
| `cv_candidate` | reviews incoming CVs and highlights the strongest candidates automatically | recruiting/staffing, or any company hiring at volume |

**Selection rules:** recruiting/staffing or high-volume hiring → `cv_candidate`; quote/contact-form businesses → `quote_form`; high inbound email / shared inbox → `email_inquiry`; heavy AP invoices → `invoice`; lots of staff receipts → `expense`. If genuinely unclear, default to `quote_form`. Pick from what the website + LinkedIn actually show.

## Finding the two competitors

Two **real, direct** competitors, grounded in live search results — never from memory, never invented.

- **Geography (set per upload):** US → competitors **based in or serving that state**; Europe → 1–2 **big, region-wide** competitors.
- **Direct only:** same kind of business, same buyer. Not adjacent vendors, not Miraside.
- **Real companies, clean brand names** — never directories/aggregators/listicles (Yelp, Clutch, G2, Crunchbase, Wikipedia, "top 10…" pages), never the prospect itself, two distinct names.
- If results are thin, choose the two best-supported direct competitors anyway.

## The deliverable (after they reply "yes")

Build the **chosen** assistant for them — finished, no placeholders, immediately usable, impressive enough they need a call to get the rest: the trigger, the exact action (in their voice, with a realistic worked example), any routing/qualifying logic, the output/next step, and how it plugs into their tools. Plus a short send-with message and one line on why it works.

## Honesty

- The two competitors must be **real and direct** (evidenced by the search results). A wrong or made-up competitor kills the message.
- The assistant outcome lines are fixed and real — don't embellish them.
- Don't invent client results. Never cite Fundraisr clients (Avalanche Capital) as Miraside's.

## The one-line rule

Name two real direct competitors who are already automating, offer the right free assistant, ask "want me to send it over?" — honest, specific, low-friction.

## The improvement loop

Capture which assistant picks and competitor heuristics land replies; append winners to `references/dm-sequences.md`, corrections to `references/offer-and-honesty.md`. Append, don't overwrite.
