# eBay Listing Builder

This is a phone-first static eBay bulk-listing helper. It accepts up to five photos for one item, analyzes the photos, lets the seller review and edit all listing fields, stores a queue locally on the device, and downloads an eBay Seller Hub fixed-price CSV with the exact 35-column order supplied for this project.

## Recommended deployment

Deploy the folder to the existing Netlify site. The included `netlify.toml` publishes the project root and registers `netlify/functions/analyze.mjs` as the secure analysis endpoint.

In Netlify, open Site configuration → Environment variables and add one provider secret. The function uses `GEMINI_API_KEY` first, then `OPENROUTER_API_KEY`, then `GROQ_API_KEY`. The frontend never receives or stores the key. Gemini AI Studio is the best no-cost hosted alternative to try first; OpenRouter’s `openrouter/free` router is another free option with changing model availability. Groq remains available, but the app now uses a compact prompt, two contact-sheet images at most, and a 1,400-token output cap to reduce TPM errors.

No Manus credits are used. Provider free access and rate limits can change, so the app includes both a browser-local open-source fallback and multiple hosted-provider choices. Never treat an AI-generated result as final without checking the photos and eBay rules.

## Local browser fallback

Choose **Browser-local open-source vision** in the Analyze tab. The page dynamically loads the open-source Apache-2.0 `HuggingFaceTB/SmolVLM-256M-Instruct` model through Transformers.js and asks the device to run it locally. This requires a current browser and may be slow or unsupported on some phones. The first model download can be large. Secure mode remains the recommended path for small brand/size/care labels and multi-photo analysis.

## Listing workflow

Upload photos for one item, select an engine, and analyze. Review every field, especially brand, size, condition, price, Made In text, serial wording, and authenticity warnings. Add image URLs if available; otherwise the CSV uses `[SELLER TO ADD IMAGE URLS]`, because this tool does not upload images to eBay. Add the reviewed item to the queue, repeat for other items, then download the CSV. The queue and seller defaults are stored in the browser’s local storage on that device. A JSON backup can also be downloaded.

## Safeguards included

The app enforces the 80-character title limit, condition-note requirements for used condition codes, the supplied category IDs, and the exact special values for bags and shoes. It adds `vintage` to titles when Vintage is set to `Yes (pre-1999)`. For designer/luxury brands, it preserves visible Made In and interior patch/serial wording and warns against unsupported authenticity claims, including a specific Gucci origin conflict warning.

## Files

| File | Purpose |
|---|---|
| `index.html` | Static phone-first UI, local queue, editable form, local model fallback, and CSV export |
| `netlify.toml` | Netlify publish and Functions configuration |
| `netlify/functions/analyze.mjs` | Server-side Groq vision proxy and JSON normalization |
| `README.md` | Setup and usage instructions |
