// Pure, dependency-free parsing/normalization logic for product ingestion.
// Deliberately has ZERO Deno-specific globals (no Deno.env, no fetch calls)
// so it can be tested directly with Node's built-in test runner, not just
// parsed for syntax validity like the rest of this Deno function has to be
// in this environment. index.ts imports these rather than defining its own
// copies.

export type FieldSource = "json-ld" | "opengraph" | "twitter" | "image_analysis" | "unknown";

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return null;
}

/** Standard <title> tag — the final fallback tier when no OG/Twitter title exists at all. */
export function extractTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : null;
}

/** Standard <meta name="description"> — the final fallback tier for description. */
export function extractMetaDescription(html: string): string | null {
  return extractMeta(html, "description");
}

export function extractCanonicalUrl(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return m ? decodeHtmlEntities(m[1]) : null;
}

/** Microdata's itemprop="image" -- either a <meta itemprop="image" content="..."> or an <img itemprop="image" src="...">. Distinct enough from OG/JSON-LD to warrant its own extractor rather than shoehorning into extractMeta's property-attribute pattern. */
export function extractItempropImage(html: string): string | null {
  const metaMatch = html.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch) return decodeHtmlEntities(metaMatch[1]);
  const imgMatch = html.match(/<img[^>]+itemprop=["']image["'][^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return decodeHtmlEntities(imgMatch[1]);
  return null;
}

/** og:image:secure_url and og:image:url are valid alternate OG image properties some sites use instead of (or alongside) the plain og:image tag. */
export function extractOgImageVariants(html: string): string[] {
  const results: string[] = [];
  for (const prop of ["og:image:secure_url", "og:image:url"]) {
    const v = extractMeta(html, prop);
    if (v) results.push(v);
  }
  return results;
}

/**
 * Parses a srcset attribute value ("url1 480w, url2 800w, url3 1200w" or
 * with pixel-density descriptors like "1x"/"2x") and returns the URL with
 * the largest width/density descriptor -- the highest-resolution real
 * product photo, not whichever happened to be listed first.
 */
export function pickLargestFromSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] ?? "";
      const widthMatch = descriptor.match(/^(\d+)w$/);
      const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/);
      // Normalize density descriptors onto a comparable scale with width
      // descriptors (arbitrary but consistent: 1x ~ 100, matching a
      // low-resolution width so an explicit width descriptor still wins).
      const score = widthMatch ? parseInt(widthMatch[1], 10) : densityMatch ? parseFloat(densityMatch[1]) * 100 : 0;
      return { url, score };
    })
    .filter((c) => c.url);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

/** Finds the first <picture>...<source srcset="...">...</picture> block and returns its highest-resolution candidate. Distinct from a bare <img srcset> since <picture> commonly holds multiple <source> elements (different formats/breakpoints) before the fallback <img>. */
export function extractPictureSrcset(html: string): string | null {
  const pictureMatch = html.match(/<picture[^>]*>([\s\S]*?)<\/picture>/i);
  if (!pictureMatch) return null;
  const sourceMatch = pictureMatch[1].match(/<source[^>]+srcset=["']([^"']+)["']/i);
  if (!sourceMatch) return null;
  return pickLargestFromSrcset(decodeHtmlEntities(sourceMatch[1]));
}

// Filename/path patterns that reliably indicate a non-product image (site
// logo, UI icon/sprite, tracking pixel, placeholder) rather than a garment
// photo. Intentionally conservative -- false negatives (letting a bad image
// through) are recoverable via the reachability/vision-analysis steps
// downstream; false positives (rejecting a real product photo) are not, so
// this only matches clearly-named non-product assets, not anything vaguely
// suspicious.
const NON_PRODUCT_IMAGE_PATTERNS = [
  /\blogo\b/i,
  /\bicon\b/i,
  /\bsprite\b/i,
  /\bfavicon\b/i,
  /\bpixel\.(gif|png)\b/i,
  /\btracking\b/i,
  /\bplaceholder\b/i,
  /\bspinner\b/i,
  /\bloading\b/i,
  /1x1/,
];

export function looksLikeNonProductImage(url: string): boolean {
  return NON_PRODUCT_IMAGE_PATTERNS.some((pattern) => pattern.test(url));
}

// Extracts every JSON-LD block, parses defensively (a page can have
// multiple <script type="application/ld+json"> blocks, and one malformed
// block shouldn't sink the others), and returns every node that looks like
// a Product -- including ones nested inside a top-level "@graph" array,
// which several major e-commerce platforms use.
export function extractJsonLdProducts(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products: Record<string, unknown>[] = [];

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue; // one malformed block must never sink the others
    }

    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "@graph" in (parsed as any)
        ? (parsed as any)["@graph"]
        : [parsed];

    for (const node of candidates) {
      if (!node || typeof node !== "object") continue;
      const type = (node as any)["@type"];
      const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
      if (isProduct) products.push(node as Record<string, unknown>);
    }
  }
  return products;
}

export function allImagesFrom(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allImagesFrom);
  if (value && typeof value === "object" && "url" in (value as any)) return [(value as any).url];
  return [];
}

// Resolves a possibly-relative image URL (relative, root-relative, or
// protocol-relative) against the best available base. The native URL
// constructor handles all three forms correctly per the WHATWG spec --
// verified empirically, not assumed (see lib.test.ts).
export function resolveImageUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/** Deduplicates a list of candidate image sources by resolved URL, keeping first occurrence (highest-priority source, since callers order candidates most-trustworthy first). */
export function dedupeImageCandidates<T extends { url: string | null }>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (!c.url) return false;
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

// Minimal robots.txt check: only the "User-agent: *" group's Disallow
// rules -- covers the overwhelming majority of real robots.txt files.
export function isDisallowedByRobotsTxt(robotsTxt: string, pathname: string): boolean {
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let inWildcardGroup = false;
  const disallowPrefixes: string[] = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      inWildcardGroup = value === "*";
    } else if (key === "disallow" && inWildcardGroup && value) {
      disallowPrefixes.push(value);
    }
  }
  return disallowPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function extractNumberPrice(offers: unknown): number | null {
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer || typeof offer !== "object") return null;
  const price = (offer as any).price ?? (offer as any).lowPrice;
  const n = typeof price === "string" ? parseFloat(price) : typeof price === "number" ? price : null;
  return n != null && !Number.isNaN(n) ? n : null;
}

/** schema.org availability is a full URL like "https://schema.org/InStock" -- extracts just the meaningful last segment. */
export function extractAvailability(offers: unknown): string | null {
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (!offer || typeof offer !== "object") return null;
  const raw = (offer as any).availability as string | undefined;
  if (!raw) return null;
  return raw.split("/").pop() ?? raw;
}

/** Checks sku, productID, mpn, and every common GTIN variant, in that priority order. Never invents an identifier -- returns null if none of these fields exist. */
export function extractProductId(jsonLd: Record<string, unknown> | undefined): string | null {
  if (!jsonLd) return null;
  const candidates = [
    jsonLd.sku,
    jsonLd.productID,
    jsonLd.mpn,
    jsonLd.gtin13,
    jsonLd.gtin12,
    jsonLd.gtin14,
    jsonLd.gtin8,
    jsonLd.gtin,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }
  return null;
}

export function extractBrand(jsonLd: Record<string, unknown> | undefined): string | null {
  if (!jsonLd) return null;
  const raw = jsonLd.brand;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "name" in (raw as any)) return (raw as any).name ?? null;
  return null;
}
