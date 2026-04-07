/* AI Content Studio - front-end app */
const API = '/api/ai-studio';

const state = {
  collections: [],
  currentCollection: null,
  items: [],
  filtered: [],
  selectedId: null,
  selectedIds: new Set(),
  batchMode: false,
  currentItem: null,
  history: [],
  batchResults: new Map(),
};

const $ = (sel) => document.querySelector(sel);

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
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
  if (sel.options.length) {
    state.currentCollection = sel.value;
    await loadItems();
  }
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
      ? `<input type="checkbox" ${state.selectedIds.has(it.id) ? 'checked' : ''} data-id="${it.id}" />`
      : '';

    const badges = [];
    if (it.aiLock) badges.push('<span class="badge lock">locked</span>');
    if (it.hasBody) badges.push('<span class="badge ok">body</span>');
    if (it.aiVersion) badges.push(`<span class="badge">v${it.aiVersion}</span>`);

    row.innerHTML = `${cb}<span class="name">${escapeHtml(it.name)}</span>${badges.join('')}`;
    row.addEventListener('click', (ev) => {
      if (state.batchMode) {
        if (ev.target.tagName === 'INPUT') return; // let checkbox handler fire
        toggleBatchSelect(it.id);
      } else {
        selectItem(it.id);
      }
    });
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.addEventListener('change', () => toggleBatchSelect(it.id));
    }
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
async function selectItem(id) {
  state.selectedId = id;
  state.history = [];
  renderItems();
  $('#editor-empty').classList.add('hidden');
  $('#editor-panel').classList.remove('hidden');
  $('#batch-panel').classList.add('hidden');
  $('#item-name').textContent = 'Loading…';
  $('#item-meta').textContent = '';
  $('#current-body').innerHTML = '';
  $('#draft').value = '';
  $('#btn-approve').disabled = true;
  try {
    const item = await api(
      `/item-detail?collection=${state.currentCollection}&id=${id}`
    );
    state.currentItem = item;
    $('#item-name').textContent = item.name || '(unnamed)';
    const detected = item.fields || {};
    $('#item-meta').textContent = [
      item.slug ? `/${item.slug}` : '',
      item.aiVersion ? `v${item.aiVersion}` : '',
      item.lastRefresh ? `updated ${new Date(item.lastRefresh).toLocaleDateString()}` : '',
      detected.body ? `body → ${detected.body}` : 'no body field detected',
    ]
      .filter(Boolean)
      .join(' · ');
    $('#current-body').innerHTML = item.body || '<em class="muted">empty</em>';
  } catch (e) {
    toast('Error loading item: ' + e.message, 4000);
  }
}

// ---------- Generation ----------
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
        history: state.history,
      }),
    });
    $('#draft').value = data.content;
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
    // Include the user's current edited draft as the latest assistant turn, so
    // Claude revises from what the user actually sees.
    const history = state.history.slice();
    // Replace last assistant content with whatever is in the editor (user may have hand-edited):
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        history[i] = { role: 'assistant', content: $('#draft').value };
        break;
      }
    }
    history.push({ role: 'user', content: fb });

    const data = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        itemId: state.currentItem.id,
        history: history.slice(1), // drop synthetic initial user turn; server rebuilds it
      }),
    });
    // Append feedback + new assistant turn to state history
    state.history.push({ role: 'user', content: fb });
    state.history.push({ role: 'assistant', content: data.content });
    $('#draft').value = data.content;
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
  const content = $('#draft').value.trim();
  if (!content) return toast('Nothing to save');
  if (!confirm('Save this content to the Webflow CMS item as a draft?')) return;
  $('#btn-approve').disabled = true;
  try {
    await api('/save', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.currentCollection,
        itemId: state.currentItem.id,
        content,
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
  $('#editor-empty').classList.add('hidden');
  $('#editor-panel').classList.remove('hidden');
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
      state.batchResults.set(id, { status: 'done', content: data.content });
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
    if (result.status === 'done' && result.content) {
      entries.push({ itemId: id, content: result.content });
    }
  }
  if (!entries.length) return toast('No successful drafts to save');
  if (!confirm(`Save ${entries.length} drafts to Webflow CMS?`)) return;
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
      if (r.ok) state.batchResults.set(r.itemId, { ...state.batchResults.get(r.itemId), status: 'saved' });
      else state.batchResults.set(r.itemId, { status: 'error', error: r.error });
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
function closeStyleGuide() {
  $('#style-guide-modal').classList.add('hidden');
}
async function saveStyleGuide() {
  const content = $('#style-guide-text').value;
  try {
    await api('/style-guide', { method: 'POST', body: JSON.stringify({ content }) });
    $('#style-guide-status').textContent = 'Saved';
    toast('Style guide saved');
  } catch (e) {
    toast('Save failed: ' + e.message);
  }
}
function handleStyleGuideFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('#style-guide-text').value = reader.result;
  };
  reader.readAsText(file);
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Wire up ----------
function init() {
  $('#collection-select').addEventListener('change', (e) => {
    state.currentCollection = e.target.value;
    state.selectedId = null;
    state.selectedIds.clear();
    state.batchResults.clear();
    loadItems();
  });
  $('#search-input').addEventListener('input', applySearch);
  $('#refresh-items').addEventListener('click', loadItems);
  $('#select-mode').addEventListener('change', (e) => {
    state.batchMode = e.target.checked;
    state.selectedIds.clear();
    state.batchResults.clear();
    renderItems();
    renderBatchPanel();
    if (!state.batchMode) {
      $('#batch-panel').classList.add('hidden');
    }
  });

  $('#btn-generate').addEventListener('click', generateForCurrent);
  $('#btn-revise').addEventListener('click', reviseCurrent);
  $('#btn-approve').addEventListener('click', approveCurrent);

  $('#btn-batch-generate').addEventListener('click', batchGenerate);
  $('#btn-batch-approve').addEventListener('click', batchApprove);

  $('#toggle-preview').addEventListener('click', () => {
    const pv = $('#draft-preview');
    const ta = $('#draft');
    if (pv.classList.contains('hidden')) {
      pv.innerHTML = ta.value;
      pv.classList.remove('hidden');
      ta.classList.add('hidden');
      $('#toggle-preview').textContent = 'Edit';
    } else {
      pv.classList.add('hidden');
      ta.classList.remove('hidden');
      $('#toggle-preview').textContent = 'Preview';
    }
  });

  $('#open-style-guide').addEventListener('click', openStyleGuide);
  $('#close-style-guide').addEventListener('click', closeStyleGuide);
  $('#save-style-guide').addEventListener('click', saveStyleGuide);
  $('#style-guide-file').addEventListener('change', handleStyleGuideFile);

  loadCollections();
}

init();
