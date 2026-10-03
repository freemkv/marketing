import mediatek from '../../src/data/firmware-index.json';
import pioneer from '../../src/data/pioneer-firmware-index.json';
import {catalogueKeys, firmwareDownload} from '../../src/lib/firmware-download.mjs';

const allowedKeys = catalogueKeys(mediatek, pioneer);
export function onRequest({request, env}) {
  return firmwareDownload(request, env, allowedKeys);
}
