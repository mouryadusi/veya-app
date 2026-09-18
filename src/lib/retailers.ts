/**
 * Retailer suggestions shown when a user picks "Enter product URL". These
 * are shortcuts to open the retailer's site so the user can find an item
 * and copy its link back — Veya doesn't have a partnership/API integration
 * with any of them, this is just a curated jumping-off list per country.
 */

export type Retailer = { name: string; url: string };

export const RETAILERS_BY_COUNTRY: Record<string, Retailer[]> = {
  IN: [
    { name: "Myntra", url: "https://www.myntra.com" },
    { name: "AJIO", url: "https://www.ajio.com" },
    { name: "Amazon Fashion", url: "https://www.amazon.in/fashion" },
    { name: "Flipkart", url: "https://www.flipkart.com" },
    { name: "Meesho", url: "https://www.meesho.com" },
    { name: "Tata CLiQ", url: "https://www.tatacliq.com" },
    { name: "Nykaa Fashion", url: "https://www.nykaafashion.com" },
    { name: "Shoppers Stop", url: "https://www.shoppersstop.com" },
    { name: "Lifestyle", url: "https://www.lifestylestores.com" },
    { name: "Zara India", url: "https://www.zara.com/in" },
  ],
  ZA: [
    { name: "SHEIN", url: "https://www.shein.co.za" },
    { name: "Superbalist", url: "https://www.superbalist.com" },
    { name: "Truworths", url: "https://www.truworths.co.za" },
    { name: "Mr Price", url: "https://www.mrp.com" },
    { name: "Bash", url: "https://www.bash.com" },
    { name: "Edgars", url: "https://www.edgars.co.za" },
    { name: "Foschini", url: "https://www.foschini.co.za" },
    { name: "Woolworths", url: "https://www.woolworths.co.za" },
    { name: "Takealot", url: "https://www.takealot.com" },
    { name: "Cotton On", url: "https://cottonon.com/ZA" },
  ],
  US: [
    { name: "Amazon Fashion", url: "https://www.amazon.com/fashion" },
    { name: "Walmart", url: "https://www.walmart.com" },
    { name: "SHEIN", url: "https://www.shein.com" },
    { name: "Nordstrom", url: "https://www.nordstrom.com" },
    { name: "Macy's", url: "https://www.macys.com" },
    { name: "Target", url: "https://www.target.com" },
    { name: "Kohl's", url: "https://www.kohls.com" },
    { name: "Old Navy", url: "https://www.oldnavy.gap.com" },
    { name: "Fashion Nova", url: "https://www.fashionnova.com" },
    { name: "ASOS", url: "https://www.asos.com/us" },
  ],
  AU: [
    { name: "THE ICONIC", url: "https://www.theiconic.com.au" },
    { name: "Myer", url: "https://www.myer.com.au" },
    { name: "SHEIN", url: "https://www.shein.com/au" },
    { name: "David Jones", url: "https://www.davidjones.com" },
    { name: "Cotton On", url: "https://cottonon.com/AU" },
    { name: "ASOS", url: "https://www.asos.com/au" },
    { name: "Kmart", url: "https://www.kmart.com.au" },
    { name: "Target", url: "https://www.target.com.au" },
    { name: "Princess Polly", url: "https://www.princesspolly.com.au" },
    { name: "Forever New", url: "https://www.forevernew.com.au" },
  ],
};

export const DEFAULT_COUNTRY = "US";

export function retailersForCountry(countryCode: string | null | undefined): Retailer[] {
  const code = (countryCode ?? DEFAULT_COUNTRY).toUpperCase();
  return RETAILERS_BY_COUNTRY[code] ?? RETAILERS_BY_COUNTRY[DEFAULT_COUNTRY];
}

export const SUPPORTED_COUNTRIES: { code: string; label: string }[] = [
  { code: "IN", label: "India" },
  { code: "ZA", label: "South Africa" },
  { code: "US", label: "United States" },
  { code: "AU", label: "Australia" },
];
