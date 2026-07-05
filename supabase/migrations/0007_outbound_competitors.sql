-- 0007 — Competitor-outreach pivot.
--
-- Outreach now shows a prospect that their direct competitors are already
-- automating. Market is set manually per upload (region = 'us' | 'europe'); for
-- US the agent infers each company's STATE per-lead (stored in the lead brief),
-- so geo_area is only used for Europe ('Europe'). Each lead gets its two found
-- competitors + the chosen assistant; the single composed message lives on the
-- sequence. Legacy Dream-100 columns (email_subject/email_body/linkedin_dm +
-- honesty) stay nullable, unused.

alter table public.outbound_batches
  add column if not exists region   text,
  add column if not exists geo_area text;

alter table public.outbound_leads
  add column if not exists competitor_1   text,
  add column if not exists competitor_2   text,
  add column if not exists assistant_key  text;

alter table public.outbound_sequences
  add column if not exists message text;
