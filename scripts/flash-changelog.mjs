// Builds src/content/docs/docs/flash-changelog.md (/docs/flash-changelog/) from
// freemkv-firmware's CHANGELOG.md at its latest published release tag.
//
// That CHANGELOG covers the whole firmware workspace (the freemkv-fw
// MediaTek firmware engine and the freemkv-flash flasher), so it is filtered:
// a changelog block (one top-level bullet or paragraph) is kept only when it
// concerns flashing / freemkv-flash (see FLASH_TOPIC); engine-only blocks,
// sub-headings left empty, and releases left with nothing are dropped.
// Run from astro.config.mjs, so every `astro build` / `astro dev` -- site
// deploys (push to main, workflow_dispatch, the firmware release's refresh)
// and the build tests alike -- regenerates it. The output is gitignored;
// never hand-edit it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchRelease } from '../src/lib/releases.mjs';

export const FLASH_TOPIC =
  /flash|dump|backup|recover|read ?back|restor|preflight|crossflash|pioneer|drive (information|info|list|name)|production record|\bregion|quiet|pureread|inspect|compar|desktop app|\bgui\b|\bcli\b|installer|\.deb|appimage|homebrew|scoop/i;

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/;

function splitBlocks(lines) {
  // -> [{ heading } | { text }] ; continuation/indented/blank lines stay with their block.
  const out = [];
  let cur = null;
  let prevBlank = true;
  for (const line of lines) {
    if (/^### /.test(line)) {
      cur = null;
      out.push({ heading: line });
    } else if (line.trim() === '') {
      if (cur) cur.text.push(line);
    } else if (/^\S/.test(line) && (/^[-*] /.test(line) || prevBlank || !cur)) {
      cur = { text: [line] };
      out.push(cur);
    } else if (cur) {
      cur.text.push(line);
    } else {
      cur = { text: [line] };
      out.push(cur);
    }
    prevBlank = line.trim() === '';
  }
  return out;
}

export function flashChangelog(source) {
  const sections = [];
  let cur = null;
  for (const line of source.split('\n')) {
    if (/^## /.test(line)) {
      const m = VERSION_HEADING.exec(line);
      cur = m ? { version: m[1], date: m[2], lines: [] } : null;
      if (cur) sections.push(cur);
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  const rendered = [];
  for (const s of sections) {
    const kept = [];
    let pendingHeading = null;
    let prevBullet = false;
    for (const b of splitBlocks(s.lines)) {
      if (b.heading) {
        pendingHeading = b.heading;
      } else if (FLASH_TOPIC.test(b.text.join('\n'))) {
        const text = b.text.join('\n').replace(/\s+$/, '');
        const bullet = /^[-*] /.test(text);
        if (pendingHeading) kept.push(...(kept.length ? [''] : []), pendingHeading, '');
        else if (kept.length && !(bullet && prevBullet)) kept.push('');
        pendingHeading = null;
        kept.push(text);
        prevBullet = bullet;
      }
    }
    if (!kept.length) continue;
    rendered.push(
      [`## ${s.version}`, '', ...(s.date ? [`<small>${s.date}</small>`, ''] : []), ...kept, ''].join('\n'),
    );
  }
  if (!rendered.length) throw new Error('flash changelog: no releases matched');
  return [
    '---',
    'title: Flash Changelog',
    "description: What's new in freemkv-flash, the drive flasher and dumper - newest first.",
    '---',
    '',
    rendered.join('\n'),
  ].join('\n');
}

export async function generate() {
  const { tag } = await fetchRelease('freemkv-firmware');
  const url = `https://raw.githubusercontent.com/freemkv/freemkv-firmware/${tag}/CHANGELOG.md`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`flash changelog: ${url}: HTTP ${res.status}`);
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/content/docs/docs/flash-changelog.md');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, flashChangelog(await res.text()));
  console.log(`flash changelog: wrote ${out} from ${tag}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await generate();
