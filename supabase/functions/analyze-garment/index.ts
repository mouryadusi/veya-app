// Supabase Edge Function (Deno runtime).
// Takes a wardrobe photo (already uploaded to Storage) and returns
// structured garment attributes using an OpenAI vision model.
// The OPENAI_API_KEY never reaches the client — it's a server-side secret
// configured with: supabase secrets set OPENAI_API_KEY=sk-...

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { GARMENT_ATTRIBUTE_SCHEMA } from "../_shared/garmentSchema.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY not configured on the server." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);

    const { wardrobe_item_id, image_url } = await req.json();
    if (!wardrobe_item_id || !image_url) {
      return json({ error: "wardrobe_item_id and image_url are required" }, 400);
    }

    // Confirm the item belongs to the caller before spending an AI call on it.
    const { data: item, error: itemErr } = await supabase
      .from("wardrobe_items")
      .select("id, user_id")
      .eq("id", wardrobe_item_id)
      .single();
    if (itemErr || !item || item.user_id !== userData.user.id) {
      return json({ error: "Wardrobe item not found for this user" }, 404);
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a fashion cataloguing assistant. Identify precise garment attributes from a clothing photo for a digital wardrobe app. " +
              "Real-world wardrobe photos are rarely perfect flat-lays — the garment may be folded, hanging at an angle, wrinkled, partially " +
              "visible, or photographed in imperfect lighting. Do your best from whatever evidence is actually visible rather than assuming an " +
              "ideal photo; lower your confidence values when the evidence is partial or ambiguous instead of declining to answer. Be concrete " +
              "and concise. " +
              GARMENT_ATTRIBUTE_SCHEMA,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract structured attributes for this garment photo." },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return json({ error: `Vision model request failed: ${errText}` }, 502);
    }

    const completion = await openaiRes.json();
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return json({ error: "No content returned from vision model" }, 502);

    const parsed = JSON.parse(raw);

    const { error: updateErr } = await supabase
      .from("wardrobe_items")
      .update({
        category: parsed.category,
        subcategory: parsed.subcategory ?? null,
        brand: parsed.brand ?? null,
        primary_color: parsed.primary_color ?? null,
        secondary_colors: parsed.secondary_colors ?? [],
        pattern: parsed.pattern ?? null,
        material: parsed.material ?? null,
        fit: parsed.fit ?? null,
        formality: parsed.formality ?? null,
        season_suitability: parsed.season_suitability ?? [],
        style_tags: parsed.style_tags ?? [],
        warmth_level: parsed.warmth_level ?? null,
        ai_confidence: parsed.confidence ?? null,
        attribute_confidence: parsed.attribute_confidence ?? null,
        ai_raw: parsed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wardrobe_item_id);

    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ attributes: parsed }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
