/**
 * Formats a wardrobe item into a proper display name, e.g. "White Oxford
 * Shirt" or "Dark Blue Straight-Fit Jeans" — never just "TOP" or a
 * lowercase fragment. Used everywhere an item's name is shown (outfit
 * reveal, wardrobe grid, history) so naming stays consistent in one place.
 */
export function formatGarmentName(item: {
  primary_color?: string | null;
  subcategory?: string | null;
  category?: string | null;
  fit?: string | null;
}): string {
  const parts = [item.primary_color, item.subcategory ?? item.category].filter(Boolean) as string[];
  if (parts.length === 0) return "Item";
  return parts
    .join(" ")
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}
