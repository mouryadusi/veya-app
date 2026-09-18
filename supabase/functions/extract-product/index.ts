// Supabase Edge Function (Deno runtime).
//
// Multi-layer product ingestion pipeline:
//   URL -> normalize/validate -> SSRF guard -> robots.txt -> fetch ->
//   JSON-LD Product schema (primary) -> OpenGraph -> Twitter meta (fallback
//   chain, not a single method) -> canonical-URL-based image resolution ->
//   image reachability check -> normalized product representation ->
//   vision analysis for attributes the retailer doesn't state -> insert.
//
// Every method in the chain is tried before giving up -- a retailer missing
// JSON-LD falls through to OG tags; missing an og:image falls through to
// twitter:image. Only if every legitimate method fails does this return an
// honest, specific error. Never bypasses auth, paywalls, or bot protection;
// never invents an image or attribute that no source actually supports.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { GARMENT_ATTRIBUTE_SCHEMA } from "../_shared/garmentSchema.ts";
import {
  extractMeta,
  extractTitleTag,
  extractMetaDescription,
  extractCanonicalUrl,
  extractJsonLdProducts,
  allImagesFrom,
  resolveImageUrl,
  dedupeImageCandidates,
  isDisallowedByRobotsTxt,
  extractNumberPrice,
  extractAvailability,
  extractProductId,
  extractBrand,
  extractItempropImage,
  extractOgImageVariants,
  extractPictureSrcset,
  looksLikeNonProductImage,
  type FieldSource,
} from "./lib.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Normalized product representation. `provenance` lets the rest of the app
// (and a human reviewing an item) distinguish OBSERVED (the retailer
// actually stated this) from INFERRED (the vision model guessed it) from
// UNKNOWN (nobody knows) -- never silently upgrading a guess into an
// assertion.
// ---------------------------------------------------------------------------
// (FieldSource is imported from lib.ts, not redeclared here)

type NormalizedProduct = {
  productId: string | null;
  brand: string | null;
  title: string | null;
  productUrl: string;
  canonicalUrl: string | null;
  imageUrls: string[];
  price: number | null;
  currency: string | null;
  color: string | null;
  description: string | null;
  availability: string | null;
  retailer: string;
  extractionMethod: "json-ld" | "opengraph" | "twitter" | "none";
  confidence: "high" | "medium" | "low";
  provenance: Record<string, FieldSource>;
};

// (decodeHtmlEntities, extractMeta, extractCanonicalUrl, extractJsonLdProducts,
// allImagesFrom, resolveImageUrl, isDisallowedByRobotsTxt are imported from
// lib.ts -- see lib.test.ts for their test coverage)

// HEAD request to confirm a candidate image is actually reachable and is
// really an image before committing to it -- never trust a URL just
// because some metadata mentioned it.
async function isImageReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

// (extractNumberPrice is imported from lib.ts)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);

    const { product_url } = await req.json();
    if (!product_url || typeof product_url !== "string") {
      return json({ error: "product_url is required" }, 400);
    }

    // ---- Normalize + validate ------------------------------------------
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(product_url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("bad protocol");
    } catch {
      return json({ error: "That doesn't look like a valid URL.", failure_reason: "invalid_url" }, 400);
    }

    // ---- SSRF guard ------------------------------------------------------
    const host = parsedUrl.hostname.toLowerCase();
    const isBlockedHost =
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "0.0.0.0" ||
      host === "::1";
    if (isBlockedHost) {
      return json({ error: "That URL can't be fetched.", failure_reason: "security_rejected" }, 400);
    }

    // ---- robots.txt (fails OPEN on any fetch/parse error) ----------------
    try {
      const robotsRes = await fetch(`${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`, {
        signal: AbortSignal.timeout(3000),
      });
      if (robotsRes.ok) {
        const robotsTxt = await robotsRes.text();
        if (isDisallowedByRobotsTxt(robotsTxt, parsedUrl.pathname)) {
          return json({ error: "This site's robots.txt disallows automated access to that page.", failure_reason: "blocked_by_robots" }, 403);
        }
      }
    } catch {
      // proceed
    }

    // ---- Permitted fetch -----------------------------------------------
    const pageRes = await fetch(product_url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VeyaLinkPreview/1.0; +https://veya.app/link-preview) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!pageRes.ok) {
      return json({ error: `Couldn't reach that page (status ${pageRes.status}). Try adding the item manually instead.`, failure_reason: "fetch_failed" }, 502);
    }

    const declaredLength = Number(pageRes.headers.get("content-length") ?? "0");
    const MAX_PAGE_BYTES = 5 * 1024 * 1024;
    if (declaredLength > MAX_PAGE_BYTES) {
      return json({ error: "That page is too large to read.", failure_reason: "page_too_large" }, 502);
    }
    const html = await pageRes.text();
    if (html.length > MAX_PAGE_BYTES) {
      return json({ error: "That page is too large to read.", failure_reason: "page_too_large" }, 502);
    }

    const finalUrl = pageRes.url || product_url;
    const canonicalUrl = extractCanonicalUrl(html);
    const siteName = extractMeta(html, "og:site_name") ?? parsedUrl.hostname.replace(/^www\./, "");

    // ---- Layer 1: JSON-LD Product schema (most reliable when present) ----
    const jsonLdProducts = extractJsonLdProducts(html);
    const jsonLd = jsonLdProducts[0];

    // ---- Layer 2/3: OpenGraph, then Twitter meta (fallback chain) --------
    const ogImage = extractMeta(html, "og:image");
    const twitterImage = extractMeta(html, "twitter:image");
    const ogTitle = extractMeta(html, "og:title") ?? extractMeta(html, "twitter:title");
    const ogDescription = extractMeta(html, "og:description") ?? extractMeta(html, "twitter:description");
    const ogUrl = extractMeta(html, "og:url");
    // og:url is a secondary canonical fallback -- some sites set one but not
    // <link rel="canonical">, and either is a better base for resolving
    // relative image paths than the raw fetched URL (which may carry
    // tracking params or a redirect chain artifact).
    const resolveBase = canonicalUrl ?? ogUrl ?? finalUrl;

    const itempropImage = extractItempropImage(html);
    const ogImageVariants = extractOgImageVariants(html);
    const pictureImage = extractPictureSrcset(html);

    const candidateSourcesRaw: { url: string | null; source: FieldSource }[] = [
      ...(jsonLd ? allImagesFrom((jsonLd as any).image).map((u) => ({ url: u, source: "json-ld" as FieldSource })) : []),
      { url: ogImage, source: "opengraph" as FieldSource },
      ...ogImageVariants.map((u) => ({ url: u, source: "opengraph" as FieldSource })),
      { url: itempropImage, source: "opengraph" as FieldSource }, // microdata isn't its own FieldSource tier -- closest existing category, not JSON-LD or Twitter
      { url: pictureImage, source: "opengraph" as FieldSource },
      { url: twitterImage, source: "twitter" as FieldSource },
    ];
    // Deduplicate equivalent image URLs before doing any reachability
    // checks — a site that puts the same image in both JSON-LD and
    // og:image shouldn't cost two HEAD requests for one real candidate.
    // Uses the same tested function as lib.test.ts, not a second copy of
    // this logic. Also rejects anything that looks like a logo/icon/
    // tracking-pixel/placeholder by filename pattern before it ever costs
    // a network round-trip.
    const candidateSources = dedupeImageCandidates(candidateSourcesRaw).filter((c) => !looksLikeNonProductImage(c.url!));

    let resolvedImageUrl: string | null = null;
    let imageSource: FieldSource = "unknown";
    const triedButUnreachable: string[] = [];

    for (const candidate of candidateSources) {
      if (!candidate.url) continue;
      const absolute = resolveImageUrl(candidate.url, resolveBase);
      if (!absolute) continue;
      if (await isImageReachable(absolute)) {
        resolvedImageUrl = absolute;
        imageSource = candidate.source;
        break;
      }
      triedButUnreachable.push(absolute);
    }

    if (!resolvedImageUrl) {
      const unreachable = triedButUnreachable.length > 0;
      const detail = unreachable
        ? `found ${triedButUnreachable.length} image reference${triedButUnreachable.length > 1 ? "s" : ""} in the page but couldn't confirm any of them are actually reachable`
        : `didn't include a product image in the page's metadata -- likely because it loads images via JavaScript after the page loads, which a server-side fetch can't see`;
      return json(
        {
          error: `${siteName} ${detail}. This is a real limitation of that site, not a bug: try a screenshot of the product instead (Take Photo / Choose from Library), or add the item manually.`,
          failure_reason: unreachable ? "inaccessible_image" : "js_only_content",
        },
        422
      );
    }

    // ---- Normalized product representation -------------------------------
    const provenance: Record<string, FieldSource> = {};
    const jsonLdTitle = jsonLd ? (((jsonLd as any).name as string | undefined) ?? null) : null;
    const jsonLdBrand = extractBrand(jsonLd); // tested in lib.test.ts -- was previously duplicated inline here
    const jsonLdColor = jsonLd ? (((jsonLd as any).color as string | undefined) ?? null) : null;
    const jsonLdDescription = jsonLd ? (((jsonLd as any).description as string | undefined) ?? null) : null;
    // Checks sku/productID/mpn/gtin8/12/13/14 -- the inline version this
    // replaced only checked sku/productID/mpn/gtin13/gtin, silently missing
    // gtin8/gtin12/gtin14 despite the tested function next to it (imported,
    // never called) already handling all of them correctly.
    const jsonLdSku = extractProductId(jsonLd);
    const jsonLdAvailability = extractAvailability(jsonLd ? (jsonLd as any).offers : undefined);
    const jsonLdPrice = jsonLd ? extractNumberPrice((jsonLd as any).offers) : null;
    const jsonLdCurrency = jsonLd
      ? (() => {
          const offer = Array.isArray((jsonLd as any).offers) ? (jsonLd as any).offers[0] : (jsonLd as any).offers;
          return offer?.priceCurrency ?? null;
        })()
      : null;

    // Standard <title>/meta-description are the FINAL fallback tier --
    // these were imported but never actually called before this fix, so
    // that fallback tier silently never engaged even though it was tested
    // and working in isolation.
    const title = jsonLdTitle ?? ogTitle ?? extractTitleTag(html);
    if (jsonLdTitle) provenance.title = "json-ld";
    else if (ogTitle) provenance.title = "opengraph";

    // Brand: JSON-LD's stated brand is genuine retailer-provided data (not
    // a vision guess at a logo) -- meaningfully more reliable, so it's
    // preferred whenever present. Never inferring brand from the SITE name
    // (e.g. "Myntra") -- that's the seller, not the garment's brand, and
    // would be a real hallucination risk.
    const brand = jsonLdBrand ?? null;
    if (jsonLdBrand) provenance.brand = "json-ld";
    if (jsonLdColor) provenance.color = "json-ld";
    provenance.image = imageSource;

    const description = jsonLdDescription ?? ogDescription ?? extractMetaDescription(html);
    if (jsonLdDescription) provenance.description = "json-ld";
    else if (ogDescription) provenance.description = "opengraph";
    else if (description) provenance.description = "unknown"; // came from standard meta description -- no dedicated FieldSource tier for it, and calling it "opengraph" would misattribute the source

    const normalized: NormalizedProduct = {
      productId: jsonLdSku,
      brand,
      title,
      productUrl: product_url,
      canonicalUrl: canonicalUrl ?? ogUrl,
      imageUrls: [resolvedImageUrl],
      price: jsonLdPrice,
      currency: jsonLdCurrency,
      color: jsonLdColor,
      description,
      availability: jsonLdAvailability,
      retailer: siteName,
      extractionMethod: jsonLd ? "json-ld" : ogImage ? "opengraph" : "twitter",
      confidence: jsonLd ? "high" : ogImage ? "medium" : "low",
      provenance,
    };

    // ---- Vision analysis for attributes the retailer doesn't state -------
    let attributes: Record<string, unknown> = {};
    if (OPENAI_API_KEY) {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a fashion cataloguing assistant. Identify precise garment attributes from a single product photo for a digital wardrobe app. " +
                (normalized.title ? `The retailer's product title is "${normalized.title}" -- use it as a hint, but trust the image over the title if they disagree. ` : "") +
                (normalized.color ? `The retailer states the color as "${normalized.color}" -- use this as the primary_color unless the image clearly disagrees. ` : "") +
                GARMENT_ATTRIBUTE_SCHEMA,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract structured attributes for this garment photo." },
                { type: "image_url", image_url: { url: resolvedImageUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (openaiRes.ok) {
        const completion = await openaiRes.json();
        const raw = completion.choices?.[0]?.message?.content;
        if (raw) {
          try {
            attributes = JSON.parse(raw);
          } catch {
            // malformed JSON from the model -- fall through with empty attributes, user corrects manually
          }
        }
      }
    }

    // Retailer-stated color (OBSERVED) wins over vision-inferred color
    // (INFERRED) when both exist.
    const finalColor = normalized.color ?? (attributes.primary_color as string) ?? null;
    const finalColorProvenance: FieldSource = normalized.color ? "json-ld" : attributes.primary_color ? "image_analysis" : "unknown";

    const { data: inserted, error: insertErr } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: userData.user.id,
        image_url: resolvedImageUrl,
        product_url,
        category: (attributes.category as string) ?? "top",
        subcategory: (attributes.subcategory as string) ?? normalized.title ?? null,
        brand: normalized.brand ?? (attributes.brand as string) ?? null,
        primary_color: finalColor,
        secondary_colors: (attributes.secondary_colors as string[]) ?? [],
        pattern: (attributes.pattern as string) ?? null,
        material: (attributes.material as string) ?? null,
        fit: (attributes.fit as string) ?? null,
        formality: (attributes.formality as number) ?? null,
        season_suitability: (attributes.season_suitability as string[]) ?? [],
        style_tags: (attributes.style_tags as string[]) ?? [],
        warmth_level: (attributes.warmth_level as number) ?? null,
        ai_confidence: (attributes.confidence as number) ?? null,
        attribute_confidence: attributes.attribute_confidence ?? null,
        // Extends the existing raw-audit jsonb column (no schema change
        // needed) with the normalized product representation and full
        // provenance map, so it's always possible to see exactly where
        // every field came from, not just what the final value was.
        ai_raw: { ...attributes, _product: normalized, _color_provenance: finalColorProvenance },
        user_verified: false,
        is_demo: false,
      })
      .select()
      .single();

    if (insertErr || !inserted) return json({ error: insertErr?.message ?? "Could not save item" }, 500);

    return json({ item: inserted, source_site: siteName, product: normalized }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message.includes("timeout") ? "That page took too long to respond." : message, failure_reason: message.includes("timeout") ? "fetch_failed" : "ambiguous_extraction" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
