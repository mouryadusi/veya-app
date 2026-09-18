-- =============================================================
-- Veya database schema (Supabase / Postgres)
-- Run via: supabase db push  (see README for setup)
-- =============================================================

create extension if not exists "uuid-ossp";

-- -------------------------------------------------------------
-- profiles: one row per auth.users, holds style/body context
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  gender_preference text,                  -- self-reported, free text ("woman", "man", "non-binary", or whatever the user enters) — used only to bias recommendation phrasing/silhouettes, never enforced
  home_city text,
  home_lat double precision,
  home_lng double precision,
  -- personal style, all optional / user-editable, never inferred silently
  style_tags text[] default '{}',         -- e.g. {minimalist, streetwear}
  preferred_fit text,                      -- slim | regular | relaxed | oversized
  skin_undertone text,                     -- warm | cool | neutral
  hair_color text,
  eye_color text,
  height_cm int,
  temperature_sensitivity text,            -- runs_hot | runs_cold | neutral
  budget_tier text,                        -- budget | mid | premium
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_self_upsert" on public.profiles;
create policy "profiles_self_upsert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- -------------------------------------------------------------
-- Demo/starter closet: seeded automatically for every new profile so the
-- recommendation pipeline has something to work with immediately. Image
-- URLs use the demo:// scheme, resolved client-side to bundled illustration
-- assets (see src/lib/demoCloset.ts) rather than a real remote photo.
-- Attributes are hand-authored here, not AI-extracted, since there's no
-- real photo to analyze.
-- -------------------------------------------------------------
-- Updated seed function with all 47 demo items
create or replace function public.insert_demo_closet_rows(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wardrobe_items
    (user_id, image_url, category, subcategory, primary_color, pattern, material, fit, formality, season_suitability, style_tags, warmth_level, user_verified, is_demo)
  values
    (target_user, 'demo://white_oxford', 'top', 'Oxford shirt', 'white', 'solid', 'cotton', 'regular', 2, array['spring','summer','fall'], array['classic','preppy'], 2, true, true),
    (target_user, 'demo://navy_tee', 'top', 'T-shirt', 'navy', 'solid', 'cotton', 'regular', 1, array['spring','summer'], array['minimalist','casual'], 1, true, true),
    (target_user, 'demo://cream_tank', 'top', 'Tank top', 'cream', 'solid', 'cotton', 'regular', 1, array['spring','summer'], array['minimalist','casual'], 1, true, true),
    (target_user, 'demo://blush_blouse', 'top', 'Blouse', 'blush', 'solid', 'silk blend', 'relaxed', 2, array['spring','summer','fall'], array['romantic','feminine'], 2, true, true),
    (target_user, 'demo://silk_blouse', 'top', 'Silk blouse', 'plum', 'solid', 'silk', 'regular', 3, array['spring','summer','fall','winter'], array['elegant','luxury'], 2, true, true),
    (target_user, 'demo://charcoal_trousers', 'bottom', 'Tailored trousers', 'charcoal', 'solid', 'wool blend', 'regular', 4, array['fall','winter'], array['classic','professional'], 3, true, true),
    (target_user, 'demo://indigo_jeans', 'bottom', 'Jeans', 'indigo', 'solid', 'denim', 'regular', 1, array['spring','summer','fall','winter'], array['classic','streetwear'], 2, true, true),
    (target_user, 'demo://khaki_chinos', 'bottom', 'Chinos', 'khaki', 'solid', 'cotton', 'regular', 2, array['spring','summer','fall'], array['casual','preppy'], 2, true, true),
    (target_user, 'demo://navy_chinos', 'bottom', 'Chinos', 'navy', 'solid', 'cotton', 'regular', 2, array['spring','summer','fall'], array['casual','classic'], 2, true, true),
    (target_user, 'demo://linen_skirt', 'bottom', 'Linen skirt', 'cream', 'solid', 'linen', 'regular', 1, array['spring','summer'], array['casual','relaxed'], 1, true, true),
    (target_user, 'demo://denim_skirt', 'bottom', 'Denim skirt', 'indigo', 'solid', 'denim', 'regular', 1, array['spring','summer','fall'], array['casual','vintage'], 1, true, true),
    (target_user, 'demo://casual_dress_blue', 'dress', 'Casual dress', 'blue', 'solid', 'cotton', 'relaxed', 2, array['spring','summer'], array['casual','feminine'], 1, true, true),
    (target_user, 'demo://casual_dress_rust', 'dress', 'Casual dress', 'rust', 'solid', 'linen blend', 'relaxed', 2, array['spring','summer','fall'], array['casual','earthy'], 1, true, true),
    (target_user, 'demo://formal_black', 'dress', 'Evening dress', 'black', 'solid', 'crepe', 'slim', 5, array['spring','summer','fall','winter'], array['elegant','formal'], 2, true, true),
    (target_user, 'demo://formal_burgundy', 'dress', 'Evening dress', 'burgundy', 'solid', 'satin', 'slim', 5, array['fall','winter'], array['elegant','formal'], 2, true, true),
    (target_user, 'demo://maxi_champagne', 'dress', 'Maxi dress', 'champagne', 'solid', 'silk', 'relaxed', 4, array['spring','summer','fall'], array['elegant','romantic'], 1, true, true),
    (target_user, 'demo://maxi_emerald', 'dress', 'Maxi dress', 'emerald', 'solid', 'silk', 'regular', 4, array['spring','summer','fall','winter'], array['elegant','sophisticated'], 2, true, true),
    (target_user, 'demo://kurti_maroon', 'traditional', 'Embroidered kurti', 'maroon', 'embroidered', 'silk blend', 'regular', 3, array['spring','summer','fall'], array['traditional','ethnic'], 2, true, true),
    (target_user, 'demo://kurti_teal', 'traditional', 'Embroidered kurti', 'teal', 'embroidered', 'cotton', 'relaxed', 2, array['spring','summer'], array['traditional','casual'], 1, true, true),
    (target_user, 'demo://puffer_black', 'outerwear', 'Puffer jacket', 'black', 'solid', 'nylon', 'regular', 1, array['fall','winter'], array['casual','practical'], 5, true, true),
    (target_user, 'demo://puffer_camel', 'outerwear', 'Puffer jacket', 'camel', 'solid', 'nylon', 'regular', 1, array['fall','winter'], array['casual','warm'], 5, true, true),
    (target_user, 'demo://wool_camel', 'outerwear', 'Wool coat', 'camel', 'solid', 'wool', 'regular', 3, array['fall','winter'], array['classic','elegant'], 4, true, true),
    (target_user, 'demo://wool_grey', 'outerwear', 'Wool coat', 'grey', 'solid', 'wool', 'regular', 3, array['fall','winter'], array['classic','professional'], 4, true, true),
    (target_user, 'demo://blazer_black', 'outerwear', 'Tailored blazer', 'black', 'solid', 'wool blend', 'slim', 4, array['spring','fall','winter'], array['professional','formal'], 2, true, true),
    (target_user, 'demo://blazer_navy', 'outerwear', 'Tailored blazer', 'navy', 'solid', 'wool blend', 'regular', 3, array['spring','fall','winter'], array['professional','classic'], 2, true, true),
    (target_user, 'demo://leather_black', 'outerwear', 'Leather jacket', 'black', 'solid', 'leather', 'slim', 2, array['spring','fall','winter'], array['edgy','classic'], 2, true, true),
    (target_user, 'demo://leather_brown', 'outerwear', 'Leather jacket', 'cognac', 'solid', 'leather', 'regular', 2, array['spring','fall','winter'], array['vintage','classic'], 2, true, true),
    (target_user, 'demo://sneakers_white', 'shoes', 'Leather sneakers', 'white', 'solid', 'leather', 'regular', 1, array['spring','summer','fall','winter'], array['minimalist','casual'], 1, true, true),
    (target_user, 'demo://sneakers_black', 'shoes', 'Leather sneakers', 'black', 'solid', 'leather', 'regular', 1, array['spring','summer','fall','winter'], array['minimalist','casual'], 1, true, true),
    (target_user, 'demo://loafers_black', 'shoes', 'Leather loafers', 'black', 'solid', 'leather', 'regular', 3, array['spring','summer','fall','winter'], array['classic','preppy'], 1, true, true),
    (target_user, 'demo://loafers_brown', 'shoes', 'Leather loafers', 'brown', 'solid', 'leather', 'regular', 3, array['spring','summer','fall','winter'], array['classic','warm'], 1, true, true),
    (target_user, 'demo://heels_nude', 'shoes', 'Heels', 'nude', 'solid', 'leather', 'regular', 4, array['spring','summer','fall','winter'], array['feminine','elegant'], 1, true, true),
    (target_user, 'demo://heels_black', 'shoes', 'Heels', 'black', 'solid', 'leather', 'slim', 4, array['spring','summer','fall','winter'], array['formal','classic'], 1, true, true),
    (target_user, 'demo://sandals_tan', 'shoes', 'Leather sandals', 'tan', 'solid', 'leather', 'regular', 1, array['spring','summer'], array['casual','relaxed'], 1, true, true),
    (target_user, 'demo://sandals_gold', 'shoes', 'Metallic sandals', 'gold', 'solid', 'leather', 'regular', 2, array['spring','summer'], array['evening','elegant'], 1, true, true),
    (target_user, 'demo://boots_black', 'shoes', 'Leather boots', 'black', 'solid', 'leather', 'slim', 3, array['fall','winter'], array['classic','edgy'], 2, true, true),
    (target_user, 'demo://boots_cognac', 'shoes', 'Leather boots', 'cognac', 'solid', 'leather', 'regular', 2, array['fall','winter'], array['warm','classic'], 2, true, true),
    (target_user, 'demo://clutch_gold', 'accessory', 'Clutch', 'gold', 'solid', 'metallic', 'regular', 4, array['spring','summer','fall','winter'], array['elegant','evening'], 1, true, true),
    (target_user, 'demo://clutch_black', 'accessory', 'Clutch', 'black', 'solid', 'leather', 'regular', 4, array['spring','summer','fall','winter'], array['formal','elegant'], 1, true, true),
    (target_user, 'demo://tote_cream', 'accessory', 'Canvas tote', 'cream', 'solid', 'canvas', 'regular', 1, array['spring','summer','fall','winter'], array['minimalist','practical'], 1, true, true),
    (target_user, 'demo://tote_navy', 'accessory', 'Canvas tote', 'navy', 'solid', 'canvas', 'regular', 1, array['spring','summer','fall','winter'], array['casual','practical'], 1, true, true),
    (target_user, 'demo://scarf_silk', 'accessory', 'Silk scarf', 'rose', 'solid', 'silk', 'regular', 3, array['spring','summer','fall','winter'], array['elegant','romantic'], 1, true, true),
    (target_user, 'demo://scarf_wool', 'accessory', 'Wool scarf', 'camel', 'solid', 'wool', 'regular', 2, array['fall','winter'], array['warm','classic'], 2, true, true),
    (target_user, 'demo://watch_gold', 'accessory', 'Watch', 'gold', 'solid', 'metal', 'regular', 3, array['spring','summer','fall','winter'], array['elegant','professional'], 1, true, true),
    (target_user, 'demo://watch_silver', 'accessory', 'Watch', 'silver', 'solid', 'metal', 'regular', 3, array['spring','summer','fall','winter'], array['classic','professional'], 1, true, true),
    (target_user, 'demo://sunglasses_black', 'accessory', 'Sunglasses', 'black', 'solid', 'plastic', 'regular', 2, array['spring','summer'], array['casual','cool'], 1, true, true),
    (target_user, 'demo://sunglasses_brown', 'accessory', 'Sunglasses', 'brown', 'solid', 'acetate', 'regular', 2, array['spring','summer'], array['warm','classic'], 1, true, true);
end;
$$;

create or replace function public.seed_demo_closet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_demo_closet_rows(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_demo_closet on public.profiles;
create trigger trg_seed_demo_closet
  after insert on public.profiles
  for each row execute function public.seed_demo_closet();

-- Callable on-demand for accounts created before this trigger existed, or
-- anyone who removed their whole demo closet and wants it back. Safe to
-- call repeatedly — it's a no-op once the user already has demo items.
create or replace function public.seed_demo_closet_for_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.wardrobe_items where user_id = auth.uid() and is_demo) then
    perform public.insert_demo_closet_rows(auth.uid());
  end if;
end;
$$;

-- -------------------------------------------------------------
-- wardrobe_items: every garment/accessory/shoe the user owns
-- -------------------------------------------------------------
create table if not exists public.wardrobe_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,

  -- AI-extracted attributes (user-editable / correctable)
  category text not null,          -- top | bottom | dress | outerwear | shoes | accessory | traditional
  subcategory text,                -- e.g. "button-down shirt", "chelsea boots"
  primary_color text,
  secondary_colors text[] default '{}',
  pattern text,                    -- solid | striped | plaid | floral | print | ...
  material text,
  fit text,                        -- slim | regular | relaxed | oversized
  formality int,                   -- 1 (very casual) .. 5 (black tie)
  season_suitability text[] default '{}', -- {spring, summer, fall, winter}
  style_tags text[] default '{}',  -- {minimalist, streetwear, classic, ...}
  warmth_level int,                -- 1 (very light) .. 5 (very warm)

  brand text,
  size text,
  product_url text,
  notes text,

  ai_confidence numeric,           -- 0..1, confidence of the vision model
  ai_raw jsonb,                    -- full raw AI extraction, for auditing/re-scoring
  attribute_confidence jsonb,      -- per-attribute honesty rating: detected|highly_likely|estimated|unknown for brand/material/primary_color/pattern
  user_verified boolean not null default false,
  is_demo boolean not null default false, -- seeded starter closet vs. user-uploaded

  wear_count int not null default 0,
  last_worn_at date,
  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_wardrobe_items_user on public.wardrobe_items(user_id);
create index if not exists idx_wardrobe_items_category on public.wardrobe_items(user_id, category);

-- Safe to re-run: adds is_demo to an already-existing table from before this column existed.
alter table public.wardrobe_items add column if not exists is_demo boolean not null default false;
alter table public.wardrobe_items add column if not exists attribute_confidence jsonb;

-- Same reasoning: profiles already exists on the linked project, so the new
-- column above needs an explicit ALTER to actually reach it.
alter table public.profiles add column if not exists gender_preference text;

alter table public.wardrobe_items enable row level security;
drop policy if exists "wardrobe_items_owner_all" on public.wardrobe_items;
create policy "wardrobe_items_owner_all" on public.wardrobe_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------------------------------------------------
-- occasions: the "where are you going" catalogue (seeded + custom)
-- -------------------------------------------------------------
create table if not exists public.occasions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade, -- null = global preset
  label text not null,
  icon text,
  default_formality int,           -- suggested formality 1..5
  default_activity_level text,     -- sedentary | active | high_activity
  is_preset boolean not null default false
);

alter table public.occasions enable row level security;
drop policy if exists "occasions_read" on public.occasions;
create policy "occasions_read" on public.occasions
  for select using (user_id is null or auth.uid() = user_id);
drop policy if exists "occasions_owner_write" on public.occasions;
create policy "occasions_owner_write" on public.occasions
  for insert with check (auth.uid() = user_id);
drop policy if exists "occasions_owner_update" on public.occasions;
create policy "occasions_owner_update" on public.occasions
  for update using (auth.uid() = user_id);
drop policy if exists "occasions_owner_delete" on public.occasions;
create policy "occasions_owner_delete" on public.occasions
  for delete using (auth.uid() = user_id);

-- -------------------------------------------------------------
-- outfit_requests: one row per "what should I wear" ask
-- -------------------------------------------------------------
create table if not exists public.outfit_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  occasion_label text not null,
  when_at timestamptz,
  activity_note text,
  special_note text,               -- free text, e.g. "outdoor venue, might rain"
  location_lat double precision,
  location_lng double precision,
  weather_snapshot jsonb,          -- temp, condition, precip, wind at request time
  created_at timestamptz not null default now()
);

alter table public.outfit_requests enable row level security;
drop policy if exists "outfit_requests_owner_all" on public.outfit_requests;
create policy "outfit_requests_owner_all" on public.outfit_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------------------------------------------------
-- outfits: a candidate/recommended combination of wardrobe items
-- -------------------------------------------------------------
create table if not exists public.outfits (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null references public.outfit_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,                -- 1 = top pick shown first
  compatibility_score numeric,      -- deterministic scoring 0..100
  preference_score numeric,         -- learned personal-preference scoring 0..100
  final_score numeric,
  explanation text,                 -- short human-readable "why this works"
  explanation_detail text,          -- deeper reasoning shown when the user expands: alternatives considered, specific color/material/fit logic
  status text not null default 'shown', -- shown | loved | rejected | worn
  shown_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists idx_outfits_request on public.outfits(request_id);

alter table public.outfits enable row level security;
drop policy if exists "outfits_owner_all" on public.outfits;
create policy "outfits_owner_all" on public.outfits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------------------------------------------------
-- outfit_items: join table, which wardrobe items make up an outfit
-- -------------------------------------------------------------
create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  wardrobe_item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  slot text not null,               -- top | bottom | dress | shoes | outerwear | accessory
  primary key (outfit_id, wardrobe_item_id)
);

alter table public.outfit_items enable row level security;
drop policy if exists "outfit_items_owner_all" on public.outfit_items;
create policy "outfit_items_owner_all" on public.outfit_items
  for all using (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = auth.uid())
  );

-- -------------------------------------------------------------
-- feedback: the ❤️ / 🙂 / 👎 / ↻ signal, drives learning
-- -------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  signal text not null,             -- loved | okay | disliked | try_another
  reason_tags text[] default '{}',  -- optional: {wrong_formality, disliked_color, uncomfortable}
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
drop policy if exists "feedback_owner_all" on public.feedback;
create policy "feedback_owner_all" on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- -------------------------------------------------------------
-- item_affinity: learned per-item preference score (updated by trigger)
-- -------------------------------------------------------------
create table if not exists public.item_affinity (
  user_id uuid not null references auth.users(id) on delete cascade,
  wardrobe_item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  affinity numeric not null default 0,   -- running score, positive = liked
  times_recommended int not null default 0,
  times_loved int not null default 0,
  times_rejected int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, wardrobe_item_id)
);

alter table public.item_affinity enable row level security;
drop policy if exists "item_affinity_owner_all" on public.item_affinity;
create policy "item_affinity_owner_all" on public.item_affinity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Update wear_count / last_worn_at when an outfit is marked worn
create or replace function public.mark_outfit_worn(p_outfit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wardrobe_items wi
  set wear_count = wi.wear_count + 1,
      last_worn_at = current_date
  from public.outfit_items oi
  where oi.outfit_id = p_outfit_id
    and oi.wardrobe_item_id = wi.id
    and wi.user_id = auth.uid();

  update public.outfits set status = 'worn', responded_at = now()
  where id = p_outfit_id and user_id = auth.uid();
end;
$$;

-- Roll feedback into item_affinity so future scoring can use it
create or replace function public.apply_feedback_to_affinity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  delta numeric;
begin
  delta := case new.signal
    when 'loved' then 3
    when 'okay' then 0.5
    when 'try_another' then -1
    when 'disliked' then -3
    else 0
  end;

  for item in
    select wardrobe_item_id from public.outfit_items where outfit_id = new.outfit_id
  loop
    insert into public.item_affinity (user_id, wardrobe_item_id, affinity, times_recommended, times_loved, times_rejected)
    values (
      new.user_id, item.wardrobe_item_id, delta, 1,
      case when new.signal = 'loved' then 1 else 0 end,
      case when new.signal in ('disliked','try_another') then 1 else 0 end
    )
    on conflict (user_id, wardrobe_item_id) do update
    set affinity = public.item_affinity.affinity + excluded.affinity,
        times_recommended = public.item_affinity.times_recommended + 1,
        times_loved = public.item_affinity.times_loved + excluded.times_loved,
        times_rejected = public.item_affinity.times_rejected + excluded.times_rejected,
        updated_at = now();
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_feedback_affinity on public.feedback;
create trigger trg_feedback_affinity
  after insert on public.feedback
  for each row execute function public.apply_feedback_to_affinity();

-- -------------------------------------------------------------
-- Seed preset occasions (global, user_id null)
-- -------------------------------------------------------------
insert into public.occasions (label, icon, default_formality, default_activity_level, is_preset)
values
  ('Work', 'briefcase', 3, 'sedentary', true),
  ('Date', 'heart', 3, 'sedentary', true),
  ('Movie', 'film', 2, 'sedentary', true),
  ('Dinner', 'utensils', 3, 'sedentary', true),
  ('Party', 'sparkles', 3, 'active', true),
  ('Wedding', 'rings', 5, 'sedentary', true),
  ('Travel', 'plane', 2, 'active', true),
  ('College', 'book', 2, 'active', true),
  ('Gym', 'dumbbell', 1, 'high_activity', true),
  ('Family Event', 'home', 3, 'sedentary', true),
  ('Interview', 'briefcase', 4, 'sedentary', true),
  ('Beach', 'sun', 1, 'active', true),
  ('Casual Hangout', 'coffee', 1, 'sedentary', true),
  ('Formal Event', 'award', 5, 'sedentary', true)
on conflict do nothing;

-- -------------------------------------------------------------
-- Storage bucket for wardrobe photos (private, per-user folders)
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('wardrobe-photos', 'wardrobe-photos', false)
on conflict (id) do nothing;

drop policy if exists "wardrobe_photos_owner_select" on storage.objects;
create policy "wardrobe_photos_owner_select"
  on storage.objects for select
  using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "wardrobe_photos_owner_insert" on storage.objects;
create policy "wardrobe_photos_owner_insert"
  on storage.objects for insert
  with check (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "wardrobe_photos_owner_delete" on storage.objects;
create policy "wardrobe_photos_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
