// One deliberately unlisted download; never accepts an object key from a caller.
export const LATEST_ARCHIVE_KEY = 'releases/latest.tar.gz';

export async function latestFirmwareArchive(request, env) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
  });
  const reply = (body, status) => new Response(body, { status, headers });
  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD');
    return reply(null, 405);
  }
  if (!env.FIRMWARE_BUCKET) return reply('Download unavailable.', 503);
  try {
    const metadata = await env.FIRMWARE_BUCKET.head(LATEST_ARCHIVE_KEY);
    if (!metadata) return reply('Archive not found.', 404);
    headers.set('Content-Type', 'application/gzip');
    headers.set('Content-Disposition', 'attachment; filename="firmware-latest.tar.gz"');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('ETag', metadata.httpEtag);
    headers.set('Last-Modified', metadata.uploaded.toUTCString());
    if (metadata.customMetadata?.sha256) headers.set('X-Checksum-SHA256', metadata.customMetadata.sha256);
    if (request.headers.get('If-None-Match') === metadata.httpEtag) return reply(null, 304);
    let offset = 0, length = metadata.size, status = 200;
    const range = request.headers.get('Range');
    const ifRange = request.headers.get('If-Range');
    if (request.method === 'GET' && range && (!ifRange || ifRange === metadata.httpEtag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let end;
      if (!match || (!match[1] && !match[2])) end = -1;
      else if (!match[1]) {
        const suffix = Number(match[2]);
        offset = Math.max(0, metadata.size - suffix);
        end = suffix > 0 ? metadata.size - 1 : -1;
      } else {
        offset = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
      }
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= metadata.size || end < offset) {
        headers.set('Content-Range', `bytes */${metadata.size}`);
        return reply(null, 416);
      }
      length = end - offset + 1;
      status = 206;
      headers.set('Content-Range', `bytes ${offset}-${end}/${metadata.size}`);
    }
    headers.set('Content-Length', String(length));
    if (request.method === 'HEAD') return reply(null, 200);
    // Pin the read to the HEAD result: never combine ranges from two releases.
    const object = await env.FIRMWARE_BUCKET.get(LATEST_ARCHIVE_KEY, {
      onlyIf: { etagMatches: metadata.etag },
      ...(status === 206 ? { range: { offset, length } } : {}),
    });
    if (!object || !object.body) {
      headers.delete('Content-Length');
      headers.delete('Content-Range');
      return reply('Archive changed; retry the download.', 412);
    }
    return reply(object.body, status);
  } catch {
    headers.delete('Content-Length');
    headers.delete('Content-Range');
    return reply('Download unavailable.', 503);
  }
}
