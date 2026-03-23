#!/usr/bin/env node
/**
 * Combines all seo-batch-XX.csv files into a single seo-landing-content.csv
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const batchFiles = fs.readdirSync(dir)
  .filter(f => f.match(/^seo-batch-\d+\.csv$/))
  .sort();

if (batchFiles.length === 0) {
  console.error('No batch CSV files found');
  process.exit(1);
}

// Read header from first file
const firstFile = fs.readFileSync(path.join(dir, batchFiles[0]), 'utf8');
const lines = firstFile.split('\n');
const header = lines[0];

// Collect all data rows
const allRows = [];
for (const file of batchFiles) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const fileLines = content.split('\n');
  // Skip header (first line), add all data rows
  for (let i = 1; i < fileLines.length; i++) {
    if (fileLines[i].trim()) {
      allRows.push(fileLines[i]);
    }
  }
}

const output = [header, ...allRows].join('\n');
const outPath = path.join(dir, 'seo-landing-content.csv');
fs.writeFileSync(outPath, output, 'utf8');

console.log(`Combined ${batchFiles.length} batch files`);
console.log(`Total rows: ${allRows.length}`);
console.log(`Output: ${outPath}`);
