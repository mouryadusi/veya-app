# Veya — Phase 1: production foundation

An AI wardrobe-intelligence app. You already own the clothes; Veya tells you what to wear
from what's actually in your closet, and when you say "I don't like this," it pulls
another look from your own wardrobe — never a random new suggestion.

## Stack, and why

- **Expo (React Native) + expo-router** — one codebase, ships to iOS App Store, Google
  Play, and web. Chosen over a web-first stack because the brief's end goal is native
  app store distribution with camera-first wardrobe capture.
- **Supabase** — Postgres + Auth + Storage + Edge Functions in one place. Row Level
  Security enforces per-user data isolation at the database layer, not just in app code.
- **OpenAI (`gpt-4o-mini`, vision)** — garment attribute extraction from photos, and
  final outfit explanation. All calls happen server-side in Supabase Edge Functions —
  the API key never ships in the client bundle.
- **Open-Meteo** — free, keyless weather API for temperature/condition context.

## What's real in this phase

- Full Postgres schema with RLS on every table (`supabase/schema.sql`)
- Email/password auth, session persisted securely on-device
- Wardrobe capture: camera or library → Supabase Storage → AI vision attribute
  extraction (`analyze-garment` edge function) → editable structured record
- Outfit recommendation pipeline (`recommend-outfit` edge function) that actually
  follows: context → wardrobe retrieval → constraints → candidate generation →
  deterministic compatibility scoring → learned preference scoring → ranking → LLM
  explanation of the top pick → persistence
- "Try another" re-queries the user's own wardrobe pool (excluding what was already
  shown) — it never invents an item they don't own
- ❤️ / "Not for me" / "Try another" write to `feedback`, which a DB trigger rolls into
  `item_affinity`, a per-item learned preference score used in future scoring
- Wardrobe attribute correction (`app/wardrobe/[itemId].tsx`) — every AI-extracted
  field is editable; saving sets `user_verified = true` and the wardrobe grid flags
  anything not yet reviewed
- Insights dashboard (`app/(tabs)/insights.tsx`) — most worn, never worn, underused,
  most-versatile pieces, wardrobe gaps by category, and favorite combinations, all
  computed from real `wear_count` / `item_affinity` / loved-outfit data, nothing
  hardcoded
- Loving an outfit calls the `mark_outfit_worn` RPC, which increments `wear_count` and
  sets `last_worn_at` on each piece — **product decision to flag**: this treats "loved"
  as "worn today," which won't always be true (e.g. planning ahead). Worth splitting
  into separate "loved" and "I wore this" actions in a later phase if that matters to
  your users.

## What's stubbed / next phases

- **Onboarding depth**: skin tone/hair/eye/height fields exist in the schema and
  profile screen data model, but there's no dedicated UI to capture them yet.
- **Push notifications, offline caching, App/Play Store submission assets** (icons,
  screenshots, privacy manifest) — not started.
- **Tests** — not included in this phase; recommend adding Jest + Detox once the core
  flows above are validated against a real Supabase project.

Nothing above is faked in the meantime — those screens simply don't exist yet, rather
than existing as non-functional placeholders.

## Status against the "rebuild everything" request

You asked for nine things at once, framed as a complete rebuild. Here's the honest
breakdown of what actually happened this round, not a claim that all nine are done:

1. **Logo** — redesigned (asymmetric V monogram, one gold accent stroke) and applied
   to icon/adaptive-icon/splash/in-app monogram. Real improvement over the previous
   placeholder, but still a programmatically generated mark, not hand-crafted brand
   design. Treat it as a placeholder that no longer looks broken, not a finished identity.
2. **Closet testing / demo closet** — done. 12 illustrated starter items across every
   category, auto-seeded for every new account via a DB trigger, clearly badged
   "DEMO" in the wardrobe grid and item detail, addable/removable/editable exactly
   like real items. The recommendation pipeline works against them immediately.
3. **Presentation as brand direction** — not done. I couldn't fetch that URL (Rocket
   sites block automated access, and it needs an owner-only param), so there was
   nothing to actually study or translate. If you can paste the presentation's key
   screens/copy/palette here directly, I can work from that.
4. **Design references (Lusion, S0 Animation, etc.)** — not attempted as literal
   translation. Most of those are WebGL/cursor-driven web techniques with no mobile
   equivalent. What already exists in this app (editorial serif type, generous
   whitespace, restrained motion) reflects the same underlying principles those
   sites use, but I did not do a reference-by-reference study.
5. **Accessibility** — done, honestly scoped. One-tap profiles for all 24 named
   conditions in `app/accessibility.tsx`, each mapped transparently to real
   adjustments (contrast, text scale, spacing, motion, a color-blindness-safe
   palette, touch target size) rather than 24 fake bespoke modes — see
   `src/lib/accessibility/profiles.ts` for exactly what each one changes and why.
   Settings persist via AsyncStorage. Applied globally (brightness overlay, motion)
   and on the Accessibility/Profile screens; not yet threaded through every screen
   individually (see "still open" below).
6. **Missing app links** — added an "About Veya" link to the presentation site from
   Profile, using `Linking.openURL`. That's the one link that made sense to add;
   let me know if there are others (App Store listing, support, socials).
7. **Full onboarding → closet → AI → recommendation → history flow** — this was
   already real from Phase 1/2 and still is; the demo closet now makes it testable
   immediately without manual photo uploads first.
8. **Motion/scrolling redesign** — not done at the scope implied ("curved/parallax,
   depth"). The one concrete change: the outfit reveal's transition now respects
   "reduce motion" from the accessibility settings (instant cut instead of the
   slide/fade). No broader scroll-system redesign happened.
9. **Final quality pass across every screen** — not done. This round touched
   ~9 files with real, tested changes; it is not a full-app QA pass. See "still open."

## Still open after this round

- Accessibility (contrast/font scale) isn't yet wired into Home, Wardrobe, Insights,
  Onboarding, or the outfit reveal's item list — only Profile and Accessibility
  itself consume `theme.color`/`fontScale` right now. The mechanism is real and
  works; it needs to be threaded through the remaining screens.
- Item detail screen doesn't yet let you replace a demo item's illustration with
  your own photo in place — right now the flow is: add a new real item, then remove
  the demo one.
- No motion/scroll-system redesign, no literal design-reference translation, no
  verified connection to the presentation's visual language (see 3 and 4 above).
- Full QA pass (keyboard behavior, loading/error states on every screen, responsive
  layouts) not done as a dedicated pass in this round.

**Closed since the previous round:** saved-outfits/history screen (`app/(tabs)/history.tsx`,
reads real `outfits`+`feedback` data — building it also surfaced and fixed a real bug
where "loved" was never actually recorded as distinct from "worn"); a pluggable ML
model hook in the recommendation pipeline (`CUSTOM_MODEL_ENDPOINT`, contract documented
in `ML_INTEGRATION.md`) so a real model can re-rank candidates without touching the
rest of the pipeline.

## Setup

**Important, actual bug fixed this round:** this project had no `supabase/migrations/`
folder. `supabase db push` only applies tracked migration files — it was never
actually running `schema.sql`, despite what earlier instructions here said. If you
ran `db push` and it appeared to succeed, it succeeded at doing nothing. That is the
direct cause of "Bucket not found" on photo upload — the storage bucket in
`schema.sql` was never created. Fixed now: `schema.sql` is copied into
`supabase/migrations/00000000000001_init.sql`, so `db push` actually works. Every
statement in it (tables, policies, functions, the bucket) is idempotent — safe to
push again even if you'd previously pasted schema.sql into the SQL Editor by hand.

### 1. Create a Supabase project
Create a project at supabase.com, then from the project root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push               # now actually applies the migration — verify in the dashboard's Table Editor and Storage tab afterward
```

### 2. Configure secrets for the edge functions (server-side only)

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into edge
functions by Supabase — you don't set those yourself.

### 3. Deploy the edge functions

```bash
npx supabase functions deploy analyze-garment
npx supabase functions deploy recommend-outfit
npx supabase functions deploy extract-product
npx supabase functions deploy wardrobe-insight
npx supabase functions deploy delete-account
npx supabase functions deploy analyze-wardrobe-photo
# delete-account needs auth.admin privileges (the service role key already
# configured for the other functions covers this — no new secret needed).
# wardrobe-insight is new this round — it reads existing columns only and
# writes nothing, so it's safe to deploy regardless of whether the two
# pending migrations (attribute_confidence, explanation_detail) have
# actually applied yet. It doesn't depend on either one.
# All three changed this round — redeploy all three, and run
# `npx supabase db push` first for the two new migrations (attribute
# confidence + expandable stylist reasoning) to exist before they're used.
```

### 4. Configure the app

```bash
cp .env.example .env
# then fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# from Supabase dashboard -> Settings -> API
```

### 5. Install and run

```bash
npm install
npm run dev
```

This opens Expo Dev Tools — press `i` for iOS simulator, `a` for Android emulator, or
scan the QR code with the Expo Go app on your phone (camera upload needs a real device
or simulator with a working camera/photo library).

## Where things live

```
app/                      expo-router screens (file-based routing)
  (auth)/                 sign-in, sign-up
  (tabs)/                 home ("where are you going"), wardrobe, insights, profile
  outfit/[requestId].tsx  the outfit reveal + feedback screen
  wardrobe/[itemId].tsx   review/correct AI-extracted garment attributes
  onboarding.tsx           first-run style questions
src/
  lib/supabase/client.ts  Supabase client, SecureStore-backed session storage
  lib/ai/recommend.ts     typed client wrappers around the edge functions
  lib/insights.ts          wardrobe insights aggregation (most worn, gaps, etc.)
  theme/tokens.ts          Veya's design tokens (color, type, spacing, motion)
  types/database.ts        hand-written types matching schema.sql
supabase/
  schema.sql               full DB schema + RLS policies + triggers
  functions/analyze-garment/    vision-based garment attribute extraction
  functions/recommend-outfit/   the recommendation pipeline
```

## What I need from you to keep going

Nothing to unblock Phase 1 beyond the Supabase project + OpenAI key above. For Phase 2
(App Store / Play Store submission), you'll eventually need:
- An Apple Developer account ($99/yr) and a Google Play Developer account ($25 one-time)
- App icon and screenshot assets (I can generate a first pass on request)
- An EAS (Expo Application Services) account for cloud builds — `eas.json` isn't set up
  yet; that's a good Phase 2 starting point.
