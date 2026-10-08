import { latestFirmwareArchive } from '../../src/lib/firmware-archive.mjs';

export function onRequest({ request, env }) {
  return latestFirmwareArchive(request, env);
}
