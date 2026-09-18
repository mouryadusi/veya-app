-- Adds the per-attribute confidence framework (detected/highly_likely/
-- estimated/unknown) for AI-extracted garment attributes. Additive and
-- backward-compatible: existing rows get NULL here, existing consumers of
-- primary_color/material/brand/pattern as plain strings are unaffected.
alter table public.wardrobe_items add column if not exists attribute_confidence jsonb;
