/* AI Content Studio - front-end app (Meta + Long SEO editor) */
const API = '/api/ai-studio';

const state = {
  collections: [],
  currentCollection: null,
  collectionMeta: null,      // { supported, editableFields }
  items: [],
  filtered: [],
  selectedId: null,
  selectedIds: new Set(),
  batchMode: false,
  currentItem: null,
  history: [],               // full prior turns for revision loops
  batchResults: new Map(),   // itemId -> { status, values }
  tab: 'cms',                // 'cms' | 'gsc'
  gscPages: [],
  gscMeta: null,
};

const $ = (sel) => document.querySelector(sel);

// ---------- Rich text editor (Quill) ----------
let richEditor = null;
let sourceMode = false;

function initRichEditor() {
  richEditor = new Quill('#long-editor', {
    theme: 'snow',
    placeholder: 'Click Generate to have Claude write one...',
    modules: {
      toolbar: [
        [{ header: [2, 3, 4, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'link'],
        [{ align: [] }],
        ['clean'],
      ],
    },
  });
  // Keep hidden textarea in sync when editing via Quill
  richEditor.on('text-change', () => {
    if (!sourceMode) $('#long-input').value = richEditor.getSemanticHTML();
  });
}

function getLongHtml() {
  if (sourceMode) return $('#long-input').value;
  return richEditor ? richEditor.getSemanticHTML() : $('#long-input').value;
}

function setLongHtml(html) {
  const value = html || '';
  $('#long-input').value = value;
  if (richEditor) {
    const delta = richEditor.clipboard.convert({ html: value });
    richEditor.setContents(delta, 'silent');
  }
}

function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

// ---------- Collections ----------
async function loadCollections() {
  const data = await api('/collections');
  state.collections = data.collections;
  const sel = $('#collection-select');
  sel.innerHTML = '';
  data.collections
    .filter((c) => c.configured)
    .forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.key;
      opt.textContent = c.supported ? c.label : `${c.label} (no AI fields)`;
      sel.appendChild(opt);
    });
  if (sel.options.length) {
    // Prefer a supported collection on first load
    const firstSupported = data.collections.find((c) => c.configured && c.supported);
    sel.value = firstSupported ? firstSupported.key : sel.options[0].value;
    onCollectionChange();
  }
}

function onCollectionChange() {
  const key = $('#collection-select').value;
  state.currentCollection = key;
  state.collectionMeta = state.collections.find((c) => c.key === key) || null;
  state.selectedId = null;
  state.selectedIds.clear();
  state.batchResults.clear();
  state.currentItem = null;

  const note = $('#collection-note');
  if (state.collectionMeta && !state.collectionMeta.supported) {
    note.textContent = 'No AI-editable fields configured for this collection.';
  } else if (state.collectionMeta) {
    const labels = (state.collectionMeta.editableFields || []).map((f) => f.label).join(' + ');
    note.textContent = labels ? `Editing: ${labels}` : '';
  } else {
    note.textContent = '';
  }

  showEditor(false);
  loadItems();
}

// ---------- Items list ----------
async function loadItems() {
  const col = state.currentCollection;
  if (!col) return;
  $('#items-list').innerHTML = '<div class="muted small" style="padding:10px">Loading…</div>';
  try {
    const data = await api(`/items?collection=${encodeURIComponent(col)}&limit=500`);
    state.items = data.items;
    applySearch();
    if (state.gscPages.length) renderGsc();
  } catch (e) {
    $('#items-list').innerHTML = `<div class="muted small" style="padding:10px">Error: ${e.message}</div>`;
  }
}

function applySearch() {
  const q = $('#search-input').value.toLowerCase().trim();
  state.filtered = q
    ? state.items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q)
      )
    : state.items.slice();
  renderItems();
}

function renderItems() {
  const list = $('#items-list');
  if (!state.filtered.length) {
    list.innerHTML = '<div class="muted small" style="padding:10px">No items</div>';
    $('#items-meta').textContent = '';
    return;
  }
  list.innerHTML = '';
  for (const it of state.filtered) {
    const row = document.createElement('div');
    row.className = 'item';
    if (state.batchMode) {
      if (state.selectedIds.has(it.id)) row.classList.add('active');
    } else if (state.selectedId === it.id) {
      row.classList.add('active');
    }

    const cb = state.batchMode
      ? `<input type="checkbox" ${state.selectedIds.has(it.id) ? 'checked' : ''} />`
      : '';

    const badges = [];
    const pop = it.populated || {};
    if (pop.meta) badges.push('<span class="badge ok">meta</span>');
    if (pop.longSeo) badges.push('<span class="badge ok">seo</span>');

    row.innerHTML = `${cb}<span class="name">${escapeHtml(it.name)}</span>${badges.join('')}`;
    row.addEventListener('click', (ev) => {
      if (state.batchMode) {
        if (ev.target.tagName === 'INPUT') return;
        toggleBatchSelect(it.id);
      } else {
        selectItem(it.id);
      }
    });
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.addEventListener('change', () => toggleBatchSelect(it.id));
    list.appendChild(row);
  }
  $('#items-meta').textContent = state.batchMode
    ? `${state.selectedIds.size} selected / ${state.filtered.length} shown`
    : `${state.filtered.length} items`;
}

function toggleBatchSelect(id) {
  if (state.selectedIds.has(id)) state.selectedIds.delete(id);
  else state.selectedIds.add(id);
  renderItems();
  renderBatchPanel();
}

// ---------- Single item selection ----------
function showEditor(show) {
  const supported = state.collectionMeta?.supported !== false;
  $('#editor-empty').classList.toggle('hidden', show || !supported);
  $('#unsupported').classList.toggle('hidden', supported);
  $('#editor-panel').classList.toggle('hidden', !show || !supported);
}

let selectToken = 0;
async function selectItem(id) {
  if (!state.collectionMeta?.supported) return;
  if (isMobile()) closeSidebar();
  const myToken = ++selectToken;
  state.selectedId = id;
  state.currentItem = null;
  state.history = [];
  renderItems();
  showEditor(true);
  $('#batch-panel').classList.add('hidden');
  $('#item-name').textContent = 'Loading…';
  $('#item-meta').textContent = '';
  $('#meta-input').value = '';
  setLongHtml('');
  // Reset rich editor back to visual mode on item switch.
  sourceMode = false;
  $('#long-input').classList.add('hidden');
  $('#long-editor').classList.remove('hidden');
  $('#toggle-long-source').textContent = 'Source';
  updateMetaCounter();
  $('#btn-approve').disabled = true;
  try {
    const item = await api(`/item-detail?collection=${state.currentCollection}&id=${id}`);
    // Ignore stale responses from a previous click.
    if (myToken !== selectToken) return;
    state.currentItem = item;
    $('#item-name').textContent = item.name || '(unnamed)';
    $('#item-meta').textContent = item.slug ? `/${item.slug}` : '';
    $('#meta-input').value = item.values.meta || '';
    setLongHtml(item.values.longSeo || '');
    updateMetaCounter();
  } catch (e) {
    if (myToken === selectToken) toast('Error loading item: ' + e.message, 4000);
  }
}

function updateMetaCounter() {
  const len = $('#meta-input').value.length;
  const el = $('#meta-counter');
  el.textContent = `${len} chars`;
  el.classList.toggle('warn', len > 0 && (len < 140 || len > 160));
}

// ---------- Generation ----------
function getEditedValues() {
  return {
    meta: $('#meta-input').value,
    longSeo: getLongHtml(),
  };
}

function applyValues(values) {
  if (values.meta !== undefined) $('#meta-input').value = values.meta;
  if (values.longSeo !== undefined) setLongHtml(values.longSeo);
  updateMetaCounter();
}

async function generateForCurrent() {
  if (!state.currentItem) return;
  toast('Generating…');
  $('#btn-generate').disabled = true;
  try {
    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        itemId: state.currentItem.id,
        instructions: $('#instructions').value,
        currentValues: getEditedValues(),
      }),
    });
    applyValues(data.values);
    state.history = data.turns;
    $('#btn-approve').disabled = false;
    renderHistory();
    toast('Draft ready');
  } catch (e) {
    toast('Generate failed: ' + e.message, 4500);
  } finally {
    $('#btn-generate').disabled = false;
  }
}

async function reviseCurrent() {
  if (!state.currentItem) return;
  const fb = $('#feedback-input').value.trim();
  if (!fb) return toast('Enter feedback first');
  if (!state.history.length) return toast('Generate a draft first');
  toast('Revising…');
  try {
    // Reflect any hand edits back into the "assistant" turn so Claude revises
    // from what the user is currently looking at.
    const editedAssistant = JSON.stringify(getEditedValues());
    const history = state.history.slice();
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        history[i] = { role: 'assistant', content: editedAssistant };
        break;
      }
    }
    history.push({ role: 'user', content: fb });

    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        itemId: state.currentItem.id,
        // Drop the synthetic initial user turn - server rebuilds it:
        history: history.slice(1),
      }),
    });
    state.history.push({ role: 'user', content: fb });
    state.history.push({ role: 'assistant', content: JSON.stringify(data.values) });
    applyValues(data.values);
    $('#feedback-input').value = '';
    renderHistory();
    toast('Revised');
  } catch (e) {
    toast('Revise failed: ' + e.message, 4500);
  }
}

function renderHistory() {
  const el = $('#history');
  el.innerHTML = '';
  for (const turn of state.history) {
    if (turn.synthetic) continue;
    const div = document.createElement('div');
    div.className = `turn ${turn.role}`;
    const label = turn.role === 'user' ? 'You' : 'Claude';
    const snippet = turn.content.length > 180 ? turn.content.slice(0, 180) + '…' : turn.content;
    div.textContent = `${label}: ${snippet}`;
    el.appendChild(div);
  }
}

// ---------- Approve & save ----------
async function approveCurrent() {
  if (!state.currentItem) return;
  const values = getEditedValues();
  if (!values.meta.trim() && !values.longSeo.trim()) return toast('Nothing to save');
  if (!confirm('Save Meta + Long SEO to Webflow as a draft?')) return;
  $('#btn-approve').disabled = true;
  try {
    await api('/save', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        itemId: state.currentItem.id,
        values,
        publish: false,
      }),
    });
    toast('Saved to Webflow ✓');
    await loadItems();
  } catch (e) {
    toast('Save failed: ' + e.message, 5000);
  } finally {
    $('#btn-approve').disabled = false;
  }
}

// ---------- Batch ----------
function renderBatchPanel() {
  const panel = $('#batch-panel');
  if (!state.batchMode) {
    panel.classList.add('hidden');
    return;
  }
  showEditor(true);
  panel.classList.remove('hidden');

  const ids = Array.from(state.selectedIds);
  const list = $('#batch-list');
  list.innerHTML = '';
  if (!ids.length) {
    list.innerHTML = '<div class="muted small" style="padding:10px">Select items on the left.</div>';
  }
  for (const id of ids) {
    const item = state.items.find((i) => i.id === id);
    if (!item) continue;
    const row = document.createElement('div');
    row.className = 'batch-item';
    const result = state.batchResults.get(id);
    const statusClass = result?.status || 'pending';
    const statusText = result?.status || 'pending';
    row.innerHTML = `<span class="name" style="flex:1">${escapeHtml(item.name)}</span><span class="status ${statusClass}">${statusText}</span>`;
    list.appendChild(row);
  }
  const anyDone = Array.from(state.batchResults.values()).some((r) => r.status === 'done');
  $('#btn-batch-approve').disabled = !anyDone;
}

async function batchGenerate() {
  const ids = Array.from(state.selectedIds);
  if (!ids.length) return toast('Select at least one item');
  $('#btn-batch-generate').disabled = true;
  const instructions = $('#instructions').value;

  for (const id of ids) {
    state.batchResults.set(id, { status: 'running' });
    renderBatchPanel();
    try {
      const data = await api('/generate', {
        method: 'POST',
        body: JSON.stringify({
          collection: state.currentCollection,
          itemId: id,
          instructions,
        }),
      });
      state.batchResults.set(id, { status: 'done', values: data.values });
    } catch (e) {
      state.batchResults.set(id, { status: 'error', error: e.message });
    }
    renderBatchPanel();
  }

  $('#btn-batch-generate').disabled = false;
  toast('Batch generation complete');
}

async function batchApprove() {
  const entries = [];
  for (const [id, result] of state.batchResults) {
    if (result.status === 'done' && result.values) {
      entries.push({ itemId: id, values: result.values });
    }
  }
  if (!entries.length) return toast('No successful drafts to save');
  if (!confirm(`Save ${entries.length} drafts to Webflow?`)) return;
  $('#btn-batch-approve').disabled = true;
  try {
    const data = await api('/save', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        items: entries,
        publish: false,
      }),
    });
    for (const r of data.results) {
      const prev = state.batchResults.get(r.itemId) || {};
      state.batchResults.set(r.itemId, r.ok ? { ...prev, status: 'saved' } : { status: 'error', error: r.error });
    }
    renderBatchPanel();
    toast('Batch saved');
    await loadItems();
  } catch (e) {
    toast('Batch save failed: ' + e.message, 5000);
  } finally {
    $('#btn-batch-approve').disabled = false;
  }
}

// ---------- Style guide ----------
async function openStyleGuide() {
  $('#style-guide-modal').classList.remove('hidden');
  try {
    const data = await api('/style-guide');
    $('#style-guide-text').value = data.content || '';
    $('#style-guide-status').textContent = `${(data.content || '').length} chars loaded`;
  } catch (e) {
    toast('Failed to load style guide: ' + e.message);
  }
}
function closeStyleGuide() { $('#style-guide-modal').classList.add('hidden'); }
async function saveStyleGuide() {
  const content = $('#style-guide-text').value;
  try {
    await api('/style-guide', { method: 'POST', body: JSON.stringify({ content }) });
    $('#style-guide-status').textContent = 'Saved';
    toast('Style guide saved');
  } catch (e) { toast('Save failed: ' + e.message); }
}
function handleStyleGuideFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $('#style-guide-text').value = reader.result; };
  reader.readAsText(file);
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Wire up ----------
// ---------- GSC tab ----------
function switchTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#tab-cms').classList.toggle('hidden', name !== 'cms');
  $('#tab-gsc').classList.toggle('hidden', name !== 'gsc');
}

async function loadGsc() {
  const days = $('#gsc-days').value;
  const sort = $('#gsc-sort').value;
  const minImpressions = $('#gsc-min-impressions').value || '0';
  const contains = $('#gsc-contains').value.trim();
  const list = $('#gsc-list');
  list.innerHTML = '<div class="muted small" style="padding:10px">Loading…</div>';
  $('#gsc-meta').textContent = '';
  try {
    const qs = new URLSearchParams({ days, sort, minImpressions, limit: '200' });
    if (contains) qs.set('contains', contains);
    const data = await api(`/gsc-pages?${qs}`);
    if (!data.configured) {
      list.innerHTML = `<div class="muted small" style="padding:10px">${escapeHtml(data.error || 'GSC not configured')}</div>`;
      return;
    }
    state.gscPages = data.pages;
    state.gscMeta = data;
    renderGsc();
  } catch (e) {
    list.innerHTML = `<div class="muted small" style="padding:10px">Error: ${escapeHtml(e.message)}</div>`;
  }
}

function findCmsItemBySlug(slug) {
  if (!slug) return null;
  const norm = slug.toLowerCase();
  return state.items.find((i) => i.slug && i.slug.toLowerCase() === norm) || null;
}

function renderGsc() {
  const list = $('#gsc-list');
  const pages = state.gscPages;
  if (!pages.length) {
    list.innerHTML = '<div class="muted small" style="padding:10px">No pages match the filters.</div>';
    $('#gsc-meta').textContent = '';
    return;
  }
  list.innerHTML = '';
  let matched = 0;
  for (const p of pages) {
    const match = findCmsItemBySlug(p.slug);
    if (match) matched++;
    const row = document.createElement('div');
    row.className = `gsc-row ${match ? 'matched' : 'unmatched'}`;
    row.innerHTML = `
      <div>
        <span class="slug">${escapeHtml(p.slug || '(no slug)')}</span>
        ${match ? '<span class="badge match">in CMS</span>' : '<span class="badge nomatch">no match</span>'}
      </div>
      <div class="url">${escapeHtml(p.page)}</div>
      <div class="metrics">
        <span class="metric">pos <b>${p.position.toFixed(1)}</b></span>
        <span class="metric">imp <b>${p.impressions}</b></span>
        <span class="metric">clk <b>${p.clicks}</b></span>
        <span class="metric">ctr <b>${(p.ctr * 100).toFixed(1)}%</b></span>
      </div>
    `;
    row.addEventListener('click', () => {
      if (!match) {
        toast(`No CMS match for "${p.slug}" in ${state.currentCollection}. Try another collection.`);
        return;
      }
      selectItem(match.id);
    });
    list.appendChild(row);
  }
  const meta = state.gscMeta;
  $('#gsc-meta').textContent = `${pages.length} pages · ${matched} matched · ${meta.startDate} → ${meta.endDate}`;
}

function openSidebar() { document.body.classList.add('sidebar-open'); $('#sidebar-backdrop').classList.remove('hidden'); }
function closeSidebar() { document.body.classList.remove('sidebar-open'); $('#sidebar-backdrop').classList.add('hidden'); }
function isMobile() { return window.matchMedia('(max-width: 720px)').matches; }

function init() {
  $('#sidebar-toggle').addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-open')) closeSidebar();
    else openSidebar();
  });
  $('#sidebar-backdrop').addEventListener('click', closeSidebar);
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );
  $('#gsc-load').addEventListener('click', loadGsc);
  $('#collection-select').addEventListener('change', onCollectionChange);
  $('#search-input').addEventListener('input', applySearch);
  $('#refresh-items').addEventListener('click', loadItems);
  $('#select-mode').addEventListener('change', (e) => {
    state.batchMode = e.target.checked;
    state.selectedIds.clear();
    state.batchResults.clear();
    renderItems();
    renderBatchPanel();
    if (!state.batchMode) $('#batch-panel').classList.add('hidden');
  });

  $('#btn-generate').addEventListener('click', generateForCurrent);
  $('#btn-revise').addEventListener('click', reviseCurrent);
  $('#btn-approve').addEventListener('click', approveCurrent);
  $('#meta-input').addEventListener('input', updateMetaCounter);

  $('#btn-batch-generate').addEventListener('click', batchGenerate);
  $('#btn-batch-approve').addEventListener('click', batchApprove);

  $('#toggle-long-source').addEventListener('click', () => {
    const editor = $('#long-editor');
    const ta = $('#long-input');
    if (!sourceMode) {
      // Switch to raw HTML source view: pull latest HTML from Quill into textarea.
      ta.value = richEditor.getSemanticHTML();
      editor.classList.add('hidden');
      ta.classList.remove('hidden');
      $('#toggle-long-source').textContent = 'Visual';
      sourceMode = true;
    } else {
      // Switch back to visual: push textarea HTML into Quill.
      setLongHtml(ta.value);
      ta.classList.add('hidden');
      editor.classList.remove('hidden');
      $('#toggle-long-source').textContent = 'Source';
      sourceMode = false;
    }
  });

  initRichEditor();

  $('#open-style-guide').addEventListener('click', openStyleGuide);
  $('#close-style-guide').addEventListener('click', closeStyleGuide);
  $('#save-style-guide').addEventListener('click', saveStyleGuide);
  $('#style-guide-file').addEventListener('change', handleStyleGuideFile);

  loadCollections();
}

init();
