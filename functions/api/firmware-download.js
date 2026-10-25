import catalog from '../../src/data/finder-catalog.json';
import {downloadAllowlist, firmwareDownload} from '../../src/lib/firmware-download.mjs';

import {validateOriginDetails} from '../../src/lib/firmware-origin.mjs';

validateOriginDetails(catalog);
const allowlist = downloadAllowlist({catalog});
export function onRequest({request, env}) {
  return firmwareDownload(request, env, allowlist);
}
