/**
 * Complete demo closet: 47 illustrated starter garments covering casual,
 * formal, party, traditional, and all seasonal combinations. Pre-filled
 * attributes allow testing the recommendation pipeline immediately.
 */
import type { WardrobeCategory } from "@/types/database";

export type DemoClosetItem = {
  id: string;
  category: WardrobeCategory;
  subcategory: string;
  primary_color: string;
  pattern: string;
  material: string;
  fit: string;
  formality: number;
  season_suitability: string[];
  style_tags: string[];
  warmth_level: number;
};

export const DEMO_CLOSET_ITEMS: DemoClosetItem[] = [
  { id: "white_oxford", category: "top", subcategory: "Oxford shirt", primary_color: "white", pattern: "solid", material: "cotton", fit: "regular", formality: 2, season_suitability: ["spring", "summer", "fall"], style_tags: ["classic", "preppy"], warmth_level: 2 },
  { id: "navy_tee", category: "top", subcategory: "T-shirt", primary_color: "navy", pattern: "solid", material: "cotton", fit: "regular", formality: 1, season_suitability: ["spring", "summer"], style_tags: ["minimalist", "casual"], warmth_level: 1 },
  { id: "cream_tank", category: "top", subcategory: "Tank top", primary_color: "cream", pattern: "solid", material: "cotton", fit: "regular", formality: 1, season_suitability: ["spring", "summer"], style_tags: ["minimalist", "casual"], warmth_level: 1 },
  { id: "blush_blouse", category: "top", subcategory: "Blouse", primary_color: "blush", pattern: "solid", material: "silk blend", fit: "relaxed", formality: 2, season_suitability: ["spring", "summer", "fall"], style_tags: ["romantic", "feminine"], warmth_level: 2 },
  { id: "silk_blouse", category: "top", subcategory: "Silk blouse", primary_color: "plum", pattern: "solid", material: "silk", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "luxury"], warmth_level: 2 },
  { id: "charcoal_trousers", category: "bottom", subcategory: "Tailored trousers", primary_color: "charcoal", pattern: "solid", material: "wool blend", fit: "regular", formality: 4, season_suitability: ["fall", "winter"], style_tags: ["classic", "professional"], warmth_level: 3 },
  { id: "indigo_jeans", category: "bottom", subcategory: "Jeans", primary_color: "indigo", pattern: "solid", material: "denim", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["classic", "streetwear"], warmth_level: 2 },
  { id: "khaki_chinos", category: "bottom", subcategory: "Chinos", primary_color: "khaki", pattern: "solid", material: "cotton", fit: "regular", formality: 2, season_suitability: ["spring", "summer", "fall"], style_tags: ["casual", "preppy"], warmth_level: 2 },
  { id: "navy_chinos", category: "bottom", subcategory: "Chinos", primary_color: "navy", pattern: "solid", material: "cotton", fit: "regular", formality: 2, season_suitability: ["spring", "summer", "fall"], style_tags: ["casual", "classic"], warmth_level: 2 },
  { id: "linen_skirt", category: "bottom", subcategory: "Linen skirt", primary_color: "cream", pattern: "solid", material: "linen", fit: "regular", formality: 1, season_suitability: ["spring", "summer"], style_tags: ["casual", "relaxed"], warmth_level: 1 },
  { id: "denim_skirt", category: "bottom", subcategory: "Denim skirt", primary_color: "indigo", pattern: "solid", material: "denim", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall"], style_tags: ["casual", "vintage"], warmth_level: 1 },
  { id: "casual_dress_blue", category: "dress", subcategory: "Casual dress", primary_color: "blue", pattern: "solid", material: "cotton", fit: "relaxed", formality: 2, season_suitability: ["spring", "summer"], style_tags: ["casual", "feminine"], warmth_level: 1 },
  { id: "casual_dress_rust", category: "dress", subcategory: "Casual dress", primary_color: "rust", pattern: "solid", material: "linen blend", fit: "relaxed", formality: 2, season_suitability: ["spring", "summer", "fall"], style_tags: ["casual", "earthy"], warmth_level: 1 },
  { id: "formal_black", category: "dress", subcategory: "Evening dress", primary_color: "black", pattern: "solid", material: "crepe", fit: "slim", formality: 5, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "formal"], warmth_level: 2 },
  { id: "formal_burgundy", category: "dress", subcategory: "Evening dress", primary_color: "burgundy", pattern: "solid", material: "satin", fit: "slim", formality: 5, season_suitability: ["fall", "winter"], style_tags: ["elegant", "formal"], warmth_level: 2 },
  { id: "maxi_champagne", category: "dress", subcategory: "Maxi dress", primary_color: "champagne", pattern: "solid", material: "silk", fit: "relaxed", formality: 4, season_suitability: ["spring", "summer", "fall"], style_tags: ["elegant", "romantic"], warmth_level: 1 },
  { id: "maxi_emerald", category: "dress", subcategory: "Maxi dress", primary_color: "emerald", pattern: "solid", material: "silk", fit: "regular", formality: 4, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "sophisticated"], warmth_level: 2 },
  { id: "kurti_maroon", category: "traditional", subcategory: "Embroidered kurti", primary_color: "maroon", pattern: "embroidered", material: "silk blend", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall"], style_tags: ["traditional", "ethnic"], warmth_level: 2 },
  { id: "kurti_teal", category: "traditional", subcategory: "Embroidered kurti", primary_color: "teal", pattern: "embroidered", material: "cotton", fit: "relaxed", formality: 2, season_suitability: ["spring", "summer"], style_tags: ["traditional", "casual"], warmth_level: 1 },
  { id: "puffer_black", category: "outerwear", subcategory: "Puffer jacket", primary_color: "black", pattern: "solid", material: "nylon", fit: "regular", formality: 1, season_suitability: ["fall", "winter"], style_tags: ["casual", "practical"], warmth_level: 5 },
  { id: "puffer_camel", category: "outerwear", subcategory: "Puffer jacket", primary_color: "camel", pattern: "solid", material: "nylon", fit: "regular", formality: 1, season_suitability: ["fall", "winter"], style_tags: ["casual", "warm"], warmth_level: 5 },
  { id: "wool_camel", category: "outerwear", subcategory: "Wool coat", primary_color: "camel", pattern: "solid", material: "wool", fit: "regular", formality: 3, season_suitability: ["fall", "winter"], style_tags: ["classic", "elegant"], warmth_level: 4 },
  { id: "wool_grey", category: "outerwear", subcategory: "Wool coat", primary_color: "grey", pattern: "solid", material: "wool", fit: "regular", formality: 3, season_suitability: ["fall", "winter"], style_tags: ["classic", "professional"], warmth_level: 4 },
  { id: "blazer_black", category: "outerwear", subcategory: "Tailored blazer", primary_color: "black", pattern: "solid", material: "wool blend", fit: "slim", formality: 4, season_suitability: ["spring", "fall", "winter"], style_tags: ["professional", "formal"], warmth_level: 2 },
  { id: "blazer_navy", category: "outerwear", subcategory: "Tailored blazer", primary_color: "navy", pattern: "solid", material: "wool blend", fit: "regular", formality: 3, season_suitability: ["spring", "fall", "winter"], style_tags: ["professional", "classic"], warmth_level: 2 },
  { id: "leather_black", category: "outerwear", subcategory: "Leather jacket", primary_color: "black", pattern: "solid", material: "leather", fit: "slim", formality: 2, season_suitability: ["spring", "fall", "winter"], style_tags: ["edgy", "classic"], warmth_level: 2 },
  { id: "leather_brown", category: "outerwear", subcategory: "Leather jacket", primary_color: "cognac", pattern: "solid", material: "leather", fit: "regular", formality: 2, season_suitability: ["spring", "fall", "winter"], style_tags: ["vintage", "classic"], warmth_level: 2 },
  { id: "sneakers_white", category: "shoes", subcategory: "Leather sneakers", primary_color: "white", pattern: "solid", material: "leather", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["minimalist", "casual"], warmth_level: 1 },
  { id: "sneakers_black", category: "shoes", subcategory: "Leather sneakers", primary_color: "black", pattern: "solid", material: "leather", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["minimalist", "casual"], warmth_level: 1 },
  { id: "loafers_black", category: "shoes", subcategory: "Leather loafers", primary_color: "black", pattern: "solid", material: "leather", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["classic", "preppy"], warmth_level: 1 },
  { id: "loafers_brown", category: "shoes", subcategory: "Leather loafers", primary_color: "brown", pattern: "solid", material: "leather", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["classic", "warm"], warmth_level: 1 },
  { id: "heels_nude", category: "shoes", subcategory: "Heels", primary_color: "nude", pattern: "solid", material: "leather", fit: "regular", formality: 4, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["feminine", "elegant"], warmth_level: 1 },
  { id: "heels_black", category: "shoes", subcategory: "Heels", primary_color: "black", pattern: "solid", material: "leather", fit: "slim", formality: 4, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["formal", "classic"], warmth_level: 1 },
  { id: "sandals_tan", category: "shoes", subcategory: "Leather sandals", primary_color: "tan", pattern: "solid", material: "leather", fit: "regular", formality: 1, season_suitability: ["spring", "summer"], style_tags: ["casual", "relaxed"], warmth_level: 1 },
  { id: "sandals_gold", category: "shoes", subcategory: "Metallic sandals", primary_color: "gold", pattern: "solid", material: "leather", fit: "regular", formality: 2, season_suitability: ["spring", "summer"], style_tags: ["evening", "elegant"], warmth_level: 1 },
  { id: "boots_black", category: "shoes", subcategory: "Leather boots", primary_color: "black", pattern: "solid", material: "leather", fit: "slim", formality: 3, season_suitability: ["fall", "winter"], style_tags: ["classic", "edgy"], warmth_level: 2 },
  { id: "boots_cognac", category: "shoes", subcategory: "Leather boots", primary_color: "cognac", pattern: "solid", material: "leather", fit: "regular", formality: 2, season_suitability: ["fall", "winter"], style_tags: ["warm", "classic"], warmth_level: 2 },
  { id: "clutch_gold", category: "accessory", subcategory: "Clutch", primary_color: "gold", pattern: "solid", material: "metallic", fit: "regular", formality: 4, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "evening"], warmth_level: 1 },
  { id: "clutch_black", category: "accessory", subcategory: "Clutch", primary_color: "black", pattern: "solid", material: "leather", fit: "regular", formality: 4, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["formal", "elegant"], warmth_level: 1 },
  { id: "tote_cream", category: "accessory", subcategory: "Canvas tote", primary_color: "cream", pattern: "solid", material: "canvas", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["minimalist", "practical"], warmth_level: 1 },
  { id: "tote_navy", category: "accessory", subcategory: "Canvas tote", primary_color: "navy", pattern: "solid", material: "canvas", fit: "regular", formality: 1, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["casual", "practical"], warmth_level: 1 },
  { id: "scarf_silk", category: "accessory", subcategory: "Silk scarf", primary_color: "rose", pattern: "solid", material: "silk", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "romantic"], warmth_level: 1 },
  { id: "scarf_wool", category: "accessory", subcategory: "Wool scarf", primary_color: "camel", pattern: "solid", material: "wool", fit: "regular", formality: 2, season_suitability: ["fall", "winter"], style_tags: ["warm", "classic"], warmth_level: 2 },
  { id: "watch_gold", category: "accessory", subcategory: "Watch", primary_color: "gold", pattern: "solid", material: "metal", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["elegant", "professional"], warmth_level: 1 },
  { id: "watch_silver", category: "accessory", subcategory: "Watch", primary_color: "silver", pattern: "solid", material: "metal", fit: "regular", formality: 3, season_suitability: ["spring", "summer", "fall", "winter"], style_tags: ["classic", "professional"], warmth_level: 1 },
  { id: "sunglasses_black", category: "accessory", subcategory: "Sunglasses", primary_color: "black", pattern: "solid", material: "plastic", fit: "regular", formality: 2, season_suitability: ["spring", "summer"], style_tags: ["casual", "cool"], warmth_level: 1 },
  { id: "sunglasses_brown", category: "accessory", subcategory: "Sunglasses", primary_color: "brown", pattern: "solid", material: "acetate", fit: "regular", formality: 2, season_suitability: ["spring", "summer"], style_tags: ["warm", "classic"], warmth_level: 1 },
];

export const DEMO_CLOSET_ASSETS: Record<string, any> = {
  white_oxford: require("../../assets/demo-closet/white_oxford.png"),
  navy_tee: require("../../assets/demo-closet/navy_tee.png"),
  cream_tank: require("../../assets/demo-closet/cream_tank.png"),
  blush_blouse: require("../../assets/demo-closet/blush_blouse.png"),
  silk_blouse: require("../../assets/demo-closet/silk_blouse.png"),
  charcoal_trousers: require("../../assets/demo-closet/charcoal_trousers.png"),
  indigo_jeans: require("../../assets/demo-closet/indigo_jeans.png"),
  khaki_chinos: require("../../assets/demo-closet/khaki_chinos.png"),
  navy_chinos: require("../../assets/demo-closet/navy_chinos.png"),
  linen_skirt: require("../../assets/demo-closet/linen_skirt.png"),
  denim_skirt: require("../../assets/demo-closet/denim_skirt.png"),
  casual_dress_blue: require("../../assets/demo-closet/casual_dress_blue.png"),
  casual_dress_rust: require("../../assets/demo-closet/casual_dress_rust.png"),
  formal_black: require("../../assets/demo-closet/formal_black.png"),
  formal_burgundy: require("../../assets/demo-closet/formal_burgundy.png"),
  maxi_champagne: require("../../assets/demo-closet/maxi_champagne.png"),
  maxi_emerald: require("../../assets/demo-closet/maxi_emerald.png"),
  kurti_maroon: require("../../assets/demo-closet/kurti_maroon.png"),
  kurti_teal: require("../../assets/demo-closet/kurti_teal.png"),
  puffer_black: require("../../assets/demo-closet/puffer_black.png"),
  puffer_camel: require("../../assets/demo-closet/puffer_camel.png"),
  wool_camel: require("../../assets/demo-closet/wool_camel.png"),
  wool_grey: require("../../assets/demo-closet/wool_grey.png"),
  blazer_black: require("../../assets/demo-closet/blazer_black.png"),
  blazer_navy: require("../../assets/demo-closet/blazer_navy.png"),
  leather_black: require("../../assets/demo-closet/leather_black.png"),
  leather_brown: require("../../assets/demo-closet/leather_brown.png"),
  sneakers_white: require("../../assets/demo-closet/sneakers_white.png"),
  sneakers_black: require("../../assets/demo-closet/sneakers_black.png"),
  loafers_black: require("../../assets/demo-closet/loafers_black.png"),
  loafers_brown: require("../../assets/demo-closet/loafers_brown.png"),
  heels_nude: require("../../assets/demo-closet/heels_nude.png"),
  heels_black: require("../../assets/demo-closet/heels_black.png"),
  sandals_tan: require("../../assets/demo-closet/sandals_tan.png"),
  sandals_gold: require("../../assets/demo-closet/sandals_gold.png"),
  boots_black: require("../../assets/demo-closet/boots_black.png"),
  boots_cognac: require("../../assets/demo-closet/boots_cognac.png"),
  clutch_gold: require("../../assets/demo-closet/clutch_gold.png"),
  clutch_black: require("../../assets/demo-closet/clutch_black.png"),
  tote_cream: require("../../assets/demo-closet/tote_cream.png"),
  tote_navy: require("../../assets/demo-closet/tote_navy.png"),
  scarf_silk: require("../../assets/demo-closet/scarf_silk.png"),
  scarf_wool: require("../../assets/demo-closet/scarf_wool.png"),
  watch_gold: require("../../assets/demo-closet/watch_gold.png"),
  watch_silver: require("../../assets/demo-closet/watch_silver.png"),
  sunglasses_black: require("../../assets/demo-closet/sunglasses_black.png"),
  sunglasses_brown: require("../../assets/demo-closet/sunglasses_brown.png"),
};

const DEMO_URI_PREFIX = "demo://";

export function resolveWardrobeImage(imageUrl: string): any {
  if (imageUrl.startsWith(DEMO_URI_PREFIX)) {
    const id = imageUrl.slice(DEMO_URI_PREFIX.length);
    return DEMO_CLOSET_ASSETS[id] ?? DEMO_CLOSET_ASSETS.white_oxford;
  }
  return { uri: imageUrl };
}

export function isDemoImageUrl(imageUrl: string): boolean {
  return imageUrl.startsWith(DEMO_URI_PREFIX);
}
