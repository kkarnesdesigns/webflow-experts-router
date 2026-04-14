/**
 * Explicit per-collection mapping of the fields the AI Content Studio edits.
 *
 * Only Skills and Certifications currently have editable AI fields.
 * Categories / Cities / States are exposed as "unsupported" in the UI until
 * equivalent fields are added to those collections.
 *
 * Each entry lists one or more `fields` the studio generates and writes.
 * Field kinds:
 *   - "short"  -> single-line plain text (meta description). Has a target
 *                 character length for QA and UI hinting.
 *   - "long"   -> rich text HTML (long SEO description).
 */

const EDITABLE = {
  skills: {
    fields: [
      {
        key: 'meta',
        slug: 'meta-description',
        label: 'Meta Description',
        kind: 'short',
        targetMin: 140,
        targetMax: 160,
      },
      {
        key: 'longSeo',
        slug: 'long-seo-description',
        label: 'Long SEO Description',
        kind: 'long',
        targetMinWords: 300,
        targetMaxWords: 600,
      },
    ],
  },
  certifications: {
    fields: [
      {
        key: 'meta',
        slug: 'meta-description',
        label: 'Meta Description',
        kind: 'short',
        targetMin: 140,
        targetMax: 160,
      },
      {
        key: 'longSeo',
        slug: 'long-seo-description',
        label: 'Long SEO Description',
        kind: 'long',
        targetMinWords: 300,
        targetMaxWords: 600,
      },
    ],
  },
  landingContent: {
    fields: [
      {
        key: 'meta',
        slug: 'meta-description',
        label: 'Meta Description',
        kind: 'short',
        targetMin: 140,
        targetMax: 160,
      },
      {
        key: 'longSeo',
        slug: 'seo-body',
        label: 'SEO Body',
        kind: 'long',
        targetMinWords: 300,
        targetMaxWords: 600,
      },
    ],
  },
  // No AI-editable fields yet:
  categories: { fields: [] },
  cities: { fields: [] },
  states: { fields: [] },
};

function getEditableFields(collectionKey) {
  return EDITABLE[collectionKey] || { fields: [] };
}

function isSupported(collectionKey) {
  return (EDITABLE[collectionKey]?.fields || []).length > 0;
}

module.exports = { EDITABLE, getEditableFields, isSupported };
