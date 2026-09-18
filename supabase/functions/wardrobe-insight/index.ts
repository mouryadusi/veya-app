// Supabase Edge Function (Deno runtime).
// "Why is this in my wardrobe?" — reasoned inferences about a garment's
// role relative to the rest of the user's wardrobe (versatility, gap-filling,
// color balance, climate fit). Deliberately NOT persisted anywhere: this
// reads existing columns only and returns computed text, so it has zero
// schema/migration dependency and can't break anything already deployed.
//
// Honesty constraint (explicit product requirement): every sentence here is
// a reasoned inference about a possibility, never presented as a known fact
// about the user's actual purchase intent — the model has no way to know
// why someone actually bought something, only what the wardrobe data
// suggests.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);

    const { wardrobe_item_id } = await req.json();
    if (!wardrobe_item_id) return json({ error: "wardrobe_item_id is required" }, 400);

    const { data: item, error: itemErr } = await supabase
      .from("wardrobe_items")
      .select("*")
      .eq("id", wardrobe_item_id)
      .eq("user_id", userData.user.id)
      .single();
    if (itemErr || !item) return json({ error: "Item not found" }, 404);

    const { data: restOfWardrobe, error: restErr } = await supabase
      .from("wardrobe_items")
      .select("category, subcategory, primary_color, material, formality, season_suitability, style_tags")
      .eq("user_id", userData.user.id)
      .eq("is_archived", false)
      .neq("id", wardrobe_item_id);
    if (restErr) return json({ error: restErr.message }, 500);

    if (!OPENAI_API_KEY) {
      return json({ error: "Styling insight isn't configured right now." }, 503);
    }

    // Cheap, honest signal computed directly from data (not the model's
    // opinion) — how many other items share this item's category and
    // primary color, so the model has real numbers to reason from instead
    // of inventing wardrobe composition claims.
    const sameCategoryCount = restOfWardrobe.filter((i) => i.category === item.category).length;
    const sameColorCount = restOfWardrobe.filter((i) => i.primary_color === item.primary_color).length;
    const neutralColors = ["black", "white", "grey", "gray", "navy", "beige", "cream", "charcoal", "tan"];
    const isNeutral = neutralColors.includes((item.primary_color ?? "").toLowerCase());
    const wardrobeNeutralBottomCount = restOfWardrobe.filter(
      (i) => i.category === "bottom" && neutralColors.includes((i.primary_color ?? "").toLowerCase())
    ).length;

    const wardrobeSummary = restOfWardrobe
      .slice(0, 40) // cap for prompt size — a representative sample is enough for this kind of reasoning
      .map((i) => `${i.primary_color ?? "?"} ${i.subcategory ?? i.category}`)
      .join(", ");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You are Veya, reasoning about ONE garment's place in a client's wardrobe as a whole — not describing the garment itself. " +
              "Write 2-4 sentences of genuine, specific reasoning about why this piece likely earns a place in their wardrobe: versatility, " +
              "what gap it fills relative to what they already own, color/formality balance, or practical fit for their apparent climate needs. " +
              "You have NO knowledge of why they actually bought it or how they feel about it — every claim must be phrased as a possibility " +
              "('this likely...', 'this probably...', 'this could be...'), never a stated fact. If the data doesn't support a specific inference, " +
              "say something more general rather than inventing specifics. Never mention exact counts/numbers in prose (e.g. don't say 'you have " +
              "5 bottoms') — use them only to calibrate whether a claim like 'versatile' or 'fills a gap' is actually supported. You have no " +
              "image of the client's body — never claim or imply anything about their body shape, proportions, or how this garment sits on " +
              "them; reason only about the garment's role relative to the rest of their wardrobe. No emoji, no headers, plain warm prose.",
          },
          {
            role: "user",
            content:
              `This garment: ${item.primary_color ?? "unknown color"} ${item.subcategory ?? item.category}, ${item.material ?? "material unknown"}, ` +
              `formality ${item.formality ?? "unknown"}/5, style tags: ${(item.style_tags ?? []).join(", ") || "none"}.\n` +
              `They own ${sameCategoryCount} other ${item.category} items and ${sameColorCount} other ${item.primary_color ?? "this color"} items overall. ` +
              `${isNeutral ? "This piece's color is neutral." : "This piece's color is not neutral (more of a statement/accent color)."} ` +
              `They own ${wardrobeNeutralBottomCount} neutral-colored bottoms.\n` +
              `A sample of the rest of their wardrobe: ${wardrobeSummary || "(wardrobe otherwise empty)"}.`,
          },
        ],
      }),
    });

    if (!res.ok) return json({ error: "Couldn't generate a styling insight right now." }, 502);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return json({ error: "Couldn't generate a styling insight right now." }, 502);

    return json({ insight: text }, 200);
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
