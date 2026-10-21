// Publish reviewed customer notes. Release metadata controls which version is
// public; upstream development prose is never imported into the website.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchRelease } from '../src/lib/releases.mjs';

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}|Unreleased))?\s*$/;
const INTERNAL_HEADING = /^#{3,}\s+(?:development|build(?:s)?|ci(?:\/cd)?|testing|validation|internal|maintenance)\b/im;
const compare = (a, b) => {
  const av = a.split('.').map(Number), bv = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (av[i] !== bv[i]) return av[i] - bv[i];
  return 0;
};

export function flashChangelog(source, release = {}) {
  const sections = [];
  let current;
  for (const line of source.split('\n')) {
    if (/^## /.test(line)) {
      const match = VERSION_HEADING.exec(line);
      const published = match && match[1] === release.version;
      current = match && (match[2] !== 'Unreleased' || published)
        && (!release.version || compare(match[1], release.version) <= 0)
        ? { version: match[1], date: match[2] === 'Unreleased' ? release.date : match[2], lines: [] }
        : null;
      if (current) sections.push(current);
    } else if (current) current.lines.push(line);
  }
  if (release.version && !sections.some(section => section.version === release.version)) {
    throw new Error(`flash changelog: add reviewed customer notes for ${release.version} before publishing`);
  }
  const rendered = sections.map(section => {
    const body = section.lines.join('\n').trim();
    if (!body) throw new Error(`flash changelog: empty customer notes for ${section.version}`);
    if (INTERNAL_HEADING.test(body)) throw new Error(`flash changelog: internal section in ${section.version}; publish customer impact only`);
    return [`## ${section.version}`, '', ...(section.date ? [`<small>${section.date}</small>`, ''] : []), body, ''].join('\n');
  });
  if (!rendered.length) throw new Error('flash changelog: no reviewed releases');
  return ['---', 'title: Flash Changelog', "description: What's new in freemkv Flash and Modify - newest first.", '---', '', rendered.join('\n')].join('\n');
}

export async function generate({ getRelease = fetchRelease, sourcePath, outPath } = {}) {
  const root = dirname(fileURLToPath(import.meta.url));
  const release = await getRelease('freemkv-firmware');
  const source = sourcePath ?? resolve(root, '../src/data/flash-changelog.md');
  const out = outPath ?? resolve(root, '../src/content/docs/docs/flash-changelog.md');
  const rendered = flashChangelog(readFileSync(source, 'utf8'), release);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rendered);
  console.log(`flash changelog: published reviewed notes through ${release.tag}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await generate();
