// Content identity, independent of the TAR filename/hash and catalogue order.
export function verificationKey(identity, revision, pkg) {
  const content = pkg.imageSha256 || (pkg.normalSha256 && [pkg.kernelSha256 || '', pkg.normalSha256].join(':'));
  if (!content) return null;
  return ['fw1', encodeURIComponent(identity.key), encodeURIComponent(revision), content].join('|');
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
