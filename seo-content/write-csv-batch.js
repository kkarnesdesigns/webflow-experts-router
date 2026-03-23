#!/usr/bin/env node
/**
 * Utility to write a batch of SEO content rows to CSV.
 * Called by agents after generating content.
 *
 * Usage: node seo-content/write-csv-batch.js <batch-number> <json-file-with-rows>
 *
 * The JSON file should contain an array of objects with:
 * { path, skillName?, certificationName?, stateName?, cityName?, routeType, skill?, certification?, state?, city?,
 *   meta_title, meta_description, h1, hero_subhead, seo_body }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROMPT_VERSION = 'v1.0';

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateFingerprint(params) {
  const input = [
    params.skillName || params.certificationName || '',
    params.stateName || '',
    params.cityName || '',
    params.routeType || '',
    PROMPT_VERSION
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

const batchNum = process.argv[2];
const inputFile = process.argv[3];

if (!batchNum || !inputFile) {
  console.error('Usage: node write-csv-batch.js <batch-number> <json-file>');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

const routeTypeMap = {
  'state': 'skill-state',
  'city': 'skill-city',
  'state-certification': 'cert-state',
  'city-certification': 'cert-city'
};

const header = 'name,skill-ref,certification-ref,state-ref,city-ref,route-type,meta-title,meta-description,h1,hero-subhead,seo-body,ai-fingerprint,ai-version,last-ai-refresh,ai-lock,ai-notes,generation-status';

const csvRows = rows.map(row => {
  const entityName = row.skillName || row.certificationName;
  const locationParts = [row.cityName, row.stateName].filter(Boolean);
  const name = `${entityName} - ${locationParts.join(', ')}`;

  const fingerprint = generateFingerprint({
    skillName: row.skillName,
    certificationName: row.certificationName,
    stateName: row.stateName,
    cityName: row.cityName,
    routeType: row.routeType || row.type
  });

  return [
    name,
    row.skill || '',
    row.certification || '',
    row.state || '',
    row.city || '',
    routeTypeMap[row.routeType || row.type] || row.type,
    row.meta_title || '',
    row.meta_description || '',
    row.h1 || '',
    row.hero_subhead || '',
    row.seo_body || '',
    fingerprint,
    PROMPT_VERSION,
    new Date().toISOString(),
    'false',
    row.ai_notes || '',
    row.generation_status || 'success'
  ].map(csvEscape).join(',');
});

const paddedBatch = String(batchNum).padStart(2, '0');
const outPath = path.join(__dirname, `seo-batch-${paddedBatch}.csv`);
fs.writeFileSync(outPath, [header, ...csvRows].join('\n'), 'utf8');
console.log(`Wrote ${csvRows.length} rows to ${outPath}`);
