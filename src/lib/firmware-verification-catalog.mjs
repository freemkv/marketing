const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

// FW2 keys identify the firmware bytes, independently of catalogue names,
// revision labels, package containers and catalogue order.
export function verificationKey(identity, revision, pkg) {
  const family = identity.family || (identity.key?.startsWith('mediatek:') ? 'mediatek'
    : identity.key?.startsWith('pioneer:') ? 'pioneer' : '');
  if (family === 'mediatek') {
    const image = pkg.imageSha256 || (pkg.packageType === 'mediatek-image' ? pkg.sha256 : null);
    return sha256(image) ? `fw2|mediatek|${image}` : null;
  }
  if (family === 'pioneer' && sha256(pkg.normalSha256) && (!pkg.kernelSha256 || sha256(pkg.kernelSha256))) {
    return `fw2|pioneer|${pkg.kernelSha256 || ''}:${pkg.normalSha256}`;
  }
  return null;
}

export function verificationCatalog(page) {
  const builds = new Map();
  for (const version of page.versions) {
    if (!version.verification) continue;
    const identity = page.identities[version.i];
    builds.set(version.verification, {
      label: `${identity.brand} ${identity.n} ${version.r}${identity.e ? ` ${identity.e}` : ''}`,
      identity: version.i, targets: new Set(),
    });
  }
  for (const version of page.versions) {
    const build = builds.get(version.verification);
    if (!build) continue;
    for (const [, , rows] of page.identities[version.i].x) for (const [, vi, incomplete, future] of rows) {
      const key = page.versions[vi].verification;
      if (!incomplete && !future && key && key !== version.verification) build.targets.add(key);
    }
  }
  return builds;
}
