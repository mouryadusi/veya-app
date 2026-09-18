import { supabase } from "@/lib/supabase/client";

export type OutfitCandidateItems = {
  top?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
  bottom?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
  dress?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
  shoes?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
  outerwear?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
  accessory?: { id: string; subcategory: string | null; primary_color: string | null; image_url?: string };
};

export type OutfitResult = {
  id: string;
  rank: number;
  compatibility_score: number;
  preference_score: number;
  final_score: number;
  explanation: string;
  explanation_detail: string | null;
  explanation_source: "ai" | "fallback";
  quality: "strong" | "limited" | "weak";
  items: OutfitCandidateItems;
};

export type RecommendResponse = {
  request_id: string;
  top_outfit: OutfitResult;
  alternatives: OutfitResult[];
  wardrobe_assessment?: { missing_categories: string[]; has_genuine_alternatives: boolean };
};

export async function callFunction<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const { data, error } = await supabase.functions.invoke(name, {
    body: payload,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    // supabase-js only gives a generic "non-2xx status code" message here —
    // the actual reason (empty_wardrobe, missing secret, real server error)
    // is in the response body, which has to be read separately from
    // error.context. Without this, every real failure looked identical.
    let detail: string | null = null;
    const ctx = (error as any)?.context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json();
        detail = body?.message ?? body?.error ?? null;
      } catch {
        // context wasn't JSON (e.g. a network-level failure) — fall through to the generic message below.
      }
    }
    throw new Error(detail ?? error.message ?? "Request failed");
  }
  if (data?.error) throw new Error(data.message ?? data.error);
  return data as T;
}

export async function requestOutfit(params: {
  occasion_label: string;
  when_at?: string;
  activity_note?: string;
  special_note?: string;
  location_lat?: number;
  location_lng?: number;
  location_label?: string;
}): Promise<RecommendResponse> {
  return callFunction<RecommendResponse>("recommend-outfit", params);
}

/** "Try another" — re-runs the pipeline excluding the pieces just shown, so it never repeats. */
export async function tryAnotherOutfit(params: {
  occasion_label: string;
  when_at?: string;
  activity_note?: string;
  special_note?: string;
  location_lat?: number;
  location_lng?: number;
  location_label?: string;
  excludeItemIds: string[];
}): Promise<RecommendResponse> {
  const { excludeItemIds, ...rest } = params;
  return callFunction<RecommendResponse>("recommend-outfit", {
    ...rest,
    exclude_item_ids: excludeItemIds,
  });
}

export async function analyzeGarment(params: { wardrobe_item_id: string; image_url: string }) {
  return callFunction("analyze-garment", params);
}

/** Detects multiple garments in one photo (e.g. a closet/wardrobe shot). Returns candidates to add individually — nothing is saved yet. */
export type DetectedGarment = {
  category: string;
  subcategory: string;
  primary_color: string;
  pattern: string;
  material: string;
  fit: string;
  formality: number;
  season_suitability: string[];
  style_tags: string[];
  warmth_level: number;
  confidence: number;
  position_hint: string;
};
export async function analyzeWardrobePhoto(image_url: string): Promise<{ items: DetectedGarment[]; source_image_url: string }> {
  return callFunction("analyze-wardrobe-photo", { image_url });
}
export async function getWardrobeInsight(wardrobe_item_id: string): Promise<{ insight: string }> {
  return callFunction<{ insight: string }>("wardrobe-insight", { wardrobe_item_id });
}

/** Permanently deletes the account and all associated data (photos, wardrobe, outfit history). Irreversible. */
export async function deleteAccount(): Promise<{ deleted: true }> {
  return callFunction<{ deleted: true }>("delete-account", { confirm: "DELETE" });
}

export type FollowUpResponse =
  | { action: "explain"; answer: string }
  | { action: "swap_item" | "adjust_formality"; answer: string; updated_outfit: RecommendResponse };

/** "Ask about this outfit" — why/compare/swap/adjust-formality, grounded in the actual stored outfit + alternatives + wardrobe. */
export async function askAboutOutfit(
  outfit_id: string,
  message: string,
  history?: { role: "user" | "assistant"; text: string }[]
): Promise<FollowUpResponse> {
  return callFunction<FollowUpResponse>("outfit-followup", { outfit_id, message, history });
}

export type FeedbackSignal = "loved" | "okay" | "disliked" | "try_another";

export async function sendFeedback(outfitId: string, signal: FeedbackSignal) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { error } = await supabase.from("feedback").insert({
    user_id: userData.user.id,
    outfit_id: outfitId,
    signal,
  });
  if (error) throw error;
}
