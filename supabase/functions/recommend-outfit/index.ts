// Supabase Edge Function (Deno runtime).
// Implements the real pipeline:
//   context -> wardrobe retrieval -> constraints -> candidate outfits ->
//   compatibility scoring -> personal preference scoring -> ranking ->
//   explanation -> persistence (feedback/learning happens client-side via
//   the `feedback` table + `apply_feedback_to_affinity` trigger).
//
// This is intentionally NOT "prompt -> LLM -> random outfit". Candidate
// generation and scoring are deterministic; the LLM is only used at the
// end, over a short list of already-valid candidates, to pick the most
// contextually sensible one and explain the pick in plain language.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type WardrobeItem = {
  id: string;
  category: string;
  subcategory: string | null;
  primary_color: string | null;
  pattern: string | null;
  material: string | null;
  fit: string | null;
  formality: number | null;
  season_suitability: string[];
  style_tags: string[];
  warmth_level: number | null;
  wear_count: number;
  last_worn_at: string | null;
  is_archived: boolean;
};

type RequestBody = {
  occasion_label: string;
  when_at?: string;
  activity_note?: string;
  special_note?: string;
  location_lat?: number;
  location_lng?: number;
  location_label?: string; // e.g. "Mumbai, India" — from on-device reverse geocoding, real device data, never fabricated server-side
  exclude_item_ids?: string[]; // used for "try another" so we don't repeat
  lock_item_ids?: string[]; // forces these specific items into their slot instead of re-scoring — used by outfit-followup's "swap the shoes" so the rest of the outfit doesn't silently change too
  formality_bias?: number; // optional, -2..2 — used by outfit-followup for "make this less formal" style requests. Additive: existing callers that never send it are unaffected.
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);
    const userId = userData.user.id;

    const body: RequestBody = await req.json();
    if (!body.occasion_label) return json({ error: "occasion_label is required" }, 400);

    // ---- 1. Context ----------------------------------------------------
    const [{ data: profile }, { data: occasionPreset }, { data: lovedFeedback }, { data: recentOutfits }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("occasions")
        .select("*")
        .ilike("label", body.occasion_label)
        .limit(1)
        .maybeSingle(),
      // Real personal-style-pattern grounding: recurring colors/style tags
      // across outfits the user has actually loved. Not inferred, not
      // invented — a direct aggregation of their own feedback + wardrobe
      // data, gated by a minimum-occurrence threshold below so a single
      // outing doesn't get reported as "a pattern."
      supabase
        .from("feedback")
        .select("outfit_id, outfits!inner(outfit_items(wardrobe_items(primary_color, style_tags)))")
        .eq("user_id", userId)
        .eq("signal", "loved")
        .order("created_at", { ascending: false })
        .limit(20),
      // Real recent explanation TEXT (any outfit, any feedback signal) —
      // used only for genuine repetition detection in the critique pass
      // below. This is the user's own outfit history, not invented.
      supabase
        .from("outfits")
        .select("explanation, explanation_detail")
        .eq("user_id", userId)
        .eq("explanation_source", "ai")
        .order("shown_at", { ascending: false })
        .limit(3),
    ]);

    const rawTargetFormality = occasionPreset?.default_formality ?? 3;
    const formalityBias = Math.max(-2, Math.min(2, Math.round(body.formality_bias ?? 0)));
    const targetFormality = Math.max(1, Math.min(5, rawTargetFormality + formalityBias));
    const activityLevel = occasionPreset?.default_activity_level ?? "sedentary";

    const weather = await fetchWeather(body.location_lat, body.location_lng);

    // ---- 2. Wardrobe retrieval ------------------------------------------
    const { data: items, error: itemsErr } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("user_id", userId)
      .eq("is_archived", false);
    if (itemsErr) return json({ error: itemsErr.message }, 500);
    if (!items || items.length === 0) {
      return json({ error: "empty_wardrobe", message: "No wardrobe items found yet." }, 422);
    }

    const { data: affinities } = await supabase
      .from("item_affinity")
      .select("*")
      .eq("user_id", userId);
    const affinityMap = new Map((affinities ?? []).map((a) => [a.wardrobe_item_id, a.affinity]));

    // Recently-SHOWN items (not just recently-worn) — without this, a fresh
    // request for the same occasion on a different day is deterministic and
    // returns the identical top outfit every time, since nothing else
    // changes between requests. Looking at the last 8 top-ranked outfits
    // (any occasion) gives each of their pieces a mild novelty penalty,
    // proportional to how recently they were shown, so repeat requests
    // genuinely rotate through the wardrobe instead of converging on one
    // "best" combination forever.
    const { data: recentTopOutfits } = await supabase
      .from("outfits")
      .select("shown_at, outfit_items(wardrobe_item_id)")
      .eq("user_id", userId)
      .eq("rank", 1)
      .order("shown_at", { ascending: false })
      .limit(8);
    const recentlyShownRank = new Map<string, number>(); // item_id -> how many-th most recent (0 = most recent)
    (recentTopOutfits ?? []).forEach((outfit: any, idx: number) => {
      for (const oi of outfit.outfit_items ?? []) {
        if (!recentlyShownRank.has(oi.wardrobe_item_id)) recentlyShownRank.set(oi.wardrobe_item_id, idx);
      }
    });

    const excludeIds = new Set(body.exclude_item_ids ?? []);

    // ---- 3. Constraints ---------------------------------------------------
    const usable = (items as WardrobeItem[]).filter((i) => !excludeIds.has(i.id));
    const season = seasonFromWeather(weather);

    const bySlot = {
      top: usable.filter((i) => i.category === "top" || i.category === "traditional"),
      bottom: usable.filter((i) => i.category === "bottom"),
      dress: usable.filter((i) => i.category === "dress"),
      shoes: usable.filter((i) => i.category === "shoes"),
      outerwear: usable.filter((i) => i.category === "outerwear"),
      accessory: usable.filter((i) => i.category === "accessory"),
    };

    // Locked items (e.g. from a "swap the shoes" follow-up, where the user
    // means keep everything else) force that slot's pool down to exactly
    // the one item instead of letting it be freely re-scored. Without this,
    // excluding only the targeted slot's current item still let every OTHER
    // slot be picked fresh, which could silently change the top/bottom too
    // when the user only asked to change one thing.
    const lockedIds = new Set(body.lock_item_ids ?? []);
    if (lockedIds.size > 0) {
      for (const slot of Object.keys(bySlot) as (keyof typeof bySlot)[]) {
        const locked = bySlot[slot].filter((i) => lockedIds.has(i.id));
        if (locked.length > 0) bySlot[slot] = locked;
      }
    }

    // ---- 4. Candidate outfit generation ------------------------------------
    type Candidate = { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem };
    const candidates: Candidate[] = [];

    const shoePool = bySlot.shoes.length ? bySlot.shoes : [undefined];
    const outerwearLocked = bySlot.outerwear.some((i) => lockedIds.has(i.id));
    const outerPool = weather.needsLayer || outerwearLocked ? (bySlot.outerwear.length ? bySlot.outerwear : [undefined]) : [undefined];
    const accessoryLocked = bySlot.accessory.some((i) => lockedIds.has(i.id));
    const accessoryPool = accessoryLocked
      ? bySlot.accessory // exactly the locked item(s) — see bySlot lock filtering above — never fall back to "no accessory" when one was explicitly locked
      : bySlot.accessory.length
        ? [undefined, ...bySlot.accessory.slice(0, 3)]
        : [undefined];

    // Dress-based candidates
    for (const dress of bySlot.dress) {
      for (const shoes of shoePool) {
        for (const outerwear of outerPool) {
          for (const accessory of accessoryPool) {
            candidates.push({ dress, shoes, outerwear, accessory });
          }
        }
      }
    }
    // Top + bottom candidates
    for (const top of bySlot.top) {
      for (const bottom of bySlot.bottom) {
        for (const shoes of shoePool) {
          for (const outerwear of outerPool) {
            for (const accessory of accessoryPool) {
              candidates.push({ top, bottom, shoes, outerwear, accessory });
            }
          }
        }
      }
    }

    if (candidates.length === 0) {
      return json(
        { error: "insufficient_wardrobe", message: "Not enough compatible pieces to build an outfit yet." },
        422
      );
    }

    // ---- 5. Compatibility scoring (deterministic) --------------------------
    const scored = candidates.map((c) => {
      const compatibility = scoreCompatibility(c, { targetFormality, season, activityLevel, weather });
      const preference = scorePreference(c, affinityMap, recentlyShownRank);
      const final = compatibility * 0.65 + preference * 0.35;
      return { candidate: c, compatibility, preference, final };
    });

    scored.sort((a, b) => b.final - a.final);

    // De-duplicate near-identical candidates (same top+bottom regardless of accessory) and cap for the LLM pass
    const seen = new Set<string>();
    const shortlist = [];
    for (const s of scored) {
      const key = [s.candidate.top?.id, s.candidate.bottom?.id, s.candidate.dress?.id, s.candidate.shoes?.id].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      shortlist.push(s);
      if (shortlist.length >= 5) break;
    }

    // ---- 6. LLM ranking + explanation (only over the shortlist) ------------
    // ---- 5b. Optional custom ML model hook ---------------------------------
    let explanationOverride: string | null = null;
    // If CUSTOM_MODEL_ENDPOINT is configured, send it the deterministic
    // shortlist and let it re-rank/re-score. Contract is documented in
    // ML_INTEGRATION.md. Never blocks the response — any failure here just
    // falls back to the deterministic ranking already computed above.
    const customEndpoint = Deno.env.get("CUSTOM_MODEL_ENDPOINT");
    if (customEndpoint) {
      try {
        const modelRes = await fetch(customEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            context: {
              occasion: body.occasion_label,
              activity_note: body.activity_note ?? null,
              special_note: body.special_note ?? null,
              weather,
              profile,
            },
            candidates: shortlist.map((s, idx) => ({
              index: idx,
              compatibility_score: s.compatibility,
              preference_score: s.preference,
              items: {
                top: s.candidate.top?.id ?? null,
                bottom: s.candidate.bottom?.id ?? null,
                dress: s.candidate.dress?.id ?? null,
                shoes: s.candidate.shoes?.id ?? null,
                outerwear: s.candidate.outerwear?.id ?? null,
                accessory: s.candidate.accessory?.id ?? null,
              },
            })),
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (modelRes.ok) {
          const modelResult = await modelRes.json();
          // Expected shape: { ranking: number[] (candidate indices, best first), explanation?: string }
          if (Array.isArray(modelResult.ranking) && modelResult.ranking.length > 0) {
            const reordered = modelResult.ranking
              .map((idx: number) => shortlist[idx])
              .filter(Boolean);
            if (reordered.length > 0) {
              shortlist.length = 0;
              shortlist.push(...reordered);
              if (typeof modelResult.explanation === "string") {
                explanationOverride = modelResult.explanation;
              }
            }
          }
        }
      } catch {
        // Custom model unreachable/slow/malformed — silently keep the deterministic ranking.
      }
    }

    const top = shortlist[0];

    // Honest wardrobe-quality assessment. Thresholds are grounded in the
    // actual scoring scale above (baseline 100; formality mismatch costs up
    // to 6/point, season mismatch 12, missing shoes 15, missing top/bottom
    // 40) — not arbitrary numbers. A candidate can be the least-bad option
    // available and still be genuinely weak; up to now, reaching the
    // shortlist at all meant being presented with full confidence
    // regardless of score. This is what makes that distinction real instead
    // of hidden.
    const dressAvailable = bySlot.dress.length > 0;
    const missingCategoriesEntirely = (["top", "bottom", "shoes"] as const).filter((slot) => {
      if (bySlot[slot].length > 0) return false;
      if (slot !== "shoes" && dressAvailable) return false; // a dress can stand in for top+bottom being absent
      return true;
    });
    // Genuine alternative diversity: do the OTHER shortlist entries differ
    // in more than just which accessory got attached? (top+bottom+shoes
    // dedup already happened above, so anything left here is a real
    // difference in at least one major slot, not a manufactured variant.)
    const hasGenuineAlternatives = shortlist.length > 1;

    // Wardrobe-wide facts, correctly NOT per-candidate — true regardless of
    // which shortlist entry ends up displayed, so this stays valid even
    // when the client swaps to a different pool alternative from the same
    // batch. Quality is NOT included here anymore — it's genuinely
    // per-candidate (see assessQuality below, attached to each outfit
    // individually), and putting it here was the actual source of the
    // staleness bug: showing pool alternative #2 while a banner still
    // described candidate #1's score.
    const wardrobeAssessment = {
      missing_categories: missingCategoriesEntirely,
      has_genuine_alternatives: hasGenuineAlternatives,
    };

    // Used only for prompt-building below (the reasoning/critique/fallback
    // text need SOME quality signal for the pick actually being explained,
    // which at explanation-generation time is always `top`). This does not
    // get returned to the client as a top-level field — each outfit in the
    // response carries its own `quality` instead, computed from the same
    // assessQuality function so there is exactly one threshold definition.
    const topQualityForPrompt = { quality: assessQuality(top.final), missing_categories: missingCategoriesEntirely, has_genuine_alternatives: hasGenuineAlternatives };

    let explanationSummary =
      explanationOverride ?? deterministicExplanation(top.candidate, { targetFormality, season, weather, occasion: body.occasion_label }, topQualityForPrompt);
    let explanationDetail: string | null = null;

    let explanationSource: "ai" | "fallback" = "fallback";

    if (OPENAI_API_KEY && !explanationOverride) {
      try {
        const runnersUp = shortlist.slice(1, 3).map((s) => s.candidate);
        const stylePatterns = summarizeStylePatterns(lovedFeedback); // computed once, reused below — not recomputed per call
        const result = await explainWithLLM(
          top.candidate,
          { occasion: body.occasion_label, activityNote: body.activity_note, specialNote: body.special_note, weather, profile, locationLabel: body.location_label, stylePatterns, wardrobeAssessment: topQualityForPrompt },
          runnersUp
        );
        explanationSummary = result.summary;
        explanationDetail = result.detail;
        explanationSource = "ai";

        // Second, separately-framed pass: a real generate-then-critique
        // architecture, not the same call rationalizing its own output.
        // Deliberately narrow scope — it can only refine the detail text
        // with an honest acknowledgment of a genuine weakness; it never
        // re-ranks candidates or regenerates the outfit itself. A failure
        // here is invisible to the user: the un-critiqued explanation
        // already stands on its own.
        try {
          const recentExplanations = (recentOutfits ?? [])
            .map((o: any) => [o.explanation, o.explanation_detail].filter(Boolean).join(" "))
            .filter((s: string) => s.trim().length > 0);
          const critique = await critiqueReasoning(top.candidate, explanationSummary, explanationDetail, {
            occasion: body.occasion_label,
            weather,
            locationLabel: body.location_label,
            profile,
            stylePatterns,
            wardrobeAssessment: topQualityForPrompt,
          }, runnersUp, recentExplanations);
          if (critique) {
            explanationSummary = critique.summary;
            explanationDetail = critique.detail;
          }
        } catch (err) {
          console.error("Self-critique pass failed, keeping first-pass reasoning unchanged:", err instanceof Error ? err.message : err);
        }
      } catch (err) {
        // Previously swallowed completely silently — meaning a missing/invalid
        // OPENAI_API_KEY, a rate limit, or any transient API failure all
        // looked identical from the outside: the generic deterministic
        // template, forever, with zero way to diagnose why. Logging here
        // shows up in `supabase functions logs recommend-outfit`.
        console.error("LLM explanation failed, using deterministic fallback:", err instanceof Error ? err.message : err);
      }
    } else if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not set — every recommendation will use the generic deterministic explanation until this secret is configured.");
    }

    // ---- 7. Persist request + outfit(s) -------------------------------------
    const { data: request, error: reqErr } = await supabase
      .from("outfit_requests")
      .insert({
        user_id: userId,
        occasion_label: body.occasion_label,
        when_at: body.when_at ?? null,
        activity_note: body.activity_note ?? null,
        special_note: body.special_note ?? null,
        location_lat: body.location_lat ?? null,
        location_lng: body.location_lng ?? null,
        weather_snapshot: weather,
      })
      .select()
      .single();
    if (reqErr || !request) return json({ error: reqErr?.message ?? "Failed to save request" }, 500);

    const outfitsToInsert = shortlist.map((s, idx) => ({
      request_id: request.id,
      user_id: userId,
      rank: idx + 1,
      compatibility_score: Math.round(s.compatibility),
      preference_score: Math.round(s.preference),
      final_score: Math.round(s.final),
      explanation: idx === 0 ? explanationSummary : deterministicExplanation(s.candidate, { targetFormality, season, weather, occasion: body.occasion_label }),
      explanation_detail: idx === 0 ? explanationDetail : null,
      explanation_source: idx === 0 ? explanationSource : "fallback",
    }));

    const { data: insertedOutfitsRaw, error: outfitErr } = await supabase
      .from("outfits")
      .insert(outfitsToInsert)
      .select();
    if (outfitErr || !insertedOutfitsRaw) return json({ error: outfitErr?.message ?? "Failed to save outfits" }, 500);

    // Sort by the actual `rank` column rather than trusting that Postgres's
    // INSERT...RETURNING preserves array order — that's not a guaranteed
    // contract, and every positional lookup below (insertedOutfits[0],
    // .slice(1), the outfit_items mapping) silently depended on it holding.
    // `rank` exists in the schema specifically to make this safe.
    const insertedOutfits = [...insertedOutfitsRaw].sort((a, b) => a.rank - b.rank);

    const outfitItemRows = insertedOutfits.flatMap((outfit, idx) => {
      const c = shortlist[idx].candidate;
      const rows: { outfit_id: string; wardrobe_item_id: string; slot: string }[] = [];
      if (c.top) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.top.id, slot: "top" });
      if (c.bottom) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.bottom.id, slot: "bottom" });
      if (c.dress) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.dress.id, slot: "dress" });
      if (c.shoes) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.shoes.id, slot: "shoes" });
      if (c.outerwear) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.outerwear.id, slot: "outerwear" });
      if (c.accessory) rows.push({ outfit_id: outfit.id, wardrobe_item_id: c.accessory.id, slot: "accessory" });
      return rows;
    });
    await supabase.from("outfit_items").insert(outfitItemRows);

    return json(
      {
        request_id: request.id,
        top_outfit: { ...insertedOutfits[0], items: shortlist[0].candidate, quality: assessQuality(shortlist[0].final) },
        alternatives: insertedOutfits.slice(1).map((o, i) => ({ ...o, items: shortlist[i + 1].candidate, quality: assessQuality(shortlist[i + 1].final) })),
        wardrobe_assessment: wardrobeAssessment,
      },
      200
    );
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

// ------------------------------------------------------------------------
// Scoring
// ------------------------------------------------------------------------
function scoreCompatibility(
  c: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem },
  ctx: { targetFormality: number; season: string; activityLevel: string; weather: Weather }
): number {
  let score = 100;
  const pieces = [c.top, c.bottom, c.dress, c.shoes, c.outerwear].filter(Boolean) as WardrobeItem[];

  // Formality alignment: penalize distance from target formality
  for (const p of pieces) {
    if (p.formality != null) score -= Math.abs(p.formality - ctx.targetFormality) * 6;
  }

  // Season suitability
  for (const p of pieces) {
    if (p.season_suitability?.length && !p.season_suitability.includes(ctx.season)) score -= 12;
  }

  // Warmth vs. temperature
  const avgWarmth = average(pieces.map((p) => p.warmth_level ?? 3));
  const warmthTarget = ctx.weather.warmthTarget;
  score -= Math.abs(avgWarmth - warmthTarget) * 8;

  // Activity level: high activity penalizes very slim/formal fits
  if (ctx.activityLevel === "high_activity") {
    for (const p of pieces) {
      if (p.fit === "slim" && (p.formality ?? 3) >= 4) score -= 10;
    }
  }

  // "active" previously did nothing here — Beach/Travel/College/Party (all
  // "active") scored identically to a sedentary occasion of the same
  // formality (e.g. Movie, Dinner), which was the actual root cause of
  // near-identical outfits across genuinely different occasions. Real
  // differentiation: movement-heavy contexts favor practical materials and
  // penalize delicate/high-maintenance ones, independent of formality.
  if (ctx.activityLevel === "active" || ctx.activityLevel === "high_activity") {
    const delicateMaterials = ["silk", "satin", "suede", "chiffon", "cashmere", "velvet"];
    const practicalStyleTags = ["sporty", "casual", "practical", "minimalist", "streetwear"];
    for (const p of pieces) {
      if (p.material && delicateMaterials.some((m) => p.material!.toLowerCase().includes(m))) score -= 8;
      if (p.style_tags?.some((t) => practicalStyleTags.includes(t))) score += 4;
    }
  }

  // Missing essential slot (no top+bottom and no dress)
  if (!c.dress && (!c.top || !c.bottom)) score -= 40;
  if (!c.shoes) score -= 15;

  return clamp(score, 0, 100);
}

function scorePreference(
  c: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem },
  affinityMap: Map<string, number>,
  recentlyShownRank: Map<string, number>
): number {
  const pieces = [c.top, c.bottom, c.dress, c.shoes, c.outerwear, c.accessory].filter(Boolean) as WardrobeItem[];
  if (pieces.length === 0) return 50;

  let total = 0;
  for (const p of pieces) {
    const affinity = affinityMap.get(p.id) ?? 0; // learned from loved/disliked/try_another feedback
    // Mild recency nudge: items worn very recently score slightly lower, to encourage rotation
    const recentWornPenalty = p.last_worn_at && daysSince(p.last_worn_at) < 3 ? -5 : 0;
    // Novelty penalty: items shown as a top pick very recently (regardless of
    // whether the user ever acted on them) score lower too, tapering off —
    // the most-recently-shown item gets the biggest penalty, fading to
    // nothing by the 8th-most-recent. This is what actually prevents a
    // fresh request for the same occasion from deterministically returning
    // the identical outfit every time.
    const shownRank = recentlyShownRank.get(p.id);
    const noveltyPenalty = shownRank != null ? -(12 - shownRank * 1.5) : 0;
    total += 50 + affinity * 4 + recentWornPenalty + noveltyPenalty;
  }
  return clamp(total / pieces.length, 0, 100);
}

// Computes an honest "we've noticed a pattern" note from the user's ACTUAL
// loved-outfit history — never invented. Requires a color or style tag to
// appear across at least 3 distinct loved outfits before it's reported, so
// a single lucky outing doesn't get reported as "your signature style."
function summarizeStylePatterns(lovedFeedback: any[] | null): string | null {
  if (!lovedFeedback || lovedFeedback.length < 3) return null; // not enough history to claim any pattern at all

  const colorCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const fb of lovedFeedback) {
    const items = fb.outfits?.outfit_items ?? [];
    const seenColorsThisOutfit = new Set<string>();
    const seenTagsThisOutfit = new Set<string>();
    for (const oi of items) {
      const w = oi.wardrobe_items;
      if (!w) continue;
      if (w.primary_color) seenColorsThisOutfit.add(w.primary_color.toLowerCase());
      for (const t of w.style_tags ?? []) seenTagsThisOutfit.add(t);
    }
    // Count per-outfit presence once, not once per garment — a color
    // appearing on both the top and bottom of ONE loved outfit shouldn't
    // count as two separate occurrences toward "recurring."
    for (const c of seenColorsThisOutfit) colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
    for (const t of seenTagsThisOutfit) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  const THRESHOLD = 3;
  const topColor = [...colorCounts.entries()].filter(([, n]) => n >= THRESHOLD).sort((a, b) => b[1] - a[1])[0];
  const topTag = [...tagCounts.entries()].filter(([, n]) => n >= THRESHOLD).sort((a, b) => b[1] - a[1])[0];

  const bits: string[] = [];
  if (topColor) bits.push(`${topColor[0]} shows up often in outfits they've loved`);
  if (topTag) bits.push(`a ${topTag[0]} sensibility keeps recurring in what they've loved`);
  if (bits.length === 0) return null;

  return `A real pattern from their actual feedback history, not a guess: ${bits.join(", and ")}.`;
}

function deterministicExplanation(
  c: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem },
  ctx: { targetFormality: number; season: string; weather: Weather; occasion: string },
  wardrobeAssessment?: { quality: "strong" | "limited" | "weak"; missing_categories: string[] }
): string {
  const name = (item?: WardrobeItem) =>
    item ? [item.primary_color, item.subcategory ?? item.category].filter(Boolean).join(" ") : null;

  const anchor = c.dress ? name(c.dress) : [name(c.top), name(c.bottom)].filter(Boolean).join(" with the ");
  const sentences: string[] = [];

  if (anchor) {
    sentences.push(
      `The ${anchor} sits right at the formality this occasion calls for${
        ctx.occasion ? ` for ${ctx.occasion.toLowerCase()}` : ""
      }.`
    );
  }

  const neutrals = new Set(["white", "black", "navy", "grey", "gray", "charcoal", "cream", "beige", "camel", "tan", "brown"]);
  const topColor = c.dress?.primary_color ?? c.top?.primary_color;
  const bottomColor = c.bottom?.primary_color;
  if (topColor && bottomColor) {
    const bothNeutral = neutrals.has(topColor.toLowerCase()) && neutrals.has(bottomColor.toLowerCase());
    sentences.push(
      bothNeutral
        ? `${cap(topColor)} and ${bottomColor} keep the palette calm and easy to build around.`
        : `${cap(topColor)} against ${bottomColor} gives it a bit of contrast without fighting for attention.`
    );
  }

  if (ctx.weather.tempC != null) {
    sentences.push(
      c.outerwear
        ? `With ${name(c.outerwear)} layered on top, it'll hold up in today's ${Math.round(ctx.weather.tempC)}°C.`
        : `Right weight for today's ${Math.round(ctx.weather.tempC)}°C — no layer needed.`
    );
  }

  if (c.shoes) sentences.push(`${cap(name(c.shoes) ?? "")} finishes it without overdressing the rest.`);

  if (wardrobeAssessment && wardrobeAssessment.quality !== "strong") {
    sentences.push(
      wardrobeAssessment.missing_categories.length
        ? `Worth knowing: your wardrobe doesn't have any ${wardrobeAssessment.missing_categories.join(" or ")} yet, so this is the strongest combination available rather than an ideal one.`
        : `This is the strongest option your wardrobe supports for this right now — not a confident, ideal match.`
    );
  }

  return sentences.join(" ");
}

// Single source of truth for the quality threshold. Grounded in the actual
// scoring scale (baseline 100; see scoreCompatibility above for the real
// penalty values that produce these numbers) — not arbitrary. Used for
// EVERY candidate that needs a quality label: the top pick, prompt-building
// context, and now each individual outfit returned to the client. Before
// this was a single inline ternary computed once for `top` only, which is
// exactly why a pool alternative's own quality was never available to the
// client — there was nowhere to get it from.
function assessQuality(finalScore: number): "strong" | "limited" | "weak" {
  return finalScore >= 75 ? "strong" : finalScore >= 55 ? "limited" : "weak";
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// Shared by explainWithLLM and critiqueReasoning — previously each had its
// own separate, DIFFERENT version of this: explainWithLLM's included
// material/fit, critiqueReasoning's was a bare color+subcategory one-liner.
// That meant the critique pass judged outfits with strictly less
// information than the original reasoning had access to — a real quality
// gap, not just style duplication. One shared version fixes both at once.
function describeGarment(item?: WardrobeItem): string | null {
  if (!item) return null;
  const bits = [item.pattern && item.pattern !== "solid" ? item.pattern : null, item.primary_color, item.subcategory ?? item.category]
    .filter(Boolean)
    .join(" ");
  const detail = [item.material, item.fit ? `${item.fit} fit` : null].filter(Boolean).join(", ");
  return detail ? `${bits} (${detail})` : bits;
}

function describeOutfitCandidate(candidate: {
  top?: WardrobeItem;
  bottom?: WardrobeItem;
  dress?: WardrobeItem;
  shoes?: WardrobeItem;
  outerwear?: WardrobeItem;
  accessory?: WardrobeItem;
}): string {
  return [
    ["Dress", describeGarment(candidate.dress)],
    ["Top", describeGarment(candidate.top)],
    ["Bottom", describeGarment(candidate.bottom)],
    ["Outerwear", describeGarment(candidate.outerwear)],
    ["Shoes", describeGarment(candidate.shoes)],
    ["Accessory", describeGarment(candidate.accessory)],
  ]
    .filter(([, v]) => v)
    .map(([label, v]) => `${label}: ${v}`)
    .join(". ");
}

// One normalized context block, built once from structured inputs rather
// than each call site re-assembling its own ad-hoc string fragments in a
// different order/format. Ranked by how directly actionable each signal is
// for THIS decision: occasion/weather first (always relevant), then
// location (conditionally relevant), then profile signals (supporting,
// lowest-priority context) — not just concatenated in whatever order they
// happened to be computed.
function buildContextBlock(ctx: {
  occasion: string;
  activityNote?: string;
  specialNote?: string;
  weather: Weather;
  locationLabel?: string;
  profile?: { style_tags?: string[]; preferred_fit?: string; styling_notes?: string } | null;
  stylePatterns?: string | null;
  wardrobeAssessment?: { quality: "strong" | "limited" | "weak"; missing_categories: string[]; has_genuine_alternatives: boolean };
}): string {
  const weatherLine = `${ctx.weather.condition ?? "conditions unknown"}, ${
    ctx.weather.tempC != null ? `${Math.round(ctx.weather.tempC)}°C` : "temperature unknown"
  }${ctx.weather.needsLayer ? " (cool enough to want a layer)" : ""}`;

  const wa = ctx.wardrobeAssessment;
  const wardrobeLine =
    wa && wa.quality !== "strong"
      ? `Wardrobe honesty check — this pick is genuinely "${wa.quality}" quality (not strong) for this occasion${
          wa.missing_categories.length ? `, and their wardrobe has zero items in: ${wa.missing_categories.join(", ")}` : ""
        }. Say so plainly and briefly — don't oversell this as a confident, ideal match when it isn't. Being honest about a real limitation is better AI, not a failure.`
      : "";

  const lines: string[] = [
    `Occasion: ${ctx.occasion}.`,
    ctx.activityNote ? `Activity: ${ctx.activityNote}.` : "",
    ctx.specialNote ? `Note: ${ctx.specialNote}.` : "",
    `Weather: ${weatherLine}.`,
    ctx.locationLabel ? `Location: ${ctx.locationLabel} — use this for regional/cultural dress context if relevant, never assume more than the name itself tells you.` : "",
    ctx.profile?.style_tags?.length ? `Their style leans ${ctx.profile.style_tags.join("/")}.` : "",
    ctx.profile?.preferred_fit ? `They generally prefer a ${ctx.profile.preferred_fit} fit.` : "",
    // Deduplication: if styling_notes happens to restate something already
    // covered by style_tags, both still get sent (the user's own exact
    // words carry more weight than a tag), but at least each is emitted
    // once, not accidentally rebuilt twice by different code paths — which
    // is the actual risk when context is assembled ad hoc per call site.
    ctx.profile?.styling_notes?.trim() ? `They've told you directly: "${ctx.profile.styling_notes.trim()}"` : "",
    ctx.stylePatterns ?? "",
    wardrobeLine,
  ].filter((l) => l.length > 0);

  return lines.join(" ");
}

async function explainWithLLM(
  c: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem },
  ctx: { occasion: string; activityNote?: string; specialNote?: string; weather: Weather; profile: any; locationLabel?: string; stylePatterns?: string | null; wardrobeAssessment?: { quality: "strong" | "limited" | "weak"; missing_categories: string[]; has_genuine_alternatives: boolean } },
  runnersUp: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem }[]
): Promise<{ summary: string; detail: string }> {
  const outfitDescription = describeOutfitCandidate(c);

  // Real runner-up candidates from the same ranking pass — grounds "what
  // alternatives were considered" in actual data instead of the model
  // inventing plausible-sounding rejected options.
  const runnerUpLines = runnersUp
    .slice(0, 2)
    .map((r, i) => `Alternative ${i + 1} — ${describeOutfitCandidate(r)}`)
    .join("\n");

  const contextBlock = buildContextBlock({
    occasion: ctx.occasion,
    activityNote: ctx.activityNote,
    specialNote: ctx.specialNote,
    weather: ctx.weather,
    locationLabel: ctx.locationLabel,
    profile: ctx.profile,
    stylePatterns: ctx.stylePatterns,
    wardrobeAssessment: ctx.wardrobeAssessment,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 750,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Veya, an excellent personal stylist talking to a client whose outfit you just assembled entirely from their own wardrobe. " +
            "Return ONLY valid JSON: {\"summary\": string, \"detail\": string}. No markdown fences.\n\n" +
            "=== THE STANDARD ===\n" +
            "Never state that pieces 'match', 'work well together', 'complement each other', 'look stylish', 'create balance', or that shoes/" +
            "accessories 'complete the outfit' or 'add a nice touch' WITHOUT immediately explaining the actual visual or functional cause. Every " +
            "claim needs a 'because' chained to a specific, concrete effect. The chain is always: choice → visual/functional effect → why that " +
            "effect suits THIS occasion. Example of the depth required: not 'the dark jacket looks sophisticated' but 'the darker jacket creates " +
            "more visual weight through the shoulders, which reads as more composed here because the occasion calls for authority rather than " +
            "ease.' Banned unless followed by real reasoning: 'the top works well with the bottom', 'the colors complement each other', 'this " +
            "creates a balanced look', 'the outfit looks stylish', 'the shoes complete the outfit', 'the accessories add a nice touch', 'this is " +
            "perfect for the occasion.'\n\n" +
            "=== WHAT TO REASON ABOUT (as depth guidance, not a template — don't mechanically cover every category every time; let the actual " +
            "outfit decide what's worth explaining) ===\n" +
            "Color: don't say colors 'match' — explain what each meaningful color actually does: does it create contrast, pull attention toward " +
            "the face, add energy or read as more authoritative, or does a darker/neutral piece stop a bold color from overwhelming the outfit? " +
            "Would a different shade change the effect?\n" +
            "Material: explain what the visible material (from what's actually recorded — cotton, wool, silk, denim, leather, etc.) communicates " +
            "— structured vs. soft, matte vs. glossy, casual vs. formal, heavy vs. light — and how that shapes the impression.\n" +
            "Fit and relative silhouette: you have NO photo of this person's body, so never claim to have observed their proportions, height, or " +
            "shape — that would be fabrication. Instead reason about how the recorded FIT of each piece (slim/regular/relaxed/oversized) " +
            "interacts with the others: e.g. a relaxed top over a slim trouser generally reads as more contemporary and less rigid than matching " +
            "structure top-to-bottom; a slim silhouette throughout generally reads cleaner/more formal. Frame these as how fit types typically " +
            "interact, not as observations about this specific person's body.\n" +
            "Shoes: explain why they suit the rest of the outfit on formality, color, and weight — or say plainly if they introduce unnecessary " +
            "contrast, rather than defaulting to praise.\n" +
            "Accessories: do not automatically praise an included accessory. If it earns its place, say what it specifically adds (controlled " +
            "contrast, a formality cue, a focal point). If it's genuinely superfluous or fights with the rest of the outfit, say so.\n" +
            "Overall impression: name what the outfit communicates (confident, relaxed, authoritative, approachable, etc.) but tie it to the " +
            "specific elements that create that impression — never a bare adjective list.\n" +
            "Occasion: explain why this level of formality and this visual character actually suits the stated occasion, weather, and any note " +
            "given — the same outfit could be wrong for a different occasion, so say what about THIS one makes it fit. Two visually similar " +
            "outfits for different occasions deserve genuinely different reasoning, not the same explanation with the occasion word swapped — " +
            "the underlying logic must change. Let the occasion's actual character guide what you emphasize (these are directions, not scripts " +
            "to follow verbatim): a business/work context calls for reasoning about polish, restraint, and credibility; an interview calls for " +
            "trustworthiness and controlled presentation; a date calls for intentionality and personality rather than pure formality; a wedding " +
            "calls for celebration-appropriate refinement; a dinner calls for atmosphere and sophistication; a party calls for energy and visual " +
            "impact; travel/vacation calls for climate, comfort, and practicality; a casual gathering calls for effortless ease. Use whichever " +
            "of these actually fits the stated occasion — don't force all of them in.\n" +
            "Alternatives: if other combinations from their wardrobe are listed below, use them to explain what was chosen over what, and why — " +
            "grounded in those real alternatives, never invented ones. If none are listed, don't invent any.\n\n" +
            "=== GROUNDING ===\n" +
            "Only reason about attributes actually given below (category, color, pattern, material, fit). Never invent specific construction " +
            "details that weren't recorded — no fabricated collar shapes, stitching, hardware, or lapel styles unless they appear in the item's " +
            "own description. If there's a genuinely meaningful improvement available (a specific swap, not invented criticism for its own sake), " +
            "name it briefly; if the outfit is already strong, say so and note the smallest thing that would elevate it further — don't manufacture " +
            "a flaw that isn't there.\n\n" +
            "=== OUTPUT SHAPE ===\n" +
            "summary — ONE causal sentence (max 25 words): a specific choice, its effect, and why that matters here. Never a generic compliment.\n" +
            "detail — 5-8 sentences of flowing prose (no headers, no bullet points, no list). This must read differently for a different outfit " +
            "or a different occasion — never a reusable template with the nouns swapped in. Never suggest buying anything new — everything is " +
            "already in their wardrobe. Confident and observational, like a stylist who actually looked at these exact clothes.",
        },
        {
          role: "user",
          content: `${contextBlock}\n\nChosen outfit —\n${outfitDescription}${
            runnerUpLines ? `\n\nOther combinations from their wardrobe that were considered and NOT chosen —\n${runnerUpLines}` : ""
          }`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`LLM explanation failed: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty LLM explanation");
  const parsed = JSON.parse(raw);
  if (!parsed.summary || !parsed.detail) throw new Error("Malformed LLM explanation shape");
  return { summary: parsed.summary, detail: parsed.detail };
}

/**
 * Second-stage self-critique — a separate model call with a deliberately
 * skeptical framing, reviewing the FIRST call's output rather than being
 * asked to second-guess itself mid-generation. This is a real architectural
 * choice, not just "add a critique paragraph to the same prompt": a single
 * call rationalizing its own answer is well-documented to be a weak critic
 * of itself, because it's primed by having just produced that answer. A
 * fresh call with no memory of generating the pick, told explicitly to look
 * for weaknesses, is a materially different (and stronger) check.
 *
 * Scope is deliberately narrow: it can only return refined `detail` text
 * that honestly names a real weakness and what would improve it, using the
 * SAME real runner-up candidates already computed — never invents a
 * different one, never re-ranks, never touches which pieces were chosen.
 * Returns null (keep the original) if the critique finds nothing genuine to
 * add, or if anything about the call fails.
 */
async function critiqueReasoning(
  c: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem },
  summary: string,
  detail: string,
  ctx: { occasion: string; weather: Weather; locationLabel?: string; profile?: any; stylePatterns?: string | null; wardrobeAssessment?: { quality: "strong" | "limited" | "weak"; missing_categories: string[]; has_genuine_alternatives: boolean } },
  runnersUp: { top?: WardrobeItem; bottom?: WardrobeItem; dress?: WardrobeItem; shoes?: WardrobeItem; outerwear?: WardrobeItem; accessory?: WardrobeItem }[],
  recentExplanations: string[]
): Promise<{ summary: string; detail: string } | null> {
  // Previously had its own bare "color + subcategory" describe() — meaning
  // the critique judged outfits with strictly less information (no
  // material/fit) than the original reasoning pass had. Now shares the
  // same detailed function, so critique quality can't silently lag behind.
  const outfitLine = describeOutfitCandidate(c);
  const runnerUpLines = runnersUp.map((r) => describeOutfitCandidate(r)).filter((s) => s.length > 0);
  const contextBlock = buildContextBlock({
    occasion: ctx.occasion,
    weather: ctx.weather,
    locationLabel: ctx.locationLabel,
    profile: ctx.profile,
    stylePatterns: ctx.stylePatterns,
    wardrobeAssessment: ctx.wardrobeAssessment,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a skeptical senior creative director reviewing a junior stylist's pick and written reasoning — you did not make this pick " +
            "yourself, so evaluate it fresh rather than assume it's correct. Return ONLY JSON: {\"verdict\": \"strong\" | \"improvable\", " +
            "\"refined_summary\": string | null, \"refined_detail\": string | null}.\n\n" +
            "Genuinely ask: does the reasoning actually hold up, or does it lean on vague phrases without real support? Is there a real " +
            "weakness the original reasoning glossed over? Does a listed alternative genuinely address that weakness better in some specific " +
            "way — and if so, is that worth naming honestly rather than pretending the chosen pick has no trade-offs? If this stylist's recent " +
            "past explanations are shown below, also check BOTH the one-line summary and the longer detail against them: does either lean on " +
            "the same sentence structure, opening phrase, or specific wording — not just the same topic (weather/occasion will legitimately " +
            "recur), but the same way of saying it? The short summary is what the client sees first and is just as easy to fall into a template " +
            "with as the longer detail — check it with equal scrutiny, don't only look at the detail text.\n\n" +
            "If the pick and reasoning genuinely hold up with nothing meaningful to add: verdict 'strong', both refined fields null. Do NOT " +
            "invent a flaw just to have one — a confident 'this works, here's why' is a completely valid outcome and should be the common case, " +
            "not the exception. Only mark 'improvable' when there's a real, specific, honest weakness OR genuine repetition of prior phrasing " +
            "in either field. If 'improvable' due to a styling trade-off, be specific and actionable, not generic ('try different accessories' " +
            "is not acceptable) — structure the addition as: which specific piece to KEEP and why it's doing real work (e.g. a wide-leg trouser " +
            "balancing a fitted top), which specific piece to RECONSIDER and why (name the actual visual problem — too much visual weight, " +
            "competing pattern, formality mismatch, proportion imbalance — using only the color/material/pattern/fit/subcategory data actually " +
            "given, never inventing construction details like neckline or sleeve shape that weren't provided), what a replacement in that slot " +
            "should look like in general terms (e.g. 'a slimmer, low-profile shoe' — not a specific item, since nothing more specific is " +
            "grounded in their real wardrobe unless it's one of the listed alternatives), and the concrete visual effect that change would " +
            "have. Append this as one to two sentences in the same voice as the original (same person talking, not a new format/heading) — " +
            "refined_detail is the ORIGINAL detail text plus this addition; refined_summary stays null unless the summary itself also needs a " +
            "rewrite. If 'improvable' due to repetition: rewrite whichever field(s) actually repeat past phrasing with a genuinely different " +
            "opening and structure, same underlying facts — set the other field's refined value to null if it didn't need changing.",
        },
        {
          role: "user",
          content:
            `${contextBlock}\n\n` +
            `Chosen outfit: ${outfitLine}\n\n` +
            `Reasoning given: "${summary} ${detail}"\n\n` +
            (runnerUpLines.length ? `Real alternatives from their wardrobe that were NOT chosen:\n${runnerUpLines.join("\n")}` : "No other real alternatives were available.") +
            (recentExplanations.length
              ? `\n\nThis stylist's last ${recentExplanations.length} explanations for this same person, most recent first:\n` +
                recentExplanations.map((e, i) => `${i + 1}. "${e}"`).join("\n")
              : "\n\nNo prior explanations exist yet for this person — nothing to compare for repetition."),
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.verdict !== "improvable") return null; // 'strong' verdict, or malformed — either way, keep the original unchanged

    const hasSummaryFix = typeof parsed.refined_summary === "string" && parsed.refined_summary.trim();
    const hasDetailFix = typeof parsed.refined_detail === "string" && parsed.refined_detail.trim();
    if (!hasSummaryFix && !hasDetailFix) return null; // said 'improvable' but gave nothing usable — treat as no-op rather than trust a malformed response

    return {
      summary: hasSummaryFix ? parsed.refined_summary.trim() : summary,
      detail: hasDetailFix ? parsed.refined_detail.trim() : detail,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------
// Weather (lightweight, no API key required — Open-Meteo is free/keyless)
// ------------------------------------------------------------------------
type Weather = { tempC: number | null; condition: string | null; needsLayer: boolean; warmthTarget: number };

async function fetchWeather(lat?: number, lng?: number): Promise<Weather> {
  if (lat == null || lng == null) {
    return { tempC: null, condition: null, needsLayer: false, warmthTarget: 3 };
  }
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`
    );
    if (!res.ok) throw new Error("weather fetch failed");
    const data = await res.json();
    const tempC = data?.current?.temperature_2m ?? null;
    const code = data?.current?.weather_code ?? null;
    const warmthTarget = tempC == null ? 3 : tempC < 5 ? 5 : tempC < 12 ? 4 : tempC < 20 ? 3 : tempC < 27 ? 2 : 1;
    return {
      tempC,
      condition: code != null ? weatherCodeToText(code) : null,
      needsLayer: tempC != null && tempC < 16,
      warmthTarget,
    };
  } catch {
    return { tempC: null, condition: null, needsLayer: false, warmthTarget: 3 };
  }
}

function weatherCodeToText(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "foggy";
  if (code <= 67) return "rainy";
  if (code <= 77) return "snowy";
  if (code <= 82) return "showers";
  return "stormy";
}

function seasonFromWeather(w: Weather): string {
  const month = new Date().getMonth(); // 0-11
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

function average(nums: number[]): number {
  if (!nums.length) return 3;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
