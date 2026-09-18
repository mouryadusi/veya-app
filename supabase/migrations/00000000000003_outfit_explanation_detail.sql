-- Adds room for expandable stylist reasoning: `explanation` stays the
-- existing short "why this works" line shown by default; this new column
-- holds the deeper reasoning (specific color/material/fit logic, occasion
-- and weather fit, alternatives considered and why they lost) shown only
-- when the user taps to expand. Nullable/additive — existing rows and the
-- deterministic (non-LLM) explanation path are unaffected.
alter table public.outfits add column if not exists explanation_detail text;
