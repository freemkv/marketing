// Resolve once per build process. Failure stops publication of stale metadata.
const pending = new Map();
export function latestRelease(repo) {
  if (!pending.has(repo)) pending.set(repo, fetchRelease(repo));
  return pending.get(repo);
}
// A freemkv-firmware release deploys the website BEFORE its binaries are
// published: its release workflow passes the staged draft's provenance
// ({tag, assets: {name: sha256}}) as FREEMKV_RELEASE_PROVENANCE, and that
// release stands in for "latest" during this deploy.
export function pendingRelease(repo, provenance = process.env.FREEMKV_RELEASE_PROVENANCE, now = new Date()) {
  if (repo !== 'freemkv-firmware' || !provenance) return null;
  const { tag, assets } = JSON.parse(provenance);
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || !assets || typeof assets !== 'object' || Array.isArray(assets)) {
    throw new Error('Invalid pending freemkv-firmware release provenance');
  }
  const list = Object.entries(assets).map(([name, sha256]) => {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`Invalid pending release checksum for ${name}`);
    return { name, digest: `sha256:${sha256}` };
  });
  return { tag_name: tag, draft: false, prerelease: false, published_at: now.toISOString(), assets: list };
}
export async function fetchStableRelease(repo, request = fetch) {
  const pending = pendingRelease(repo);
  if (pending) return pending;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const response = await request(`https://api.github.com/repos/freemkv/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Latest release for ${repo}: HTTP ${response.status}`);
  const release = await response.json();
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || !Number.isFinite(Date.parse(release.published_at))) {
    throw new Error(`Invalid stable release metadata for ${repo}`);
  }
  return release;
}
export async function fetchRelease(repo, request = fetch) {
  const release = await fetchStableRelease(repo, request);
  return { tag: release.tag_name, version: release.tag_name.slice(1), date: new Date(release.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) };
}
