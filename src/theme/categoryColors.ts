/**
 * Curated, editorial-toned accent color per wardrobe category. Same
 * intentional-color-not-chaos principle as the Home screen's occasion
 * accents — one color cue per category, muted enough to stay premium.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  top: "#4A5578",
  bottom: "#5C4A3C",
  dress: "#B34A5C",
  outerwear: "#5C4A78",
  shoes: "#3C7A8C",
  accessory: "#B8863C",
  traditional: "#8C5A3C",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#6E6A63";
}
