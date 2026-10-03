// CI verifies full bytes over the authenticated R2 API after public access is off.
// Browser downloads never receive these credentials or a privileged bypass.
const PUBLIC_ORIGIN = 'https://pub-10fe57a98db44568abcfb5db130d3b3f.r2.dev';
export function firmwareObjectFetcher(env = process.env, fetcher = fetch) {
  const mode = env.FIRMWARE_R2_ACCESS || 'public';
  if (mode === 'public') return fetcher;
  if (mode !== 'private') throw new Error('FIRMWARE_R2_ACCESS must be public or private');
  if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.CLOUDFLARE_API_TOKEN)
    throw new Error('Explicit Cloudflare account and API token required for private verification');
  return (input, options = {}) => {
    const url = new URL(input);
    if (url.origin !== PUBLIC_ORIGIN || url.search || url.hash)
      throw new Error('Unexpected firmware verification URL');
    // Existing keys are URL-escaped once. Keep path separators literal as R2's
    // REST API requires; don't decode/re-encode percent escapes a second time.
    const target = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/freemkv-firmware/objects${url.pathname}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    return fetcher(target, {...options, method:'GET', redirect:'error', headers});
  };
}
