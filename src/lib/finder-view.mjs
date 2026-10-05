// HTML renderers for /firmware/find/. Pure string builders: the page wires
// events; tests assert on the markup. Every value from data is escaped.
import { DISCORD_URL, componentsLabel, isSoldAs } from './finder.mjs';

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const GLOSSARY = {
  hardware: 'The drive’s board generation, for example SAT 9201 on Pioneer or “BH16NS40 NS50” on LG. Firmware only fits drives with the same hardware.',
  id: 'The edition code the drive reports, for example ID43 on Pioneer or a letter on LG/ASUS drives. The same hardware sold in different regions or by different brands has different IDs.',
  revision: 'The firmware version number, for example 1.02. A higher number is newer.',
  crossflash: 'Putting firmware made for another edition of the same hardware onto your drive, which changes its ID.',
};

/** Inline glossary term: the tip is in the DOM (read by screen readers) and shown on hover/focus. */
export function gloss(term, label = term) {
  const tip = GLOSSARY[term];
  if (!tip) return esc(label);
  return `<span class="gloss" tabindex="0">${esc(label)}<span class="gloss-tip" role="tooltip"> (${esc(tip)})</span></span>`;
}

export const HOW_TO_FIND_ID =
  '<div class="fx-howto"><p class="fx-howto-title">How to find your hardware and ID</p><ul>' +
  '<li>In <strong>MakeMKV</strong>, open the drive information. Pioneer drives show lines such as ' +
  '<code>Drive platform: Pioneer RS8410</code> (hardware 8410) and <code>Firmware version: ID84</code> (ID84). ' +
  'You can paste the whole block into the search box.</li>' +
  '<li>Windows Device Manager, macOS System Information and MakeMKV show the name and revision the drive reports, ' +
  'for example <code>PIONEER BD-RW BDR-UD02D 1.01</code>. Paste that too.</li></ul></div>';

const STATUS = {
  proven: { badge: '★ Proven', cls: 'fx-badge-proven', lead: 'Done on real hardware. Follow these steps exactly.' },
  likely: { badge: 'Likely', cls: 'fx-badge-likely', lead: 'Not yet confirmed on a drive. The two editions’ kernels differ only in the ID label, model name and checksum.' },
  untested: { badge: 'Untested', cls: 'fx-badge-untested', lead: 'Nobody has reported this conversion. It may fail or leave the drive unusable. Only try it if you can recover the drive.' },
};

function sameRule(identity) {
  return identity.family === 'mediatek'
    ? 'Only drives on the same board (same chipset, loader and board; desktop and slim never mix) can cross-flash.'
    : 'Only drives with the same hardware can cross-flash.';
}

export function editionLabel(identity) {
  return `${identity.family === 'pioneer' ? 'SAT ' : ''}${identity.hardware} · ${identity.destination}`;
}

function bytesLabel(n) {
  if (!Number.isFinite(n)) return '';
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

/** Download control. Protected builds go through Turnstile + /api/firmware-download. */
export function downloadButton(pkg, { protectedDownloads = false, baseUrl = '' } = {}, label = 'Download', cls = 'btn btn-primary dl-btn drive-fw-btn') {
  const attrs = protectedDownloads
    ? `href="/firmware/find/" data-firmware-package="${esc(pkg.sha256)}" data-filename="${esc(pkg.filename)}"`
    : `href="${esc(baseUrl + '/' + (pkg.file ?? pkg.key))}" download="${esc(pkg.filename)}"`;
  return `<a class="${cls}" ${attrs}><span class="dl-main">${esc(label)}</span></a>`;
}

// Evidence refs can be bare hashes; only show ones a person can read.
function readableRef(evidence) {
  const ref = evidence?.find(e => e.ref && !/^[a-f0-9]{32,}$/i.test(e.ref.trim()))?.ref;
  return ref ? (ref.length > 90 ? ref.slice(0, 87) + '…' : ref) : '';
}

function itemButton(item, index) {
  return `<li><button type="button" class="fx-result" data-result="${index}">` +
    `<span class="fx-result-name">${esc(item.label)}</span>` +
    (item.targets.length > 1 ? `<span class="fx-result-count">${item.targets.length} editions</span>` : '') +
    `<span class="fx-why">${esc(item.why)}${readableRef(item.evidence) ? ` · seen in “${esc(readableRef(item.evidence))}”` : ''}</span></button></li>`;
}

/** Search results: exact -> same drive, other names -> similar. Items are numbered in display order. */
export function renderResults(result, { suggestions = [] } = {}) {
  const sections = [['exact', 'Exact match'], ['otherNames', 'Same drive under other names'], ['similar', 'Similar names']];
  let n = 0, html = '';
  const items = [];
  for (const [key, title] of sections) {
    const list = result[key] ?? [];
    if (!list.length) continue;
    html += `<section class="fx-group" aria-label="${esc(title)}"><h3 class="fx-group-title">${esc(title)}</h3><ul class="fx-list">` +
      list.map(item => { items.push(item); return itemButton(item, n++); }).join('') + '</ul></section>';
  }
  if (!n) {
    const p = result.parsed ?? {};
    const edition = [p.hardware && `hardware ${p.hardware}`, p.destination].filter(Boolean).join(' and ');
    html = '<div class="fx-empty" role="status">' +
      (edition ? `<p><strong>We don’t have firmware for ${esc(edition)} yet.</strong> If you have its updater, please <a href="${DISCORD_URL}">share it on Discord</a>.</p>` : '') +
      '<p><strong>No drive matches that.</strong> Try the model printed on the drive, ' +
      'the name your computer shows for it, or hardware plus ID such as <code>8510 ID19</code>.</p>' +
      (suggestions.length ? '<p>Did you mean: ' + suggestions.map(s => `<button type="button" class="fx-suggest" data-query="${esc(s)}">${esc(s)}</button>`).join(' ') + '</p>' : '') +
      '<p>Or browse by brand below. Drive missing entirely? Tell us on <a href="' + DISCORD_URL + '">Discord</a>.</p></div>';
  }
  return { html, items };
}

/** Explainer + picker when one name covers several hardware/ID editions. */
export function renderPicker(name, options) {
  const title = /^Hardware /.test(name) ? `${esc(name)} comes in ${options.length} editions` : `“${esc(name)}” was sold in ${options.length} editions`;
  return `<div class="fx-picker"><h3 class="card-title">${title}</h3>` +
    `<p class="fx-lead">Drives sold under one name can differ inside. Firmware has to match both the ${gloss('hardware')} and the ${gloss('id', 'ID')} ` +
    'your drive reports, so pick the edition your drive shows.</p>' +
    '<ul class="fx-list">' + options.map(o =>
      `<li><button type="button" class="fx-result" data-key="${esc(o.key)}">` +
      `<span class="fx-result-name">${esc(editionLabel(o))}</span>` +
      `<span class="fx-why">${o.soldAs.length ? 'Sold as ' + esc(o.soldAs.slice(0, 6).join(', ')) : ''}` +
      `${o.brands.length ? ' · ' + esc(o.brands.join(', ')) : ''}${o.newest ? ' · newest ' + esc(o.newest) : ''} · ${o.revisionCount} revision${o.revisionCount === 1 ? '' : 's'}</span>` +
      '</button></li>').join('') + '</ul>' + HOW_TO_FIND_ID + '</div>';
}

function facts(identity, pkg) {
  let out = '';
  const chip = pkg.chipset || identity.platforms[0];
  if (chip) out += `<span class="drive-fact">${esc(chip)}</span>`;
  out += `<span class="drive-fact">${gloss('hardware', 'Hardware')} ${esc(identity.family === 'pioneer' ? 'SAT ' + identity.hardware : identity.hardware)}</span>`;
  out += `<span class="drive-fact">${gloss('id', 'ID')} ${esc(identity.destination)}</span>`;
  const contents = pkg.packageType === 'pioneer-installer' ? componentsLabel(pkg.components) : null;
  if (contents) out += `<span class="drive-fact">${contents}</span>`;
  if (pkg.media) out += `<span class="drive-fact">${esc(pkg.media)}</span>`;
  if (pkg.variant) out += `<span class="drive-fact drive-fact-variant" title="Region/SKU code">${esc(pkg.variant)}</span>`;
  if (pkg.confidence === 'hardware-verified') out += '<span class="drive-fact drive-fact-verified" title="Proven on real hardware">Hardware-verified</span>';
  else if (pkg.confidence === 'build-verified') out += '<span class="drive-fact drive-fact-buildver" title="Strict build + KAT verified; not yet flashed &amp; tested on hardware">Build-verified</span>';
  return `<div class="drive-facts">${out}</div>`;
}

/** MediaTek feature badges (unchanged behaviour: only for modifiable images). */
export function featureBadges(pkg) {
  if (pkg.modifiable !== true) return '';
  if (pkg.baseOnly) return '<div class="drive-caps drive-caps-base"><span class="drive-caps-label">Features</span>' +
    '<span class="drive-cap drive-cap-on">Identity</span><span class="drive-cap drive-cap-on">Save / Reset</span>' +
    '<span class="drive-cap-note">Base only — unlock flags pending hardware validation</span></div>';
  if (!pkg.features?.length) return '';
  return '<div class="drive-caps"><span class="drive-caps-label">Features</span>' +
    pkg.features.map(f => `<span class="drive-cap ${f.ok ? 'drive-cap-on' : 'drive-cap-off'}">${esc(f.name)}</span>`).join('') + '</div>';
}

function checkIcon(ok) {
  return ok === true ? '<span class="fx-check fx-check-ok" aria-label="Matches">✓</span>'
    : ok === false ? '<span class="fx-check fx-check-bad" aria-label="Does not match">✗</span>'
      : '<span class="fx-check fx-check-ask" aria-label="Check this">?</span>';
}

function crossflashLink(identity, label) {
  const q = new URLSearchParams({ mode: 'crossflash', hw: identity.hardware, id: identity.destination });
  return `<a href="/firmware/find/?${esc(q.toString())}" data-mode-link="crossflash" data-key="${esc(identity.key)}">${esc(label)}</a>`;
}

/** Result view for one exact identity. */
export function renderIdentity(view, opts = {}) {
  const { identity, checklist, recommended, timeline } = view;
  const names = [...new Set(view.names.filter(isSoldAs).map(a => a.display))];
  const mismatch = checklist.some(c => (c.term === 'hardware' || c.term === 'id') && c.ok === false);
  const pkg = recommended?.package;
  let html = '<div class="drive-detail-head">' +
    `<h3 class="card-title drive-title">${esc([identity.brands[0], (identity.family === 'pioneer' && identity.embeddedModels[0]) || names[0] || identity.embeddedModels[0] || identity.hardware].filter(Boolean).join(' '))}</h3>` +
    (recommended ? `<span class="drive-rev">${gloss('revision', 'rev')} ${esc(recommended.revision)}</span>` : '') + '</div>';
  if (names.length > 1) html += `<p class="fx-aka">Also sold as ${esc(names.slice(1, 12).join(', '))}${names.length > 13 ? '…' : ''}</p>`;
  if (pkg) html += facts(identity, pkg) + featureBadges(pkg);
  html += '<h4 class="fx-h">Why this is the firmware for your drive</h4><ul class="fx-checklist">' +
    checklist.map(c => `<li>${checkIcon(c.ok)} <span>${esc(c.text)}</span> <span class="fx-term">${gloss(c.term === 'id' ? 'id' : c.term, c.term === 'id' ? 'ID' : c.term)}</span></li>`).join('') + '</ul>';
  if (mismatch) {
    html += '<p class="fx-warn" role="alert"><strong>Do not flash this.</strong> The hardware or ID you entered is different from this edition. ' +
      'Pick the edition your drive reports, or see whether a cross-flash exists.</p>';
  } else if (pkg) {
    html += '<div class="fx-recommend">' + downloadButton(pkg, opts, `Download ${recommended.revision}`) +
      `<span class="fx-file">${esc(pkg.filename)}${pkg.bytes ? ' · ' + bytesLabel(pkg.bytes) : ''}</span>` +
      (pkg.modifiable ? `<div class="drive-fw-hint"><span class="drive-fw-hint-label">Then build it:</span><code class="drive-fw-cmd">freemkv-fw create ${esc(pkg.filename)} my-drive.freemkv.bin</code></div>` : '') +
      '</div>';
  } else {
    html += `<p class="fx-warn">We don’t host firmware for this edition yet. Have it? <a href="${DISCORD_URL}">Donate it on Discord →</a></p>`;
  }
  if (view.provenance) html += `<p class="fx-provenance"><strong>Where it comes from:</strong> ${esc(view.provenance)}</p>`;
  html += `<h4 class="fx-h">Every ${gloss('revision')} for ${esc(editionLabel(identity))}</h4><ol class="fx-timeline">` +
    timeline.map(t => '<li class="fx-rev' + (t.status === 'missing' ? ' fx-rev-missing' : '') + '">' +
      `<span class="fx-rev-num">${esc(t.revision)}</span>` +
      (t.isRecommended ? ' <span class="fx-tag">newest</span>' : '') + (t.isCurrent ? ' <span class="fx-tag fx-tag-yours">yours</span>' : '') +
      (t.status === 'missing'
        ? ` <span class="fx-missing">Known to exist, but we don’t have it. <a href="${DISCORD_URL}">Donate it on Discord</a></span>`
        : (mismatch ? '' : ' ' + t.packages.map((p, i) => downloadButton(p, opts, t.packages.length > 1 ? `Download (${componentsLabel(p.components) || 'package ' + (i + 1)})` : 'Download', 'fx-rev-dl')).join(' '))) +
      '</li>').join('') + '</ol>';
  if (pkg) {
    const all = timeline.flatMap(t => t.packages.map(p => [t.revision, p]));
    html += '<details class="fx-details"><summary>Details: hashes and package contents</summary><table class="fx-table"><thead><tr><th scope="col">Revision</th><th scope="col">File</th><th scope="col">Contents</th><th scope="col">SHA-256</th></tr></thead><tbody>' +
      all.map(([rev, p]) => `<tr><td>${esc(rev)}</td><td>${esc(p.filename)}${p.bytes ? ' (' + bytesLabel(p.bytes) + ')' : ''}</td><td>${esc(componentsLabel(p.components) || (p.packageType === 'mediatek-image' ? 'Firmware image' : 'Package'))}${p.advertisedVersions?.length ? '; published as ' + esc(p.advertisedVersions.join(', ')) : ''}</td><td><code class="fx-sha">${esc(p.sha256)}</code></td></tr>`).join('') +
      '</tbody></table></details>';
  }
  html += renderFamilyCrossflash(view, opts);
  html += renderConvertSummary(view, opts);
  return html;
}

/**
 * Pioneer family cross-flash list: candidate drives in the same hardware
 * family that ship both Kernel and Normal (required for cross-era flashing).
 * Rendered under the Versions timeline in the same visual style.
 */
export function renderFamilyCrossflash(view, opts = {}) {
  const list = view.familyCrossflash ?? [];
  if (!list.length) return '';
  const items = list.map(c => {
    const other = c.identity;
    const label = editionLabel(other) + (other.embeddedModels[0] ? ' — ' + other.embeddedModels[0] : '');
    const uhd = c.isUhd ? ' <span class="fx-tag">UHD</span>' : '';
    const latestRev = other.revisions[0];
    const pkg = latestRev?.packages?.find(p => (p.components ?? []).includes('kernel') && (p.components ?? []).includes('main')) ?? latestRev?.packages?.[0];
    const dl = pkg ? ' ' + downloadButton(pkg, opts, `Download ${latestRev.revision}`, 'fx-rev-dl') : '';
    const q = new URLSearchParams({ hw: other.hardware, id: other.destination });
    return `<li class="fx-rev"><a class="fx-xf-target" href="/firmware/find/?${esc(q.toString())}" data-key="${esc(other.key)}">${esc(label)}</a>${uhd}` +
      (c.latest ? ` <span class="fx-rev-num">${esc(c.latest)}</span>` : '') + dl + '</li>';
  }).join('');
  return `<section class="fx-group" aria-label="Cross flash"><h4 class="fx-h">Cross flash <span class="fx-term">${gloss('crossflash', 'what is this?')}</span></h4>` +
    `<ol class="fx-timeline">${items}</ol></section>`;
}

/** Compact "Convert to another edition" section inside the firmware view. */
export function renderConvertSummary(view) {
  const g = view.crossflash;
  const total = g.proven.length + g.likely.length + g.untested.length;
  let html = `<section class="fx-convert" aria-label="Convert to another edition"><h4 class="fx-h">Convert to another edition (${gloss('crossflash', 'cross-flash')})</h4>`;
  if (!total) return html + `<p class="fx-muted">No other editions are in the catalogue. ${sameRule(view.identity)}</p></section>`;
  html += '<ul class="fx-convert-list">';
  for (const status of ['proven', 'likely', 'untested']) for (const c of g[status])
    html += `<li><span class="fx-badge ${STATUS[status].cls}">${STATUS[status].badge}</span> ${esc(editionLabel(c.identity))}` +
      (c.names.length ? ` — ${esc(c.names.slice(0, 4).join(', '))}` : '') + '</li>';
  return html + '</ul><p>' + crossflashLink(view.identity, 'See steps, evidence and what changes →') + '</p></section>';
}

/**
 * Cross-flash mode. direction 'from': what `identity` can become;
 * 'to': which editions can become `identity`.
 */
export function renderCrossflash(identity, groups, { direction = 'from', protectedDownloads = false, baseUrl = '' } = {}) {
  const total = groups.proven.length + groups.likely.length + groups.untested.length;
  let html = `<div class="fx-xf"><h3 class="card-title">${direction === 'from'
    ? `What can ${esc(editionLabel(identity))} become?`
    : `Which drives can become ${esc(editionLabel(identity))}?`}</h3>` +
    `<p class="fx-lead">${sameRule(identity)} Other drives are never shown here, whatever their name. ` +
    `${gloss('crossflash', 'Cross-flashing')} changes your drive’s ${gloss('id', 'ID')}.</p>`;
  if (!total) return html + '<p class="fx-empty">No other editions it can cross-flash with are in the catalogue yet.</p></div>';
  for (const status of ['proven', 'likely', 'untested']) {
    const list = groups[status];
    if (!list.length) continue;
    html += `<section class="fx-xf-group" aria-label="${esc(STATUS[status].badge.replace('★ ', ''))}"><h4 class="fx-h"><span class="fx-badge ${STATUS[status].cls}">${STATUS[status].badge}</span></h4>` +
      `<p class="${status === 'untested' ? 'fx-warn' : 'fx-muted'}">${esc(STATUS[status].lead)}</p>`;
    for (const c of list) {
      const other = c.identity;
      const target = direction === 'from' ? other : identity;
      const pkg = target.revisions[0]?.packages[0];
      html += `<article class="fx-xf-card" aria-label="${esc(editionLabel(other))}"><h5 class="fx-xf-title">${direction === 'from' ? 'Become' : 'From'} ${esc(editionLabel(other))}</h5>` +
        (c.names.length ? `<p class="fx-aka">${direction === 'from' ? 'Sold as' : 'Drives sold as'} ${esc(c.names.slice(0, 10).join(', '))}</p>` : '') +
        (c.latest ? `<p class="fx-muted">Latest available ${gloss('revision')}: ${esc(c.latest)}</p>` : '') +
        '<p class="fx-sub">What changes</p><ul>' + c.changes.map(x => `<li>${esc(x.text)}</li>`).join('') + '</ul>';
      if (c.steps?.length) html += '<p class="fx-sub">Steps</p><ol class="fx-steps">' + c.steps.map(stepText).map(s => `<li>${esc(s)}</li>`).join('') + '</ol>';
      if (c.evidence?.length) html += '<p class="fx-sub">Evidence</p><ul class="fx-evidence">' + c.evidence.map(e =>
        `<li>${e.quote ? `“${esc(e.quote)}”` : esc(e.ref || '')}${e.source ? ' <span class="fx-muted">(' + esc(e.source) + (e.date ? ', ' + esc(e.date) : '') + ')</span>' : ''}</li>`).join('') + '</ul>';
      if (c.kernelDiff && status !== 'proven') html += `<p class="fx-muted">Measured: the two editions’ kernels differ in ${esc(c.kernelDiff.bytes)} of ${esc(c.kernelDiff.size)} bytes (${esc(c.kernelDiff.kinds.map(k => k.replace('-', ' ')).join(', '))}).</p>`;
      if (c.caution === 'oem-change') html += `<p class="fx-warn"><strong>Caution: OEM change on the same board, untested unless reported.</strong> This changes the brand edition the drive reports.</p>`;
      if (pkg) html += '<div class="fx-recommend">' +
        downloadButton(pkg, { protectedDownloads, baseUrl }, `${status === 'untested' ? 'Untested cross-flash' : 'Cross-flash'} download: ${editionLabel(target)} ${target.revisions[0].revision}`, 'btn btn-secondary dl-btn drive-fw-btn') +
        `<span class="fx-file">This is firmware for ${esc(editionLabel(target))}, not your current edition.</span></div>`;
      html += `<p><a class="fx-report" href="${DISCORD_URL}" rel="noopener">Report your result on Discord →</a></p></article>`;
    }
    html += '</section>';
  }
  return html + '</div>';
}

function stepText(step) {
  if (typeof step === 'string') return step;
  const where = step.identity ? ` (${step.identity.replace(/^pioneer:/, 'SAT ').replace(/:/g, ' · ')})` : '';
  if (step.action === 'downgrade') return `Downgrade from ${step.from_revision} to ${step.to_revision}${step.tool ? ' using ' + step.tool : ''}${where}`;
  if (step.action === 'crossflash') return `Cross-flash to ${step.revision}${where}${step.tool ? ' using ' + step.tool : ''}`;
  if (step.action === 'update') return `Update to ${step.revision}${step.tool ? ' using the ' + step.tool.replace(/^the /, '') : ''}${where}`;
  return [step.action, step.revision, step.tool].filter(Boolean).join(' ') + where;
}

/** Browse fallback: brand -> chipset family -> hardware (counts are revisions). */
export function renderBrowse(tree) {
  return '<div class="fx-browse">' + tree.map(b =>
    `<details class="fx-browse-brand"><summary>${esc(b.brand)} <span class="fx-count">${b.revisions}</span></summary>` +
    b.families.map(f => `<details class="fx-browse-family"><summary>${esc(f.family)} <span class="fx-count">${f.revisions}</span></summary><ul class="fx-browse-hw">` +
      f.hardware.map(h => `<li><button type="button" class="fx-link" data-keys="${esc(h.keys.join(','))}" data-label="Hardware ${esc(h.hardware)}">${esc(h.hardware)}</button> <span class="fx-count">${h.editions} edition${h.editions === 1 ? '' : 's'}, ${h.revisions} revision${h.revisions === 1 ? '' : 's'}</span></li>`).join('') +
      '</ul></details>').join('') + '</details>').join('') + '</div>';
}
