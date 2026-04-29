#!/usr/bin/env node
/**
 * One-off cleanup: strip &nbsp; / U+00A0 contamination from long-form SEO
 * fields in Webflow that the AI Content Studio wrote before the save.js
 * sanitizer was added. Hits the same set of collections + slugs the studio
 * edits, fetches each item, sanitizes the field, and PATCHes /live so the
 * fix is visible immediately.
 *
 * Usage:
 *   node scripts/cleanup-nbsp.js              # dry-run by default
 *   node scripts/cleanup-nbsp.js --apply      # actually write
 *   node scripts/cleanup-nbsp.js --apply --collection=skills
 */

require('dotenv').config();
const WebflowAPI = require('../lib/webflow-api');

const TARGETS = [
  { key: 'skills', envVar: 'WEBFLOW_SKILLS_COLLECTION_ID', slug: 'long-seo-description' },
  { key: 'certifications', envVar: 'WEBFLOW_CERTIFICATIONS_COLLECTION_ID', slug: 'long-seo-description' },
  {
    key: 'landingContent',
    envVar: 'WEBFLOW_SEO_COLLECTION_ID',
    defaultId: '67438efdbd088e4db8a92998',
    slug: 'seo-body',
  },
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyArg = args.find((a) => a.startsWith('--collection='));
const onlyKey = onlyArg ? onlyArg.split('=')[1] : null;

function sanitizeLongValue(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/&nbsp;/gi, ' ')
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

function isContaminated(html) {
  if (!html || typeof html !== 'string') return false;
  return /&nbsp;| /i.test(html);
}

async function processCollection(api, target) {
  const id = process.env[target.envVar] || target.defaultId;
  if (!id) {
    console.log(`[${target.key}] skipped — no env var ${target.envVar} and no default`);
    return { scanned: 0, contaminated: 0, fixed: 0, failed: 0 };
  }

  console.log(`\n=== ${target.key} (${id}) — slug=${target.slug} ===`);
  const items = await api.getCollectionItems(id);
  let contaminated = 0;
  let fixed = 0;
  let failed = 0;

  for (const it of items) {
    const original = it.fieldData?.[target.slug];
    if (!isContaminated(original)) continue;
    contaminated++;
    const cleaned = sanitizeLongValue(original);
    const before = (original.match(/&nbsp;| /gi) || []).length;
    const after = (cleaned.match(/&nbsp;| /gi) || []).length;
    const name = it.fieldData?.name || '(unnamed)';
    console.log(
      `  ${apply ? 'FIX ' : 'WOULD FIX'}  ${it.id}  "${name}"  (${before} nbsp → ${after})`
    );
    if (!apply) continue;
    try {
      await api.updateCollectionItem(id, it.id, { [target.slug]: cleaned }, false);
      fixed++;
      // Webflow rate limit: ~60 req/min. Pace conservatively.
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      failed++;
      console.error(`    ! failed:`, e.response?.data?.message || e.message);
    }
  }

  return { scanned: items.length, contaminated, fixed, failed };
}

(async () => {
  const token = process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    console.error('WEBFLOW_API_TOKEN not set');
    process.exit(1);
  }
  if (!apply) {
    console.log('DRY RUN — pass --apply to write changes\n');
  } else {
    console.log('APPLY mode — items will be patched live\n');
  }

  const api = new WebflowAPI(token);
  const targets = onlyKey ? TARGETS.filter((t) => t.key === onlyKey) : TARGETS;
  if (!targets.length) {
    console.error(`Unknown collection key "${onlyKey}". Valid: ${TARGETS.map((t) => t.key).join(', ')}`);
    process.exit(1);
  }

  const totals = { scanned: 0, contaminated: 0, fixed: 0, failed: 0 };
  for (const t of targets) {
    const r = await processCollection(api, t);
    totals.scanned += r.scanned;
    totals.contaminated += r.contaminated;
    totals.fixed += r.fixed;
    totals.failed += r.failed;
  }

  console.log('\n=== summary ===');
  console.log(`scanned:      ${totals.scanned}`);
  console.log(`contaminated: ${totals.contaminated}`);
  console.log(`fixed:        ${totals.fixed}`);
  console.log(`failed:       ${totals.failed}`);
})().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
