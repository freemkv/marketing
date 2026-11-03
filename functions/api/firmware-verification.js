import mediatek from '../../src/data/firmware-index.json';
import legacy from '../../src/data/pioneer-firmware-index.json';
import catalog from '../../src/data/finder-catalog.json';
import crossflash from '../../src/data/crossflash-links.json';
import {buildFinderData, finderPageData} from '../../src/lib/finder.mjs';
import {verificationCatalog} from '../../src/lib/firmware-verification-catalog.mjs';
import {firmwareVerification} from '../../src/lib/firmware-verification.mjs';

let builds;
export function onRequest({request, env}) {
  builds ??= verificationCatalog(finderPageData(buildFinderData({catalog, mediatek, crossflash}), {legacy, keys: false}));
  return firmwareVerification(request, env, builds);
}
