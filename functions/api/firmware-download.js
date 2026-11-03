import catalog from '../../src/data/finder-catalog.json';
import {downloadAllowlist, firmwareDownload} from '../../src/lib/firmware-download.mjs';

import {validateOriginDetails} from '../../src/lib/firmware-origin.mjs';

let allowlist;
export function onRequest({request, env}) {
  if (!allowlist) {
    validateOriginDetails(catalog);
    allowlist = downloadAllowlist({catalog});
  }
  return firmwareDownload(request, env, allowlist);
}
