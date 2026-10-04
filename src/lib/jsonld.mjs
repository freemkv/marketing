// Shared schema.org JSON-LD nodes for freemkv.org. One source of truth for the
// WebSite / Organization / SoftwareApplication entities, referenced by `@id`
// from every page (astro.config.mjs emits the site graph on docs pages; the
// standalone pages under src/pages/ build their own graph from these helpers).
//
// No versions, ratings, or reviews on purpose: release versions are resolved
// client-side from GitHub, so a build-time `softwareVersion` would drift.

export const SITE = 'https://freemkv.org';
export const ICON = `${SITE}/freemkv-icon.svg`;
export const ID = {
  website: `${SITE}/#website`,
  org: `${SITE}/#org`,
  app: `${SITE}/#app`,
  fw: `${SITE}/firmware/modify/#app`,
  flash: `${SITE}/firmware/flash/#app`,
};

const SITE_DESCRIPTION =
  'MIT Rust toolchain that rips and muxes DVD, Blu-ray, and 4K UHD to MKV with AACS/CSS decryption and multi-pass bad-sector recovery.';

const MIT = 'https://opensource.org/licenses/MIT';
const FREE = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };

export const websiteNode = () => ({
  '@type': 'WebSite',
  '@id': ID.website,
  url: `${SITE}/`,
  name: 'freemkv',
  description: SITE_DESCRIPTION,
  inLanguage: 'en',
  publisher: { '@id': ID.org },
});

export const orgNode = () => ({
  '@type': 'Organization',
  '@id': ID.org,
  name: 'freemkv',
  url: `${SITE}/`,
  logo: ICON,
  sameAs: ['https://github.com/freemkv'],
});

/** The main freemkv application (app + CLI + server). */
export const appNode = (extra = {}) => ({
  '@type': 'SoftwareApplication',
  '@id': ID.app,
  name: 'freemkv',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Windows, macOS, Linux',
  url: `${SITE}/`,
  downloadUrl: `${SITE}/download/`,
  license: MIT,
  isAccessibleForFree: true,
  author: { '@id': ID.org },
  publisher: { '@id': ID.org },
  offers: FREE,
  ...extra,
});

/** A freemkv-firmware tool (freemkv-fw / freemkv-flash). */
export const firmwareToolNode = ({ id, name, description, url }) => ({
  '@type': 'SoftwareApplication',
  '@id': id,
  name,
  description,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Windows, macOS, Linux',
  url,
  downloadUrl: 'https://github.com/freemkv/freemkv-firmware/releases',
  installUrl: url,
  license: MIT,
  isAccessibleForFree: true,
  author: { '@id': ID.org },
  publisher: { '@id': ID.org },
  offers: FREE,
  isRelatedTo: { '@id': ID.app },
});

/** WebPage node for a standalone (non-docs) page. `path` like '/download/'. */
export const webPageNode = ({ path, name, description, about, type = 'WebPage' }) => ({
  '@type': type,
  '@id': `${SITE}${path}#webpage`,
  url: `${SITE}${path}`,
  name,
  description,
  inLanguage: 'en',
  isPartOf: { '@id': ID.website },
  ...(about ? { about: { '@id': about }, mainEntity: { '@id': about } } : {}),
  primaryImageOfPage: ICON,
  ...(path === '/' ? {} : { breadcrumb: { '@id': `${SITE}${path}#breadcrumb` } }),
});

/** BreadcrumbList. `trail` = [[name, path], ...] from the home page down. */
export const breadcrumbNode = (path, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': `${SITE}${path}#breadcrumb`,
  itemListElement: trail.map(([name, p], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: `${SITE}${p}`,
  })),
});

/** Wrap nodes into one JSON-LD document string (for set:html). */
export const graph = (...nodes) =>
  JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
