-- The occasions table already differentiates Work/Date/Wedding/Gym/etc.
-- with real formality/activity values that flow into scoring — verified
-- against recommend-outfit/index.ts before writing this migration, not
-- assumed. But "Interview" and "Beach" were never seeded, so selecting
-- either as a custom occasion silently fell back to generic defaults
-- (formality 3, sedentary) with no differentiation at all — a real gap,
-- not a hypothetical one.
insert into public.occasions (label, icon, default_formality, default_activity_level, is_preset)
values
  ('Interview', 'briefcase', 4, 'sedentary', true),
  ('Beach', 'sun', 1, 'active', true),
  ('Casual Hangout', 'coffee', 1, 'sedentary', true),
  ('Formal Event', 'award', 5, 'sedentary', true)
on conflict do nothing;
