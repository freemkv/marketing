// DOM wiring for /firmware/find/. Data and markup come from finder.mjs and
// finder-view.mjs; this file only handles events, focus and URL state.
import { hydrate, indexFinder, search, suggestions, pickerOptions, identityView, crossflashFrom, crossflashTo,
  browseTree, routeFromUrl, urlFor } from './finder.mjs';
import { renderResults, renderPicker, renderIdentity, renderCrossflash, renderBrowse } from './finder-view.mjs';

export function startFinder(doc, win) {
  const $ = id => doc.getElementById(id);
  const root = $('finder'), input = $('drive-search'), results = $('fx-results'), detail = $('drive-detail');
  const status = $('fx-status'), next = $('modify-next-step'), nextLink = $('firmware-next-link');
  const featureNote = $('modify-feature-note'), direction = $('fx-direction'), searchLabel = $('fx-search-label');
  if (!root || !input) return;
  const index = indexFinder(hydrate(JSON.parse($('finder-data').textContent)));
  const opts = { protectedDownloads: root.dataset.protected === '1', baseUrl: root.dataset.baseUrl || '' };
  const state = { mode: 'firmware', direction: 'from', known: {}, items: [], current: null, picker: null };

  function setUrl() {
    const identity = state.current && index.byKey.get(state.current);
    try { win.history.replaceState(null, '', win.location.pathname + urlFor({ mode: state.mode, identity, revision: identity ? state.known.revision : null })); } catch {}
  }
  function hideNext() { next.hidden = true; if (featureNote) featureNote.hidden = true; }
  function showDetail(html) { detail.innerHTML = html; detail.hidden = false; }

  function showIdentity(key, focus = true) {
    state.current = key; state.picker = null;
    if (state.mode === 'firmware') {
      const view = identityView(index, key, state.known);
      showDetail(renderIdentity(view, opts));
      const pkg = view.recommended?.package;
      const canModify = pkg?.modifiable === true;
      next.hidden = !pkg;
      nextLink.href = canModify ? '/firmware/modify/' : '/firmware/flash/';
      nextLink.textContent = canModify ? 'Next: modify it →' : 'Next: flash it →';
      if (featureNote) featureNote.hidden = !canModify;
    } else {
      const identity = index.byKey.get(key);
      const groups = state.direction === 'from' ? crossflashFrom(index, key) : crossflashTo(index, key);
      showDetail(renderCrossflash(identity, groups, { direction: state.direction, ...opts }));
      hideNext();
    }
    setUrl();
    if (focus) detail.focus({ preventScroll: false });
  }
  function choose(keys, label) {
    if (keys.length === 1) return showIdentity(keys[0]);
    state.current = null; state.picker = { keys, label };
    showDetail(renderPicker(label, pickerOptions(index, keys)));
    hideNext(); setUrl();
  }
  function rerender() {
    if (state.current) showIdentity(state.current, false);
    else if (state.picker) choose(state.picker.keys, state.picker.label);
  }

  function runSearch(auto = true) {
    const q = input.value.trim();
    if (!q) { results.innerHTML = ''; status.textContent = ''; state.items = []; return; }
    const r = search(index, q);
    state.known = { hardware: r.parsed.hardware, destination: r.parsed.destination, revision: r.parsed.revision };
    const total = r.exact.length + r.otherNames.length + r.similar.length;
    const { html, items } = renderResults(r, { suggestions: total ? [] : suggestions(index, q) });
    results.innerHTML = html; state.items = items;
    status.textContent = total ? `${total} match${total === 1 ? '' : 'es'}${r.exact.length ? ', including an exact match' : ''}.` : 'No matches.';
    if (auto && r.exact.length === 1) {
      const item = r.exact[0];
      if (item.targets.length === 1) showIdentity(item.targets[0], false); else choose(item.targets, item.label);
    } else if (!total) { detail.hidden = true; hideNext(); state.current = null; }
  }

  function setMode(mode, focusTab = false) {
    state.mode = mode;
    for (const tab of root.querySelectorAll('[role="tab"]')) {
      const on = tab.dataset.mode === mode;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle('is-active', on);
      if (on && focusTab) tab.focus();
      if (on) $('fx-panel').setAttribute('aria-labelledby', tab.id);
    }
    direction.hidden = mode !== 'crossflash';
    searchLabel.textContent = mode === 'crossflash' && state.direction === 'to' ? 'Edition you want' : 'Your drive';
    rerender(); setUrl();
  }

  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 80); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { const first = results.querySelector('button'); if (first) { e.preventDefault(); first.focus(); } }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); runSearch(false); if (state.items[0]) choose(state.items[0].targets, state.items[0].label); }
  });
  root.addEventListener('keydown', e => {
    const button = e.target.closest?.('.fx-result, .fx-suggest');
    if (!button || !['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return input.focus();
    const scope = button.closest('#fx-results, #drive-detail');
    const all = [...scope.querySelectorAll('.fx-result, .fx-suggest')];
    const i = all.indexOf(button) + (e.key === 'ArrowDown' ? 1 : -1);
    if (i < 0) input.focus(); else all[Math.min(i, all.length - 1)].focus();
  });
  root.addEventListener('click', e => {
    const t = e.target.closest?.('[data-result], [data-key], [data-keys], [data-query], [data-mode], [data-mode-link]');
    if (!t || t.matches('[data-firmware-package]')) return;
    if (t.matches('[data-mode-link]')) { e.preventDefault(); state.current = t.dataset.key; setMode('crossflash'); win.scrollTo?.(0, root.offsetTop); return; }
    if (t.matches('[role="tab"]')) return setMode(t.dataset.mode);
    if (t.dataset.result !== undefined) { const item = state.items[Number(t.dataset.result)]; if (item) choose(item.targets, item.label); return; }
    if (t.dataset.key) return showIdentity(t.dataset.key);
    if (t.dataset.keys) { input.value = ''; results.innerHTML = ''; state.known = {}; return choose(t.dataset.keys.split(','), t.dataset.label); }
    if (t.dataset.query) { input.value = t.dataset.query; runSearch(); input.focus(); }
  });
  root.querySelector('[role="tablist"]').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); setMode(state.mode === 'firmware' ? 'crossflash' : 'firmware', true);
  });
  for (const radio of root.querySelectorAll('input[name="fx-direction"]')) radio.addEventListener('change', () => {
    state.direction = radio.value; setMode(state.mode);
  });
  const browse = $('fx-browse');
  browse?.addEventListener('toggle', () => {
    const body = $('fx-browse-body');
    if (browse.open && !body.innerHTML) body.innerHTML = renderBrowse(browseTree(index));
  });

  const route = routeFromUrl(index, win.location.search);
  state.known = route.known;
  if (route.mode === 'crossflash') setMode('crossflash');
  if (route.query) { input.value = route.query; runSearch(route.view !== 'identity' && route.view !== 'picker'); }
  if (route.view === 'identity') showIdentity(route.keys[0], false);
  else if (route.view === 'picker') choose(route.keys, route.known.hardware ? `Hardware ${route.known.hardware}` : `ID ${route.known.destination}`);
}
