export const GARMENT_ATTRIBUTE_SCHEMA = `Return ONLY valid JSON, no markdown fences, matching exactly this shape:
{
  "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory" | "traditional",
  "subcategory": string,            // e.g. "button-down shirt", "chelsea boots"
  "brand": string | null,           // ONLY if a logo/wordmark is clearly legible in the image — otherwise null. Never guess a brand from style alone.
  "primary_color": string,
  "secondary_colors": string[],
  "pattern": "solid" | "striped" | "plaid" | "floral" | "print" | "checked" | "textured" | "other",
  "material": string,
  "fit": "slim" | "regular" | "relaxed" | "oversized",
  "formality": number,              // 1 (very casual) to 5 (black tie)
  "season_suitability": ("spring"|"summer"|"fall"|"winter")[],
  "style_tags": string[],           // from: minimalist, classic, streetwear, traditional, preppy, elegant, sporty, vintage
  "warmth_level": number,           // 1 (very light) to 5 (very warm)
  "confidence": number,             // 0..1, your OVERALL confidence in this extraction
  "attribute_confidence": {
    // Per-attribute honesty rating — this is shown directly to the user, so
    // be genuinely calibrated, not optimistic. Four levels only:
    // "detected"      — directly and unambiguously visible in the image (e.g. a clearly legible brand tag, an obvious solid color)
    // "highly_likely" — strong visual evidence but some inherent ambiguity (e.g. "cotton" from texture/drape, without a visible tag)
    // "estimated"     — a reasonable guess from partial/indirect evidence (e.g. formality inferred from cut and context)
    // "unknown"        — insufficient visual evidence; do not guess, say so
    "brand": "detected" | "highly_likely" | "estimated" | "unknown",
    "material": "detected" | "highly_likely" | "estimated" | "unknown",
    "primary_color": "detected" | "highly_likely" | "estimated" | "unknown",
    "pattern": "detected" | "highly_likely" | "estimated" | "unknown"
  }
}`;

export type ConfidenceLevel = "detected" | "highly_likely" | "estimated" | "unknown";

export type GarmentAttributes = {
  category: string;
  subcategory: string;
  brand: string | null;
  primary_color: string;
  secondary_colors: string[];
  pattern: string;
  material: string;
  fit: string;
  formality: number;
  season_suitability: string[];
  style_tags: string[];
  warmth_level: number;
  confidence: number;
  attribute_confidence?: {
    brand: ConfidenceLevel;
    material: ConfidenceLevel;
    primary_color: ConfidenceLevel;
    pattern: ConfidenceLevel;
  };
};
