// Supabase Edge Function (Deno runtime).
// "Scan multiple items" — point the camera at several garments in one shot
// (a closet, a pile of laundry, items laid out) and get back a list of
// detected pieces to add individually.
//
// Honest scope limitation, stated plainly rather than hidden: this does
// NOT crop individual item photos out of the source image. Precise
// per-object bounding-box extraction from a vision model's output is not
// something I can verify will work reliably without a live test
// environment, so rather than claim that capability and risk shipping
// broken crops, every detected item references the SAME source photo.
// The user sees a photo of their wardrobe with several detected item
// cards below it — each becomes its own wardrobe_items row pointing at
// that one shared photo, with its own attributes. That's an honest,
// working version of "detect multiple items," not the full "tap a region
// of the photo" experience.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MULTI_ITEM_SCHEMA = `Return ONLY valid JSON, no markdown fences:
{
  "items": [
    {
      "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "traditional",
      "subcategory": string,
      "primary_color": string,
      "pattern": "solid" | "striped" | "plaid" | "floral" | "print" | "checked" | "textured" | "other",
      "material": string,
      "fit": "slim" | "regular" | "relaxed" | "oversized",
      "formality": number,
      "season_suitability": ("spring"|"summer"|"fall"|"winter")[],
      "style_tags": string[],
      "warmth_level": number,
      "confidence": number,
      "position_hint": string
    }
  ]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);

    const { image_url } = await req.json();
    if (!image_url) return json({ error: "image_url is required" }, 400);

    if (!OPENAI_API_KEY) return json({ error: "Vision analysis isn't configured right now." }, 503);

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a fashion cataloguing assistant looking at a photo that may contain SEVERAL distinct garments — a wardrobe, a closet " +
              "rail, clothes laid out or piled up, not necessarily a single flat-lay product shot. Identify EVERY distinct garment or " +
              "accessory you can make out, even if partially visible, folded, hanging at an angle, or overlapping with others — real-world " +
              "wardrobe photos are rarely perfect flat-lays, so do your best from partial/imperfect evidence rather than only reporting items " +
              "shown perfectly. For each one, note roughly where it is in the frame in `position_hint` (e.g. 'top left, hanging', 'center, " +
              "folded on shelf') so the user can tell which detected item is which. Lower your `confidence` for anything you're inferring from " +
              "limited visual evidence rather than a clear view — do not skip an item just because you're not fully sure what it is; report it " +
              "with lower confidence instead. If you genuinely cannot make out any distinct garments, return an empty items array. " +
              MULTI_ITEM_SCHEMA,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Detect every distinct garment/accessory in this photo." },
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
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return json({ items, source_image_url: image_url }, 200);
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
