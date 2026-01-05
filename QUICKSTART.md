# Quick Start Guide

Get up and running in 15 minutes.

## Step 1: Get Your Collection IDs (5 min)

1. Go to Webflow → Your Project → CMS
2. Click on each collection and copy the ID from the URL
3. Update `.env` file:

```bash
# Example URL: https://webflow.com/dashboard/sites/ABC123/collections/DEF456
# Collection ID is: DEF456

WEBFLOW_SITE_ID=your_site_id_here
WEBFLOW_EXPERTS_COLLECTION_ID=your_experts_collection_id
WEBFLOW_CITIES_COLLECTION_ID=your_cities_collection_id
WEBFLOW_STATES_COLLECTION_ID=your_states_collection_id
WEBFLOW_SKILLS_COLLECTION_ID=your_skills_collection_id
SITE_BASE_URL=https://yourdomain.com
```

## Step 2: Test Locally (2 min)

```bash
cd /Users/kylekarnes/webflow-experts-router
npm install
npm test
```

You should see:
- ✅ CMS data fetched
- ✅ Routes generated
- ✅ Files created in `output/`

## Step 3: Deploy to Vercel (3 min)

```bash
npm install -g vercel  # If not already installed
vercel --prod
```

Copy your deployment URL: `https://seo.joingyde.com`

## Step 4: Add to Vercel Environment Variables (2 min)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click your project → Settings → Environment Variables
3. Add all variables from your `.env` file
4. Click "Redeploy"

## Step 5: Add to Webflow (3 min)

### A. Create Template Page
1. In Webflow, create a new page: "Experts Template"
2. Design it with:
   - Heading text element (will be dynamic)
   - Collection List bound to Experts
   - Any other content you want

### B. Add Router Script
1. Page Settings → Custom Code → Before `</body>` tag
2. Add:

```html
<script>
// Update this URL to your Vercel deployment
(function(){/* Paste contents of client/wized-experts-router.js here */})();

// Or load from Vercel:
</script>
<script src="https://seo.joingyde.com/client/wized-experts-router.js"></script>
```

### C. Set Up Wized Variables

In Wized, create these variables:

**Variable: `v.pageTitle`**
```javascript
const p = window.ExpertsRouteParams;
if (!p) return 'Find Experts';
const loc = p.type === 'city' ? `${p.cityName}, ${p.stateName}` : p.stateName;
return `${p.skillName} Experts in ${loc}`;
```

**Variable: `v.skillId`**
```javascript
return window.ExpertsRouteParams?.skillId;
```

**Variable: `v.locationId`**
```javascript
// Returns city ID if city route, otherwise state ID
const p = window.ExpertsRouteParams;
return p?.cityId || p?.stateId;
```

### D. Filter Experts Request

In your Wized request that fetches experts, add filters:

```javascript
{
  "filter": {
    "skill": v.skillId,
    // Adjust these field names to match your CMS structure
    "location": v.locationId
  }
}
```

### E. Bind Page Title

Bind your heading text element to `v.pageTitle` variable.

## Step 6: Test It! (1 min)

1. Publish your Webflow site
2. Visit URLs like:
   - `yourdomain.com/experts/texas/dentistry` (state-level)
   - `yourdomain.com/experts/texas/dallas/dentistry` (city-level)
3. Check:
   - ✅ Page loads (not 404)
   - ✅ Title shows "Dentistry Experts in Texas" or "Dentistry Experts in Dallas, Texas"
   - ✅ Experts are filtered correctly

## Done! 🎉

Your dynamic routing is now live and will auto-update daily at 2 AM UTC.

---

## Common Issues

### "Route params are undefined"
→ Router script not loading. Check browser console for errors.

### "Experts not filtering"
→ Check Wized variable names and request filter field names match your CMS.

### "Page shows 404"
→ Need to set up Webflow redirect or proxy. See README.md "Set Up Webflow Hosting Redirects"

### "Routes not generating"
→ Check Collection IDs in `.env` are correct. Run `npm test` to verify.

---

## What's Next?

- Read `README.md` for detailed documentation
- Check `client/WIZED_INTEGRATION.md` for advanced Wized setup
- Set up Google Search Console and submit sitemap: `/api/sitemap.xml`
- Customize the URL structure if needed

## Need Help?

Run the test script and check the output:
```bash
npm test
```

Check the generated files in `output/` to see what's being created.
