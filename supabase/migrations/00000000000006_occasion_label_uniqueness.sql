-- The occasions table has never had a unique constraint on `label`, so the
-- ON CONFLICT DO NOTHING clauses in both 00000000000001_init.sql and
-- 00000000000005_more_occasion_presets.sql have been silent no-ops the
-- entire time — there was nothing for a conflict to trigger against.
-- Confirmed by reading the actual table definition, not assumed. This
-- doesn't re-seed anything (already covered by migration 5) — it only
-- fixes the constraint gap so future re-runs of that insert pattern
-- actually prevent duplicates instead of silently accepting them.
--
-- Defensive: if duplicate global presets already exist on the live
-- database (a real possibility — schema.sql was pasted into the SQL
-- Editor manually more than once earlier in this project, before
-- migrations existed), CREATE UNIQUE INDEX below would fail outright
-- against that existing duplicate data. Keep the oldest row per label,
-- drop the rest, scoped to global presets only (user_id IS NULL) — per-
-- user custom occasions sharing a label across different users are
-- unrelated and must not be touched by this.
delete from public.occasions a
using public.occasions b
where a.user_id is null
  and b.user_id is null
  and a.label = b.label
  and a.id > b.id;

create unique index if not exists idx_occasions_preset_label
  on public.occasions(label) where user_id is null;
