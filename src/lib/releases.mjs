// Resolve once per build process. Failure stops publication of stale metadata.
const pending = new Map();
export function latestRelease(repo) {
  if (!pending.has(repo)) pending.set(repo, fetchRelease(repo));
  return pending.get(repo);
}
export async function fetchStableRelease(repo, request = fetch) {
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
