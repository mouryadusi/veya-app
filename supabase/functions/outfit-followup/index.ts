// Supabase Edge Function (Deno runtime).
//
// "Ask about this outfit" — the natural-language follow-up layer:
//   "Why didn't you choose my black trousers?"
//   "Why is this better than the other option?"
//   "Make this less formal."
//   "Change the shoes."
//   "What would you change?"
//
// Design principle: this does NOT replace the recommendation pipeline or
// invent a second source of truth. It either (a) answers using ONLY the
// real outfit/alternatives/wardrobe data already stored for this request,
// or (b) re-invokes the EXISTING recommend-outfit function with an
// additional constraint (exclude_item_ids for a slot swap, formality_bias
// for "less/more formal") — the same mechanisms tryAnotherOutfit already
// uses, not new pipeline logic. A single LLM call both classifies the
// intent and drafts the grounded answer, so there's one round trip, not a
// separate intent-classifier model.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

type WardrobeItemLite = {
  id: string;
  category: string;
  subcategory: string | null;
  primary_color: string | null;
  pattern: string | null;
  material: string | null;
  fit: string | null;
  formality: number | null;
};

const SLOTS = ["outerwear", "top", "dress", "bottom", "shoes", "accessory"] as const;

function describeItem(item: WardrobeItemLite | null): string {
  if (!item) return "(none)";
  const bits = [item.pattern && item.pattern !== "solid" ? item.pattern : null, item.primary_color, item.subcategory ?? item.category]
    .filter(Boolean)
    .join(" ");
  const detail = [item.material, item.fit ? `${item.fit} fit` : null].filter(Boolean).join(", ");
  return detail ? `${bits} (${detail})` : bits;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);
    const userId = userData.user.id;

    const { outfit_id, message, history } = await req.json();
    const priorTurns: { role: string; text: string }[] = Array.isArray(history) ? history.slice(-6) : []; // cap: last 6 turns is plenty of context, keeps the prompt bounded
    if (!outfit_id || typeof outfit_id !== "string") return json({ error: "outfit_id is required" }, 400);
    if (!message || typeof message !== "string" || !message.trim()) return json({ error: "message is required" }, 400);
    if (message.length > 500) return json({ error: "Message is too long — keep it under 500 characters." }, 400);

    // Fetch the outfit, its request context, its own items, and its sibling
    // outfits from the same request (the real ranked alternatives — never
    // invented ones).
    const { data: outfit, error: outfitErr } = await supabase
      .from("outfits")
      .select("*, outfit_requests(*), outfit_items(slot, wardrobe_items(*))")
      .eq("id", outfit_id)
      .eq("user_id", userId)
      .single();
    if (outfitErr || !outfit) return json({ error: "Outfit not found" }, 404);

    const { data: siblings } = await supabase
      .from("outfits")
      .select("id, rank, outfit_items(slot, wardrobe_items(*))")
      .eq("request_id", outfit.outfit_requests.id)
      .neq("id", outfit_id)
      .order("rank", { ascending: true })
      .limit(3);

    const currentBySlot: Record<string, WardrobeItemLite | null> = {};
    for (const slot of SLOTS) currentBySlot[slot] = null;
    for (const oi of outfit.outfit_items ?? []) {
      currentBySlot[oi.slot] = oi.wardrobe_items ?? null;
    }

    const alternativesDescription = (siblings ?? [])
      .map((s: any, i: number) => {
        const bySlot: Record<string, WardrobeItemLite | null> = {};
        for (const oi of s.outfit_items ?? []) bySlot[oi.slot] = oi.wardrobe_items ?? null;
        const pieces = SLOTS.map((slot) => (bySlot[slot] ? `${slot}: ${describeItem(bySlot[slot])}` : null))
          .filter(Boolean)
          .join(", ");
        return `Alternative ${i + 1} (not chosen): ${pieces}`;
      })
      .join("\n");

    const currentDescription = SLOTS.map((slot) => (currentBySlot[slot] ? `${slot}: ${describeItem(currentBySlot[slot])}` : null))
      .filter(Boolean)
      .join(", ");

    // Also surface a few other wardrobe items in the same category as
    // whatever's currently worn, in case the user asks about a specific
    // item that was never in the shortlist at all (e.g. "why not my black
    // trousers" when black trousers exist but scored too low to shortlist).
    const { data: wardrobeSample } = await supabase
      .from("wardrobe_items")
      .select("id, category, subcategory, primary_color, pattern, material, fit, formality")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .limit(60);

    if (!OPENAI_API_KEY) return json({ error: "Styling assistant isn't configured right now." }, 503);

    const classifyRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 380,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are Veya, a personal stylist answering a follow-up question about an outfit you already recommended. " +
              "Return ONLY valid JSON: {\"action\": \"explain\"|\"swap_item\"|\"adjust_formality\"|\"unsupported\", " +
              "\"target_slot\": string|null, \"formality_delta\": number|null, \"answer\": string}.\n\n" +
              "action=\"explain\" — the user is asking why something was/wasn't chosen, or asking you to compare this outfit to an alternative. " +
              "Answer using ONLY the actual outfit, alternatives, and wardrobe items given below — never invent a garment, color, or attribute " +
              "that isn't in that data. If they ask about a specific item (e.g. 'my black trousers') and it genuinely isn't in the wardrobe " +
              "sample provided, say you don't have that item on record rather than guessing. If it exists but wasn't chosen, explain the actual " +
              "likely reason using its real attributes (formality/color/material mismatch, etc.) — phrase it as reasoning, not certainty, since " +
              "you're inferring the scoring reason, not quoting an exact internal number.\n" +
              "action=\"swap_item\" — the user wants a specific slot changed (e.g. 'change the shoes', 'I don't like the jacket'). Set target_slot " +
              "to exactly one of: outerwear, top, dress, bottom, shoes, accessory. Set answer to a brief acknowledgment (under 20 words) — the " +
              "actual replacement will be generated separately, so do not describe a specific replacement item yourself.\n" +
              "action=\"adjust_formality\" — the user wants the outfit more or less formal/dressy/casual. Set formality_delta to -2..2 (negative = " +
              "less formal). Set answer to a brief acknowledgment (under 20 words).\n" +
              "action=\"unsupported\" — the request isn't something this can act on (e.g. asking about body fit, asking for a totally unrelated " +
              "outfit from scratch, or requesting something with no basis in the provided data). Say plainly what you can't do and why, without " +
              "inventing a workaround.\n\n" +
              "Never claim to observe the user's body, proportions, shoulders, waist, or how the clothing sits on them — you have no image of " +
              "the person, only garment data. Reason about garments and their recorded fit values only.\n\n" +
              "If earlier turns from this conversation are included below, use them — a message like 'even less' or 'try that again but warmer' " +
              "only makes sense in light of what was just asked. Don't treat each message as if it arrived with no history.",
          },
          {
            role: "user",
            content:
              `Occasion: ${outfit.outfit_requests.occasion_label}.\n\n` +
              `Current outfit — ${currentDescription}\n\n` +
              (alternativesDescription ? `Other options that were NOT chosen —\n${alternativesDescription}\n\n` : "") +
              `A sample of their wider wardrobe (for reference if they ask about a specific item) —\n` +
              (wardrobeSample ?? []).map((w) => `[${w.id}] ${describeItem(w)}`).join("\n") +
              (priorTurns.length
                ? `\n\nEarlier in this conversation —\n` + priorTurns.map((t) => `${t.role === "user" ? "User" : "You"}: ${t.text}`).join("\n")
                : "") +
              `\n\nUser's question: "${message.trim()}"`,
          },
        ],
      }),
    });

    if (!classifyRes.ok) return json({ error: "Couldn't process that question right now." }, 502);
    const classifyData = await classifyRes.json();
    const raw = classifyData.choices?.[0]?.message?.content?.trim();
    if (!raw) return json({ error: "Couldn't process that question right now." }, 502);

    let parsed: { action: string; target_slot: string | null; formality_delta: number | null; answer: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "Couldn't process that question right now." }, 502);
    }

    // action=explain / unsupported: just return the grounded answer, no pipeline re-run.
    if (parsed.action !== "swap_item" && parsed.action !== "adjust_formality") {
      return json({ action: "explain", answer: parsed.answer }, 200);
    }

    // action=swap_item or adjust_formality: re-invoke the EXISTING
    // recommend-outfit function — same mechanism tryAnotherOutfit already
    // uses (exclude_item_ids), plus the new additive formality_bias. This
    // does not duplicate pipeline logic; it reuses it.
    const excludeIds: string[] = [];
    const lockIds: string[] = [];
    if (parsed.action === "swap_item" && parsed.target_slot && SLOTS.includes(parsed.target_slot as any)) {
      const currentItem = currentBySlot[parsed.target_slot];
      if (currentItem) excludeIds.push(currentItem.id);
      // "Swap the shoes" means keep everything else exactly as it is —
      // without this, the pipeline was free to re-pick every other slot
      // too, since only the targeted item was excluded and nothing forced
      // the rest to stay put.
      for (const slot of SLOTS) {
        if (slot === parsed.target_slot) continue;
        const item = currentBySlot[slot];
        if (item) lockIds.push(item.id);
      }
    }

    const followUpRes = await fetch(`${FUNCTIONS_URL}/recommend-outfit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occasion_label: outfit.outfit_requests.occasion_label,
        activity_note: outfit.outfit_requests.activity_note,
        special_note: outfit.outfit_requests.special_note,
        location_lat: outfit.outfit_requests.location_lat,
        location_lng: outfit.outfit_requests.location_lng,
        exclude_item_ids: excludeIds,
        lock_item_ids: lockIds,
        formality_bias: parsed.action === "adjust_formality" ? parsed.formality_delta ?? 0 : 0,
      }),
    });

    if (!followUpRes.ok) {
      // The re-run failed (e.g. wardrobe too small to satisfy the
      // exclusion) — still give the user the acknowledgment plus an honest
      // note, rather than a silent failure.
      return json({ action: "explain", answer: `${parsed.answer} I wasn't able to generate an updated version — your wardrobe may not have enough alternatives for that change.` }, 200);
    }
    const followUpResult = await followUpRes.json();
    return json({ action: parsed.action, answer: parsed.answer, updated_outfit: followUpResult }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
