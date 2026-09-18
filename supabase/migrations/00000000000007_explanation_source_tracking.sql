-- Tracks whether an outfit's explanation actually came from the LLM ("ai")
-- or the deterministic template fallback ("fallback"). This directly
-- diagnoses the complaint about repetitive generic phrases like "sits right
-- at the formality this occasion calls for" — those are the fallback
-- template verbatim, which means the LLM path was never running, not that
-- its prompt quality was poor. Additive/nullable: existing rows get
-- 'fallback' as a safe default, no consumer of the JSON contract breaks.
alter table public.outfits add column if not exists explanation_source text not null default 'fallback';
