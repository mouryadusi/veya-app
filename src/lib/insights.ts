import { supabase } from "@/lib/supabase/client";
import type { WardrobeItem, WardrobeCategory } from "@/types/database";

export type WardrobeGap = { category: WardrobeCategory; count: number };

export type FavoriteCombo = {
  outfitId: string;
  lovedAt: string;
  pieces: { subcategory: string | null; primary_color: string | null }[];
};

export type WardrobeInsights = {
  totalItems: number;
  mostWorn: WardrobeItem[];
  neverWorn: WardrobeItem[];
  underused: WardrobeItem[]; // owned 60+ days, worn 1-2 times
  versatile: (WardrobeItem & { timesRecommended: number })[]; // recommended often across different occasions
  gaps: WardrobeGap[]; // categories with zero or very few pieces
  favoriteCombos: FavoriteCombo[];
};

const EXPECTED_CATEGORIES: WardrobeCategory[] = ["top", "bottom", "outerwear", "shoes"];
const UNDERUSED_MIN_AGE_DAYS = 60;

export async function fetchWardrobeInsights(userId: string): Promise<WardrobeInsights> {
  const [{ data: items }, { data: affinities }, { data: lovedOutfits }] = await Promise.all([
    supabase.from("wardrobe_items").select("*").eq("user_id", userId).eq("is_archived", false),
    supabase.from("item_affinity").select("*").eq("user_id", userId),
    supabase
      .from("outfits")
      .select("id, responded_at, outfit_items(wardrobe_item_id, slot, wardrobe_items(subcategory, primary_color))")
      .eq("user_id", userId)
      .eq("status", "loved")
      .order("responded_at", { ascending: false })
      .limit(5),
  ]);

  const wardrobe = (items ?? []) as WardrobeItem[];
  const now = Date.now();

  const mostWorn = [...wardrobe]
    .filter((i) => i.wear_count > 0)
    .sort((a, b) => b.wear_count - a.wear_count)
    .slice(0, 5);

  const neverWorn = wardrobe.filter((i) => i.wear_count === 0);

  const underused = wardrobe.filter((i) => {
    const ageDays = (now - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays >= UNDERUSED_MIN_AGE_DAYS && i.wear_count > 0 && i.wear_count <= 2;
  });

  const recommendCountByItem = new Map((affinities ?? []).map((a) => [a.wardrobe_item_id, a.times_recommended]));
  const versatile = wardrobe
    .map((i) => ({ ...i, timesRecommended: recommendCountByItem.get(i.id) ?? 0 }))
    .filter((i) => i.timesRecommended >= 3)
    .sort((a, b) => b.timesRecommended - a.timesRecommended)
    .slice(0, 5);

  const countsByCategory = new Map<string, number>();
  for (const i of wardrobe) countsByCategory.set(i.category, (countsByCategory.get(i.category) ?? 0) + 1);
  const gaps: WardrobeGap[] = EXPECTED_CATEGORIES.filter((c) => (countsByCategory.get(c) ?? 0) <= 1).map((c) => ({
    category: c,
    count: countsByCategory.get(c) ?? 0,
  }));

  const favoriteCombos: FavoriteCombo[] = (lovedOutfits ?? []).map((o: any) => ({
    outfitId: o.id,
    lovedAt: o.responded_at,
    pieces: (o.outfit_items ?? []).map((oi: any) => ({
      subcategory: oi.wardrobe_items?.subcategory ?? null,
      primary_color: oi.wardrobe_items?.primary_color ?? null,
    })),
  }));

  return {
    totalItems: wardrobe.length,
    mostWorn,
    neverWorn,
    underused,
    versatile,
    gaps,
    favoriteCombos,
  };
}
