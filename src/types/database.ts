// Hand-written to match supabase/schema.sql.
// Once your project is live, regenerate the authoritative version with:
//   npx supabase gen types typescript --project-id <your-project-id> --schema public > src/types/database.ts

export type Formality = 1 | 2 | 3 | 4 | 5;
export type FeedbackSignal = "loved" | "okay" | "disliked" | "try_another";
export type OutfitStatus = "shown" | "loved" | "rejected" | "worn";
export type WardrobeCategory =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "shoes"
  | "accessory"
  | "traditional";

export interface Profile {
  id: string;
  display_name: string | null;
  gender_preference: string | null;
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  style_tags: string[];
  preferred_fit: "slim" | "regular" | "relaxed" | "oversized" | null;
  styling_notes: string | null;
  skin_undertone: "warm" | "cool" | "neutral" | null;
  hair_color: string | null;
  eye_color: string | null;
  height_cm: number | null;
  temperature_sensitivity: "runs_hot" | "runs_cold" | "neutral" | null;
  budget_tier: "budget" | "mid" | "premium" | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  image_url: string;
  thumbnail_url: string | null;
  category: WardrobeCategory;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  pattern: string | null;
  material: string | null;
  fit: string | null;
  formality: Formality | null;
  season_suitability: string[];
  style_tags: string[];
  warmth_level: number | null;
  brand: string | null;
  size: string | null;
  product_url: string | null;
  notes: string | null;
  ai_confidence: number | null;
  ai_raw: Record<string, unknown> | null;
  attribute_confidence: {
    brand: "detected" | "highly_likely" | "estimated" | "unknown";
    material: "detected" | "highly_likely" | "estimated" | "unknown";
    primary_color: "detected" | "highly_likely" | "estimated" | "unknown";
    pattern: "detected" | "highly_likely" | "estimated" | "unknown";
  } | null;
  user_verified: boolean;
  is_demo: boolean;
  wear_count: number;
  last_worn_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Occasion {
  id: string;
  user_id: string | null;
  label: string;
  icon: string | null;
  default_formality: Formality | null;
  default_activity_level: "sedentary" | "active" | "high_activity" | null;
  is_preset: boolean;
}

export interface OutfitRequest {
  id: string;
  user_id: string;
  occasion_label: string;
  when_at: string | null;
  activity_note: string | null;
  special_note: string | null;
  location_lat: number | null;
  location_lng: number | null;
  weather_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface Outfit {
  id: string;
  request_id: string;
  user_id: string;
  rank: number;
  compatibility_score: number | null;
  preference_score: number | null;
  final_score: number | null;
  explanation: string | null;
  status: OutfitStatus;
  shown_at: string;
  responded_at: string | null;
}

export interface OutfitItem {
  outfit_id: string;
  wardrobe_item_id: string;
  slot: "top" | "bottom" | "dress" | "shoes" | "outerwear" | "accessory";
}

export interface Feedback {
  id: string;
  user_id: string;
  outfit_id: string;
  signal: FeedbackSignal;
  reason_tags: string[];
  created_at: string;
}

export interface ItemAffinity {
  user_id: string;
  wardrobe_item_id: string;
  affinity: number;
  times_recommended: number;
  times_loved: number;
  times_rejected: number;
  updated_at: string;
}

// Minimal Supabase Database generic so `createClient<Database>` type-checks.
// Replace with the generated version for full query type-safety.
//
// IMPORTANT: every table needs `Relationships` (even as an empty array) —
// @supabase/postgrest-js's internal GenericTable constraint requires
// Row/Insert/Update/Relationships to structurally match, or query builder
// generics silently collapse to `never` on .insert()/.update() and some
// .select() calls instead of raising a clear error at the type definition.
// That was the actual root cause of the "never" errors across sign-up,
// index, profile, wardrobe, edit-profile, onboarding, recommend.ts, and
// insights.ts — not something wrong in each of those individual files.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] };
      wardrobe_items: { Row: WardrobeItem; Insert: Partial<WardrobeItem>; Update: Partial<WardrobeItem>; Relationships: [] };
      occasions: { Row: Occasion; Insert: Partial<Occasion>; Update: Partial<Occasion>; Relationships: [] };
      outfit_requests: { Row: OutfitRequest; Insert: Partial<OutfitRequest>; Update: Partial<OutfitRequest>; Relationships: [] };
      outfits: { Row: Outfit; Insert: Partial<Outfit>; Update: Partial<Outfit>; Relationships: [] };
      outfit_items: { Row: OutfitItem; Insert: Partial<OutfitItem>; Update: Partial<OutfitItem>; Relationships: [] };
      feedback: { Row: Feedback; Insert: Partial<Feedback>; Update: Partial<Feedback>; Relationships: [] };
      item_affinity: { Row: ItemAffinity; Insert: Partial<ItemAffinity>; Update: Partial<ItemAffinity>; Relationships: [] };
    };
    Views: {};
    Functions: {
      mark_outfit_worn: {
        Args: { p_outfit_id: string };
        Returns: void;
      };
      seed_demo_closet_for_current_user: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}
