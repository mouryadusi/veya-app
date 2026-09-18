// Supabase Edge Function (Deno runtime).
// "Delete my data" — every table already cascades from auth.users(id) via
// ON DELETE CASCADE (verified against schema.sql), so deleting the auth
// user cleans up profiles, wardrobe_items, outfits, outfit_items, feedback,
// item_affinity automatically. The one thing that does NOT cascade
// automatically is Storage — objects there aren't relational rows, so they
// have to be listed and removed explicitly before the account goes away.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

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

    const userId = userData.user.id;

    // Require the caller to re-type a confirmation phrase, checked here
    // server-side (not just a client-side confirm dialog) — this is a
    // destructive, irreversible action.
    const { confirm } = await req.json().catch(() => ({ confirm: null }));
    if (confirm !== "DELETE") {
      return json({ error: "Confirmation phrase did not match." }, 400);
    }

    // Remove every object under this user's storage folder. Wardrobe photos
    // are stored at `${user_id}/${filename}` (see wardrobe.tsx), so listing
    // that one folder covers everything — verified against the actual
    // upload path used, not assumed.
    const { data: files, error: listErr } = await supabase.storage.from("wardrobe-photos").list(userId);
    if (!listErr && files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeErr } = await supabase.storage.from("wardrobe-photos").remove(paths);
      if (removeErr) {
        // Don't silently proceed to delete the account if we couldn't
        // confirm the photos were removed — better to surface it than to
        // leave orphaned private photos behind with no owner.
        return json({ error: `Couldn't remove stored photos: ${removeErr.message}` }, 500);
      }
    }

    // Deleting the auth user cascades to every table referencing
    // auth.users(id) with ON DELETE CASCADE: profiles, wardrobe_items,
    // outfit_requests, outfits, outfit_items, feedback, item_affinity.
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
    if (deleteErr) return json({ error: deleteErr.message }, 500);

    return json({ deleted: true }, 200);
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
