// Real, runnable tests using Node's built-in test runner (node:test) --
// zero dependencies, zero Deno-specific code, actually executed as part of
// this work, not just written and assumed to pass.
//
// Run with: node --test supabase/functions/extract-product/lib.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCanonicalUrl,
  extractMeta,
  extractTitleTag,
  extractMetaDescription,
  extractJsonLdProducts,
  resolveImageUrl,
  dedupeImageCandidates,
  isDisallowedByRobotsTxt,
  extractProductId,
  extractBrand,
  extractAvailability,
  extractNumberPrice,
  extractItempropImage,
  extractOgImageVariants,
  pickLargestFromSrcset,
  extractPictureSrcset,
  looksLikeNonProductImage,
} from "./lib.ts";

test("extracts canonical URL", () => {
  const html = `<link rel="canonical" href="https://shop.example.com/product/123">`;
  assert.equal(extractCanonicalUrl(html), "https://shop.example.com/product/123");
});

test("og:url fallback via extractMeta", () => {
  const html = `<meta property="og:url" content="https://shop.example.com/p/456">`;
  assert.equal(extractMeta(html, "og:url"), "https://shop.example.com/p/456");
});

test("og:description extraction", () => {
  const html = `<meta property="og:description" content="A classic checked shirt.">`;
  assert.equal(extractMeta(html, "og:description"), "A classic checked shirt.");
});

test("standard <title> tag fallback", () => {
  const html = `<html><head><title>Classic Checked Shirt - Shop</title></head></html>`;
  assert.equal(extractTitleTag(html), "Classic Checked Shirt - Shop");
});

test("standard meta description fallback", () => {
  const html = `<meta name="description" content="Fallback description text.">`;
  assert.equal(extractMetaDescription(html), "Fallback description text.");
});

test("JSON-LD: single Product node", () => {
  const html = `<script type="application/ld+json">
    {"@type": "Product", "name": "Checked Shirt", "sku": "ABC123"}
  </script>`;
  const products = extractJsonLdProducts(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Checked Shirt");
});

test("JSON-LD: nested inside @graph array", () => {
  const html = `<script type="application/ld+json">
    {"@graph": [{"@type": "WebPage"}, {"@type": "Product", "name": "From Graph"}]}
  </script>`;
  const products = extractJsonLdProducts(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "From Graph");
});

test("JSON-LD: @type as an array containing Product", () => {
  const html = `<script type="application/ld+json">
    {"@type": ["Product", "Thing"], "name": "Multi-typed"}
  </script>`;
  const products = extractJsonLdProducts(html);
  assert.equal(products.length, 1);
});

test("JSON-LD: malformed block does not crash and does not sink other blocks", () => {
  const html = `
    <script type="application/ld+json">{ this is not valid json </script>
    <script type="application/ld+json">{"@type": "Product", "name": "Still Works"}</script>
  `;
  const products = extractJsonLdProducts(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Still Works");
});

test("JSON-LD: multiple Product blocks, first one wins by convention (caller's choice)", () => {
  const html = `
    <script type="application/ld+json">{"@type": "Product", "name": "First"}</script>
    <script type="application/ld+json">{"@type": "Product", "name": "Second"}</script>
  `;
  const products = extractJsonLdProducts(html);
  assert.equal(products.length, 2);
  assert.equal(products[0].name, "First");
});

test("product ID: prefers sku over productID over mpn over gtin variants", () => {
  assert.equal(extractProductId({ sku: "SKU1", productID: "PID1", mpn: "MPN1" }), "SKU1");
  assert.equal(extractProductId({ productID: "PID1", mpn: "MPN1" }), "PID1");
  assert.equal(extractProductId({ mpn: "MPN1", gtin13: "GTIN13" }), "MPN1");
  assert.equal(extractProductId({ gtin13: "GTIN13" }), "GTIN13");
  assert.equal(extractProductId({ gtin12: "GTIN12" }), "GTIN12");
  assert.equal(extractProductId({ gtin14: "GTIN14" }), "GTIN14");
  assert.equal(extractProductId({ gtin8: "GTIN8" }), "GTIN8");
  assert.equal(extractProductId({ gtin: "PLAINGTIN" }), "PLAINGTIN");
});

test("product ID: never invents one when nothing is present", () => {
  assert.equal(extractProductId({}), null);
  assert.equal(extractProductId(undefined), null);
});

test("brand: string form", () => {
  assert.equal(extractBrand({ brand: "Lee Cooper" }), "Lee Cooper");
});

test("brand: object form with name", () => {
  assert.equal(extractBrand({ brand: { "@type": "Brand", name: "Lee Cooper" } }), "Lee Cooper");
});

test("brand: absent returns null, never invented", () => {
  assert.equal(extractBrand({}), null);
});

test("availability: extracts final segment of schema.org URL", () => {
  assert.equal(extractAvailability({ availability: "https://schema.org/InStock" }), "InStock");
});

test("availability: absent returns null, never invented", () => {
  assert.equal(extractAvailability({}), null);
});

test("price: string and numeric forms both parse", () => {
  assert.equal(extractNumberPrice({ price: "1299.00" }), 1299.0);
  assert.equal(extractNumberPrice({ price: 999 }), 999);
});

test("price: absent returns null, never invented", () => {
  assert.equal(extractNumberPrice({}), null);
});

test("image URL resolution: relative path", () => {
  assert.equal(resolveImageUrl("images/shirt.jpg", "https://shop.example.com/product/"), "https://shop.example.com/product/images/shirt.jpg");
});

test("image URL resolution: root-relative path", () => {
  assert.equal(resolveImageUrl("/images/shirt.jpg", "https://shop.example.com/product/123"), "https://shop.example.com/images/shirt.jpg");
});

test("image URL resolution: protocol-relative path", () => {
  assert.equal(resolveImageUrl("//cdn.example.com/shirt.jpg", "https://shop.example.com/page"), "https://cdn.example.com/shirt.jpg");
});

test("image URL resolution: already absolute", () => {
  assert.equal(resolveImageUrl("https://cdn.other.com/shirt.jpg", "https://shop.example.com/page"), "https://cdn.other.com/shirt.jpg");
});

test("image URL resolution: malformed input returns null instead of throwing", () => {
  assert.equal(resolveImageUrl("not a url at all \x00", "not-a-valid-base"), null);
});

test("image dedup: identical URLs from different sources collapse to one, first wins", () => {
  const candidates = [
    { url: "https://cdn.example.com/shirt.jpg", source: "json-ld" },
    { url: "https://cdn.example.com/shirt.jpg", source: "opengraph" },
    { url: "https://cdn.example.com/other.jpg", source: "opengraph" },
  ];
  const result = dedupeImageCandidates(candidates);
  assert.equal(result.length, 2);
  assert.equal(result[0].source, "json-ld");
});

test("image dedup: null URLs are filtered out entirely", () => {
  const candidates = [{ url: null, source: "opengraph" }, { url: "https://cdn.example.com/a.jpg", source: "twitter" }];
  const result = dedupeImageCandidates(candidates);
  assert.equal(result.length, 1);
});

test("robots.txt: disallowed path under wildcard user-agent", () => {
  const robotsTxt = "User-agent: *\nDisallow: /private/\nDisallow: /admin/";
  assert.equal(isDisallowedByRobotsTxt(robotsTxt, "/private/page"), true);
  assert.equal(isDisallowedByRobotsTxt(robotsTxt, "/public/page"), false);
});

test("robots.txt: rules under a specific (non-wildcard) user-agent do not apply", () => {
  const robotsTxt = "User-agent: Googlebot\nDisallow: /\nUser-agent: *\nDisallow: /only-this/";
  assert.equal(isDisallowedByRobotsTxt(robotsTxt, "/some-other-page"), false);
  assert.equal(isDisallowedByRobotsTxt(robotsTxt, "/only-this/page"), true);
});

test("robots.txt: empty or missing wildcard group disallows nothing", () => {
  assert.equal(isDisallowedByRobotsTxt("", "/anything"), false);
});

test("itemprop=image: meta tag form", () => {
  const html = `<meta itemprop="image" content="https://cdn.example.com/shirt.jpg">`;
  assert.equal(extractItempropImage(html), "https://cdn.example.com/shirt.jpg");
});

test("itemprop=image: img tag form", () => {
  const html = `<img itemprop="image" src="https://cdn.example.com/shirt2.jpg" alt="shirt">`;
  assert.equal(extractItempropImage(html), "https://cdn.example.com/shirt2.jpg");
});

test("itemprop=image: absent returns null", () => {
  assert.equal(extractItempropImage("<div>no microdata here</div>"), null);
});

test("og:image:secure_url and og:image:url variants", () => {
  const html = `
    <meta property="og:image:secure_url" content="https://secure.example.com/shirt.jpg">
    <meta property="og:image:url" content="https://plain.example.com/shirt.jpg">
  `;
  const results = extractOgImageVariants(html);
  assert.equal(results.length, 2);
  assert.ok(results.includes("https://secure.example.com/shirt.jpg"));
  assert.ok(results.includes("https://plain.example.com/shirt.jpg"));
});

test("srcset: picks the widest-descriptor candidate, not the first listed", () => {
  const srcset = "https://cdn.example.com/small.jpg 480w, https://cdn.example.com/large.jpg 1200w, https://cdn.example.com/medium.jpg 800w";
  assert.equal(pickLargestFromSrcset(srcset), "https://cdn.example.com/large.jpg");
});

test("srcset: pixel-density descriptors also compare correctly", () => {
  const srcset = "https://cdn.example.com/1x.jpg 1x, https://cdn.example.com/3x.jpg 3x, https://cdn.example.com/2x.jpg 2x";
  assert.equal(pickLargestFromSrcset(srcset), "https://cdn.example.com/3x.jpg");
});

test("srcset: malformed/empty input returns null instead of throwing", () => {
  assert.equal(pickLargestFromSrcset(""), null);
  assert.equal(pickLargestFromSrcset("   ,  , "), null);
});

test("<picture> block: extracts the largest candidate from the first <source srcset>", () => {
  const html = `<picture>
    <source srcset="https://cdn.example.com/small.jpg 480w, https://cdn.example.com/big.jpg 1600w" type="image/webp">
    <img src="https://cdn.example.com/fallback.jpg">
  </picture>`;
  assert.equal(extractPictureSrcset(html), "https://cdn.example.com/big.jpg");
});

test("<picture> block: absent returns null", () => {
  assert.equal(extractPictureSrcset("<div>no picture element</div>"), null);
});

test("non-product image detection: rejects logos, icons, tracking pixels, placeholders", () => {
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/site-logo.png"), true);
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/nav-icon-menu.svg"), true);
  assert.equal(looksLikeNonProductImage("https://analytics.example.com/tracking-pixel.gif"), true);
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/placeholder-loading.png"), true);
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/sprite-sheet.png"), true);
});

test("non-product image detection: does not flag real product photo filenames", () => {
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/lee-cooper-checked-shirt-front.jpg"), false);
  assert.equal(looksLikeNonProductImage("https://cdn.example.com/product/41563946/main.jpg"), false);
});
