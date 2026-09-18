# Connecting your own ML model

The recommendation pipeline (`supabase/functions/recommend-outfit/index.ts`) works
end-to-end without any custom model — it uses deterministic compatibility/preference
scoring plus an LLM for the final explanation. If you have your own model (a learned
ranker, a style-compatibility embedding model, whatever), you can slot it in at the
one point that matters: **re-ranking the already-valid candidate shortlist.**

Everything upstream of that (context gathering, wardrobe retrieval, constraint
filtering, candidate generation) stays as-is — your model never has to reimplement
"what counts as a valid outfit," only "which valid outfit is best."

## How to connect it

1. Deploy your model behind any HTTPS endpoint that accepts the request below.
2. Set one secret:
   ```bash
   npx supabase secrets set CUSTOM_MODEL_ENDPOINT=https://your-model-host/rank
   ```
3. Redeploy the function: `npx supabase functions deploy recommend-outfit`

That's it. If the endpoint is unset, unreachable, slow (>4s), or returns something
that doesn't match the contract, the pipeline silently falls back to its built-in
deterministic ranking — your model is additive, never a single point of failure for
the core product.

## Request your endpoint receives

```json
{
  "user_id": "uuid",
  "context": {
    "occasion": "Work",
    "activity_note": "client meeting in the afternoon",
    "special_note": "outdoor venue, might rain",
    "weather": { "tempC": 14.2, "condition": "rainy", "needsLayer": true, "warmthTarget": 4 },
    "profile": { "style_tags": ["minimalist"], "preferred_fit": "regular", "...": "..." }
  },
  "candidates": [
    {
      "index": 0,
      "compatibility_score": 82,
      "preference_score": 61,
      "items": {
        "top": "wardrobe_item_uuid_or_null",
        "bottom": "wardrobe_item_uuid_or_null",
        "dress": null,
        "shoes": "wardrobe_item_uuid_or_null",
        "outerwear": "wardrobe_item_uuid_or_null",
        "accessory": "wardrobe_item_uuid_or_null"
      }
    }
  ]
}
```

`candidates` is capped at 5 — already filtered to valid, de-duplicated outfit
combinations built from the user's real wardrobe. Your model is ranking these 5, not
generating new ones from scratch.

## Response your endpoint must return

```json
{
  "ranking": [2, 0, 1, 4, 3],
  "explanation": "Optional — one sentence explaining the top pick. Omit to let the built-in LLM explanation stand."
}
```

`ranking` is a list of `candidates[].index` values, best pick first. Any malformed or
missing `ranking` is ignored and the deterministic order is kept.

## What's intentionally NOT customizable here

- **Candidate generation and constraints** — formality/season/weather filtering
  happens before your model ever sees anything, so it can't accidentally recommend
  something not in the user's wardrobe or wildly wrong for the weather.
- **Persistence and feedback learning** — `outfits`, `outfit_items`, and the
  `item_affinity` trigger are unaffected by which ranker produced the order.

If your model needs deeper access than this (e.g., raw wardrobe embeddings, full
image bytes), that's a real architecture conversation — this contract covers "better
ranking of valid candidates," not "replace the whole pipeline."
