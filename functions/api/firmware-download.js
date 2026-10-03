import mediatek from '../../src/data/firmware-index.json';
import pioneer from '../../src/data/pioneer-firmware-index.json';
import catalog from '../../src/data/finder-catalog.json';
import legacyKeys from '../../src/data/legacy-keys.json';
import {downloadAllowlist, firmwareDownload} from '../../src/lib/firmware-download.mjs';

const allowlist = downloadAllowlist({catalog, mediatek, pioneer, legacyKeys});
export function onRequest({request, env}) {
  return firmwareDownload(request, env, allowlist);
}
