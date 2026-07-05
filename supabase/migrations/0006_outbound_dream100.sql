-- 0006 — Dream 100 outreach: per-channel messages + the post-reply deliverable.
--
-- The skill pivoted from a single "book the 15-min call" DM to the Dream 100
-- method: a cold EMAIL + a LinkedIn DM that both lead with a free lead magnet
-- (the quote-replier agent) and end in a "mind if I share it?" raise-the-hand
-- CTA, plus a deliverable built after a positive reply. Legacy columns
-- (connection_note, opener, reply_handlers) are kept nullable for back-compat
-- with already-drafted leads; new drafts leave them null.

alter table public.outbound_sequences
  add column if not exists email_subject text,
  add column if not exists email_body    text,
  add column if not exists linkedin_dm    text,
  -- The Prompt-3 lead magnet, built after they reply: { content, follow_up_message, why_it_works, built_at }.
  add column if not exists deliverable    jsonb;
