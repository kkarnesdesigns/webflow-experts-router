# AI Content Studio

A small sub-project for rewriting CMS body content (Categories, Skills, Certifications, Locations) on the Experts location pages using Claude.

It is intentionally separate from the Experts page generator, but reuses:

- The shared `lib/webflow-api.js` Webflow client.
- The `/api/route-manifest` endpoint (for auxiliary lookups by route).

## What it does

1. Lets you pick a CMS collection (Categories / Skills / Certifications / Cities / States).
2. Lets you filter / search items and pick a single item or a batch.
3. Sends the item context + an optional **style guide markdown** to Claude and asks it to rewrite the body.
4. Shows the draft in an editor where you can:
   - Edit it by hand
   - Send Claude follow-up feedback ("make it shorter", "more local flavor", etc.)
   - Save the result back to the Webflow CMS (as a draft on the item)
5. Bumps the AI tracking fields (`ai-version`, `last-ai-refresh`, `ai-fingerprint`, `ai-notes`) that you added to the collections.

## Endpoints

All endpoints live under `/api/ai-studio/*`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai-studio/collections` | GET | Returns the configured collection list + their tracked field names. |
| `/api/ai-studio/items?collection=skills&q=&limit=&offset=` | GET | Lists items from a collection with optional search. |
| `/api/ai-studio/style-guide` | GET / POST | Read or upload the markdown style guide that drives generation. |
| `/api/ai-studio/generate` | POST | Generate or revise body content for one item via Claude. |
| `/api/ai-studio/save` | POST | Write the body + AI tracking fields back to the Webflow item (draft). |

## Environment variables

Reuses the existing ones, plus:

```
ANTHROPIC_API_KEY=sk-ant-...
WEBFLOW_API_TOKEN=...
WEBFLOW_CATEGORIES_COLLECTION_ID=...
WEBFLOW_SKILLS_COLLECTION_ID=...
WEBFLOW_CERTIFICATIONS_COLLECTION_ID=...
WEBFLOW_CITIES_COLLECTION_ID=...
WEBFLOW_STATES_COLLECTION_ID=...

# Optional - override the default body / tracking field slugs per collection:
AI_STUDIO_BODY_FIELD=page-body
AI_STUDIO_VERSION_FIELD=ai-version
AI_STUDIO_REFRESH_FIELD=last-ai-refresh
AI_STUDIO_FINGERPRINT_FIELD=ai-fingerprint
AI_STUDIO_NOTES_FIELD=ai-notes
AI_STUDIO_LOCK_FIELD=ai-lock
```

## Frontend

Open `/ai-content-studio/` in the browser. Static files live in `public/` and are served via `vercel.json`.

## Style guide

Drop your markdown style guide into `style-guide.md` (or upload it through the UI - it will be persisted to that file at runtime where the filesystem is writable, and held in memory on Vercel).
