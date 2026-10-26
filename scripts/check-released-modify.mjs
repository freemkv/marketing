import { readFile } from 'node:fs/promises';
import { fetchStableRelease } from '../src/lib/releases.mjs';
import { validateReleasedModify } from '../src/lib/released-modify.mjs';

const manifest = JSON.parse(await readFile(process.argv[2] ?? 'src/data/firmware-capabilities.json', 'utf8'));
const release = await fetchStableRelease('freemkv-firmware');
const asset = validateReleasedModify(manifest, release);
console.log(`Modify capability producer verified against ${release.tag_name}/${asset}`);
