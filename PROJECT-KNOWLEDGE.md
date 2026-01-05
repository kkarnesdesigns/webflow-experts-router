# Project Knowledge: Webflow Experts Router

This document captures technical knowledge gained while building and maintaining this project.

## Project Overview

A dynamic routing system for Webflow experts directory pages. Generates SEO-friendly URLs like `/hire/{state}/{category}/{skill}` and integrates with Wized for client-side data binding.

## Architecture

### Components

1. **Vercel Serverless Functions** (`/api/`)
   - `generate-routes.js` - Generates route manifest from Webflow CMS data
   - `route-manifest.js` - Serves the cached route manifest
   - `get-experts.js` - Filters and returns experts based on query params
   - `dropdown-menu.js` - Generates dropdown menu data from manifest

2. **Client-Side Scripts** (`/client/`)
   - `wized-experts-router.js` - Parses URLs and sets Wized variables
   - `find-experts-dropdown.html` - Interactive filter dropdown menu
   - `find-experts-dropdown.css` - Dropdown styling

3. **Libraries** (`/lib/`)
   - `webflow-api.js` - Webflow CMS API wrapper
   - `route-generator.js` - Route generation logic

### Data Flow

```
User visits /hire/california/web-design/wordpress
    ↓
wized-experts-router.js parses URL
    ↓
Fetches route-manifest to validate & enrich params
    ↓
Sets Wized variables (v.stateId, v.skillId, etc.)
    ↓
Triggers Wized get_experts request
    ↓
Wized calls /api/get-experts with filter params
    ↓
API returns filtered experts
    ↓
Wized renders experts in DOM
```

## Webflow CMS Collections

### Collection IDs (from .env)
- `WEBFLOW_EXPERTS_COLLECTION_ID` - Experts profiles
- `WEBFLOW_SKILLS_COLLECTION_ID` - Skills (e.g., WordPress, Shopify)
- `WEBFLOW_CATEGORIES_COLLECTION_ID` - Categories (e.g., Web Design, Marketing)
- `WEBFLOW_STATES_COLLECTION_ID` - US States
- `WEBFLOW_CITIES_COLLECTION_ID` - Cities
- `WEBFLOW_CERTIFICATIONS_COLLECTION_ID` - Certifications (ID: `650b358b2ae0fe324b126a7f`)

### Key Field Relationships

**Experts Collection:**
- `state` - Reference to States collection
- `city` - Reference to Cities collection
- `skills-2` - Multi-reference to Skills collection (note: field name has `-2` suffix)
- `certifications` - Multi-reference to Certifications collection
- `isArchived` - Boolean to exclude from results

**Skills Collection:**
- `expert-category` - Multi-reference to Categories collection
- `name` - Display name
- `slug` - URL slug

**Certifications Collection:**
- `category` - Multi-reference to Categories collection (same structure as skills)
- `name` - Display name
- `slug` - URL slug

**Cities Collection:**
- `state` - Reference to States collection (for lookups)
- `name` - City name
- `slug` - URL slug

## Route Types & URL Patterns

### Generated Routes (from route-generator.js)

| Route Type | Pattern | Example |
|------------|---------|---------|
| State + Category | `/hire/{state}/{category}` | `/hire/california/web-design` |
| State + City | `/hire/{state}/{city}` | `/hire/california/los-angeles` |
| State + Category + Skill | `/hire/{state}/{category}/{skill}` | `/hire/california/web-design/wordpress` |
| State + Category + Certification | `/hire/{state}/{category}/{certification}` | `/hire/california/web-design/webflow-expert` |
| State + City + Category | `/hire/{state}/{city}/{category}` | `/hire/california/los-angeles/web-design` |
| City + Category + Skill | `/hire/{state}/{city}/{category}/{skill}` | `/hire/california/los-angeles/web-design/wordpress` |
| City + Category + Certification | `/hire/{state}/{city}/{category}/{certification}` | `/hire/california/los-angeles/web-design/webflow-expert` |

### Route Manifest Structure

```javascript
{
  generated: "2024-01-15T...",
  totalRoutes: 2736,
  routes: {
    "/hire/california/web-design/wordpress": {
      type: "state",  // or "city"
      state: "california",
      stateName: "California",
      stateId: "abc123",
      category: "web-design",
      categoryName: "Web Design",
      categoryId: "def456",
      skill: "wordpress",        // OR certification field
      skillName: "WordPress",
      skillId: "ghi789",
      expertCount: 42
    }
  }
}
```

## Wized Integration

### Variables Set by Router (v.* namespace)

```javascript
window.Wized.data.v.routeParams    // Full params object
window.Wized.data.v.stateName      // "California"
window.Wized.data.v.stateId        // Webflow item ID
window.Wized.data.v.cityName       // "Los Angeles"
window.Wized.data.v.cityId         // Webflow item ID
window.Wized.data.v.categoryName   // "Web Design"
window.Wized.data.v.categoryId     // Webflow item ID
window.Wized.data.v.skillName      // "WordPress"
window.Wized.data.v.skillId        // Webflow item ID
window.Wized.data.v.certificationName  // "Webflow Expert"
window.Wized.data.v.certificationId    // Webflow item ID
```

### Wized Request: get_experts

The Wized request `get_experts` should be configured to:
- Call `/api/get-experts` endpoint
- Pass filter params: `stateId`, `cityId`, `categoryId`, `skillId`, `certificationId`
- May be configured to run on page load automatically

### Known Timing Issue

**Problem:** Experts sometimes don't load on first page visit without refresh.

**Symptoms:**
- `Wized.requests.execute('get_experts')` returns `undefined`
- Console shows params stored correctly
- Works on page refresh

**Current Approach (may need refinement):**
1. Use `Wized.on('ready')` event when available
2. Store params first, then execute request after 100ms delay
3. Retry up to 3 times if result is undefined
4. Increasing delays between retries (300ms, 600ms, 900ms)

**Potential Issue:**
If `get_experts` is configured to run on page load in Wized, our manual `.execute()` call might be redundant or conflicting. May need to:
- Only set variables and let Wized's auto-trigger handle the request
- Or disable Wized's auto-trigger and rely solely on our manual execute

## API Endpoints

### GET /api/get-experts

Filters experts based on query parameters.

**Query Params:**
- `stateId` - Filter by state
- `cityId` - Filter by city
- `categoryId` - Filter by category (checks skills AND certifications)
- `skillId` - Filter by specific skill
- `certificationId` - Filter by specific certification
- `limit` - Max results (default: 100)
- `offset` - Pagination offset (default: 0)

**Response:**
```javascript
{
  items: [...],           // Expert objects with enriched data
  count: 25,              // Items in this response
  total: 150,             // Total matching experts
  filters: {...},         // Applied filters
  pagination: {...}       // Pagination info
}
```

**Features:**
- Seeded daily shuffle (same order for 24 hours, fair rotation)
- Enriches experts with `cityName`, `stateName`, `skillNames[]`, `certificationNames[]`
- Filters out archived experts
- 5-minute cache on experts data

### GET /api/route-manifest

Returns the full route manifest for client-side validation.

### GET /api/dropdown-menu

Returns structured data for the dropdown menu:
```javascript
{
  states: [...],
  cities: [...],           // Top 30 by expert count
  categories: [...],
  popularSkills: [...],    // Top 10
  popularCertifications: [...] // Top 10
}
```

## Dropdown Menu (find-experts-dropdown.html)

### Three-Step Flow

1. **Step 1: Select Category**
   - Shows all categories as clickable cards

2. **Step 2: Narrow Your Search** (Four-panel layout)
   - Panel 1: Skills in selected category
   - Panel 2: Certifications in selected category
   - Panel 3: States (direct links to `/hire/{state}/{category}`)
   - Panel 4: Top Cities (direct links)

   Clicking a skill/certification goes to Step 3.

3. **Step 3: Select Location**
   - Shows states and cities that have experts with the selected skill/certification
   - Links go to final pages like `/hire/{state}/{category}/{skill}`

### CSS Layout

```css
/* Four-column grid for Step 2 */
.mega-dropdown-four-panel {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 16px;
}

/* Scrollable panels */
.mega-dropdown-panel .mega-dropdown-list--scroll {
  max-height: 300px;
  overflow-y: auto;
}

/* Responsive: 2x2 on tablet, 1 column on mobile */
@media (max-width: 991px) {
  .mega-dropdown-four-panel {
    grid-template-columns: 1fr 1fr;
  }
}
```

## Route Generation Details

### Expert Count Threshold

Routes are only generated if `expertCount >= 1` (at least one expert matches).

### Slug Generation

Uses `slugify()` helper to convert names to URL-safe slugs:
- Lowercase
- Replace spaces with hyphens
- Remove special characters

### State Name Lookups

Cities have a `state` reference field. The generator looks up state names from the States collection to properly associate cities with states.

## Environment Variables

```
WEBFLOW_API_TOKEN=xxx
WEBFLOW_SITE_ID=xxx
WEBFLOW_EXPERTS_COLLECTION_ID=xxx
WEBFLOW_SKILLS_COLLECTION_ID=xxx
WEBFLOW_CATEGORIES_COLLECTION_ID=xxx
WEBFLOW_STATES_COLLECTION_ID=xxx
WEBFLOW_CITIES_COLLECTION_ID=xxx
WEBFLOW_CERTIFICATIONS_COLLECTION_ID=650b358b2ae0fe324b126a7f
```

## Deployment

- **Platform:** Vercel
- **Repo:** https://github.com/kkarnesdesigns/webflow-experts-router
- **Production URL:** https://seo.joingyde.com

### After Adding New Features

1. Add any new env variables to Vercel dashboard
2. Trigger route regeneration: `GET /api/generate-routes`
3. Clear Vercel cache if needed
4. Update client scripts in Webflow's custom code

## Common Issues & Solutions

### Certifications Not Showing in Dropdown
- **Cause:** Routes not regenerated after adding certifications
- **Fix:** Call `/api/generate-routes` to regenerate manifest

### Skills/Certs List Too Long
- **Solution:** Added scrollable container with `max-height: 300px`

### Expert Count Showing in UI
- **If unwanted:** Remove `.expertCount` displays from dropdown HTML/CSS

### Wized Variables Not Set
- **Check:** Console for "Stored route params" message
- **Check:** Route manifest has the path with correct IDs

## Statistics (as of last generation)

- Total routes: ~2,736
- State-level skill routes: ~783
- City-level skill routes: ~886
- State-level certification routes: ~783
- City-level certification routes: ~886
- Routes with at least 1 expert: ~1,067
