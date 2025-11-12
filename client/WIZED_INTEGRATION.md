# Wized Integration Guide

This guide explains how to integrate the Experts Router with your Wized setup in Webflow.

## Step 1: Add the Router Script to Webflow

1. Open your Webflow project
2. Go to your experts template page
3. Open Page Settings → Custom Code
4. Add the following in the **Before `</body>` tag** section:

```html
<script src="https://your-vercel-url.vercel.app/client/wized-experts-router.js"></script>
```

Or copy the contents of `wized-experts-router.js` and paste directly into the custom code section.

## Step 2: Access Route Parameters in Wized

The router makes route parameters available in three ways:

### Option A: Global Variable
```javascript
// Access via window object
const params = window.ExpertsRouteParams;

console.log(params.skill);      // e.g., "dentistry"
console.log(params.city);       // e.g., "dallas" (or null for state-level)
console.log(params.state);      // e.g., "texas"
console.log(params.skillId);    // Webflow CMS item ID
console.log(params.cityId);     // Webflow CMS item ID (or null)
console.log(params.stateId);    // Webflow CMS item ID
```

### Option B: Session Storage
```javascript
const paramsJson = sessionStorage.getItem('expertsRouteParams');
const params = JSON.parse(paramsJson);
```

### Option C: Custom Event Listener
```javascript
window.addEventListener('expertsRouteReady', (event) => {
  const params = event.detail;
  console.log('Route ready:', params);
  // Update your Wized request filters here
});
```

## Step 3: Filter Experts in Wized Request

In your Wized CMS Request that fetches experts, add filters based on the route params:

### Example Wized Request Configuration

```javascript
// In your Wized Request settings:
{
  "path": "/collections/YOUR_EXPERTS_COLLECTION_ID/items",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer YOUR_WEBFLOW_TOKEN",
    "accept-version": "1.0.0"
  },
  "params": {
    // Filter by skill
    "filter[skill]": window.ExpertsRouteParams?.skillId,

    // Filter by location (city if available, otherwise state)
    "filter[city]": window.ExpertsRouteParams?.cityId || undefined,
    "filter[state]": window.ExpertsRouteParams?.cityId
      ? undefined
      : window.ExpertsRouteParams?.stateId
  }
}
```

### Using Wized Variables

If you're using Wized's variable system, create these variables:

**Variable: `v.filterSkillId`**
```javascript
return window.ExpertsRouteParams?.skillId || null;
```

**Variable: `v.filterCityId`**
```javascript
return window.ExpertsRouteParams?.cityId || null;
```

**Variable: `v.filterStateId`**
```javascript
return window.ExpertsRouteParams?.stateId || null;
```

**Variable: `v.routeType`**
```javascript
return window.ExpertsRouteParams?.type || null; // 'city' or 'state'
```

Then use these variables in your request filters.

## Step 4: Update Page Content Dynamically

### Display Location Name in Header

In Wized, bind text elements to display location information:

**Text Element for Page Title:**
```javascript
// Wized text binding
const params = window.ExpertsRouteParams;
if (!params) return 'Find Experts';

if (params.type === 'city') {
  return `${params.skillName} Experts in ${params.cityName}, ${params.stateName}`;
} else {
  return `${params.skillName} Experts in ${params.stateName}`;
}
```

**Text Element for Breadcrumb:**
```javascript
const params = window.ExpertsRouteParams;
if (params.type === 'city') {
  return `Home / Experts / ${params.stateName} / ${params.cityName} / ${params.skillName}`;
} else {
  return `Home / Experts / ${params.stateName} / ${params.skillName}`;
}
```

### Conditional Visibility

**Show/Hide City-Specific Content:**
```javascript
// Wized visibility condition
return window.ExpertsRouteParams?.type === 'city';
```

**Show/Hide State-Specific Content:**
```javascript
// Wized visibility condition
return window.ExpertsRouteParams?.type === 'state';
```

## Step 5: Handle Empty Results

Add a conditional element that shows when no experts match:

**Visibility Condition:**
```javascript
// Show when experts list is empty
const experts = r.get_experts?.data?.items || []; // Replace with your request name
return experts.length === 0;
```

**Text Content:**
```javascript
const params = window.ExpertsRouteParams;
const location = params.type === 'city'
  ? `${params.cityName}, ${params.stateName}`
  : params.stateName;

return `No ${params.skillName} experts found in ${location}. Please check back later or browse other locations.`;
```

## Step 6: Testing

To test the integration:

1. **Local Testing:** Navigate to URLs like:
   - `/experts/texas/dentistry` (state-level)
   - `/experts/texas/dallas/dentistry` (city-level)

2. **Check Console:** Open browser DevTools and check for:
   ```
   Initializing Experts Router...
   Parsed route: {type: "city", state: "texas", city: "dallas", skill: "dentistry"}
   Experts Route Params: {...}
   ```

3. **Check Variables:** In console, type:
   ```javascript
   console.log(window.ExpertsRouteParams);
   ```

4. **Verify Filtering:** Check that your experts list only shows relevant results

## Available Route Parameters

The router provides these parameters:

```javascript
{
  type: 'city' | 'state',           // Route type
  skill: 'dentistry',               // Skill slug from URL
  state: 'texas',                   // State slug from URL
  city: 'dallas',                   // City slug from URL (null for state routes)
  skillId: '507f1f77bcf86cd799439011',  // Webflow CMS ID
  stateId: '507f1f77bcf86cd799439012',  // Webflow CMS ID
  cityId: '507f1f77bcf86cd799439013',   // Webflow CMS ID (null for state routes)
  skillName: 'Dentistry',           // Display name from CMS
  stateName: 'Texas',               // Display name from CMS
  cityName: 'Dallas',               // Display name from CMS (null for state routes)
  isValidRoute: true                // Whether route exists in manifest
}
```

## Troubleshooting

### Route params are undefined
- Make sure the router script loads before Wized initializes
- Check browser console for errors
- Verify you're on a valid experts route

### Filters not working
- Check that collection field names match your filter keys
- Verify the field types (Reference vs Text)
- Use browser DevTools Network tab to inspect the API request

### 404 handling
- Listen for the `expertsRoute404` event to show custom 404 content
- Hide main content and show error message when `isValidRoute === false`

## Need Help?

Check the main README.md for more information or contact your developer.
